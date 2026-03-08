/**
 * Budget Checker Lambda Function
 * 
 * Enforces budget limits before resource start operations
 * Handles budget overrides with justification
 */

const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require('@aws-sdk/client-cost-explorer');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const ce = new CostExplorerClient({ region: 'us-east-1' });
const sns = new SNSClient({});

const BUDGETS_TABLE = process.env.BUDGETS_TABLE_NAME || 'awsnoozr-prod-budgets';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  const method = event.httpMethod;
  const path = event.path;

  try {
    if (method === 'GET' && path === '/budgets/current') {
      return await getCurrentBudget();
    } else if (method === 'POST' && path === '/budgets') {
      return await createOrUpdateBudget(event);
    } else if (method === 'GET' && path === '/budgets/forecast') {
      return await getForecast();
    } else if (method === 'POST' && path === '/budgets/check') {
      return await checkBudget(event);
    } else if (method === 'POST' && path === '/budgets/override') {
      return await logOverride(event);
    } else {
      return errorResponse(404, 'Not found');
    }
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, error.message);
  }
};

/**
 * Get current budget status
 */
async function getCurrentBudget() {
  const budgetId = getCurrentPeriod();

  const { Item } = await dynamodb.send(
    new GetItemCommand({
      TableName: BUDGETS_TABLE,
      Key: marshall({ budgetId })
    })
  );

  if (!Item) {
    return successResponse({ budget: null, message: 'No budget configured' });
  }

  const budget = unmarshall(Item);

  // Get current spend
  const currentSpend = await getCurrentSpend(budget.scope);

  // Get forecast
  const forecast = await getForecastAmount(budget.scope);

  // Calculate status
  const percentUsed = (currentSpend / budget.amount) * 100;
  const status = percentUsed >= 100 ? 'exceeded' : 
                 percentUsed >= 90 ? 'critical' :
                 percentUsed >= 80 ? 'warning' : 'ok';

  return successResponse({
    budget: {
      ...budget,
      currentSpend,
      forecast,
      percentUsed: Math.round(percentUsed),
      status,
      remaining: Math.max(0, budget.amount - currentSpend)
    }
  });
}

/**
 * Create or update budget
 */
async function createOrUpdateBudget(event) {
  const body = JSON.parse(event.body);

  const budgetId = getCurrentPeriod();

  const budget = {
    budgetId,
    amount: body.amount,
    currency: body.currency || 'USD',
    period: body.period || 'monthly',
    scope: body.scope || { type: 'account' },
    alerts: body.alerts || [
      { threshold: 80, notified: false },
      { threshold: 90, notified: false },
      { threshold: 100, notified: false }
    ],
    enforcement: body.enforcement || {
      preventStartWhenExceeded: true,
      allowOverrideWithReason: true,
      overrideRequiresApproval: false
    },
    createdAt: new Date().toISOString(),
    createdBy: event.requestContext?.authorizer?.claims?.email || 'system'
  };

  await dynamodb.send(
    new PutItemCommand({
      TableName: BUDGETS_TABLE,
      Item: marshall(budget)
    })
  );

  return successResponse({
    budget,
    message: 'Budget created successfully'
  });
}

/**
 * Check if budget allows resource start
 */
async function checkBudget(event) {
  const body = JSON.parse(event.body);
  const { resourceType, resourceId, region, tags } = body;

  const budgetId = getCurrentPeriod();

  const { Item } = await dynamodb.send(
    new GetItemCommand({
      TableName: BUDGETS_TABLE,
      Key: marshall({ budgetId })
    })
  );

  if (!Item) {
    return successResponse({ allowed: true, reason: 'No budget configured' });
  }

  const budget = unmarshall(Item);

  // Check if resource matches budget scope
  if (!matchesBudgetScope(resourceType, tags, region, budget.scope)) {
    return successResponse({ allowed: true, reason: 'Resource not in budget scope' });
  }

  // Get current spend
  const currentSpend = await getCurrentSpend(budget.scope);

  // Check if budget exceeded
  if (currentSpend >= budget.amount) {
    // Check alert thresholds
    await checkAndSendAlerts(budget, currentSpend);

    if (budget.enforcement.preventStartWhenExceeded) {
      return successResponse({
        allowed: false,
        reason: 'Budget exceeded',
        currentSpend,
        budgetAmount: budget.amount,
        percentUsed: Math.round((currentSpend / budget.amount) * 100),
        overrideAvailable: budget.enforcement.allowOverrideWithReason
      });
    }
  }

  return successResponse({
    allowed: true,
    currentSpend,
    budgetAmount: budget.amount,
    percentUsed: Math.round((currentSpend / budget.amount) * 100),
    remaining: budget.amount - currentSpend
  });
}

/**
 * Log budget override
 */
async function logOverride(event) {
  const body = JSON.parse(event.body);
  const { resourceId, resourceType, reason } = body;
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  console.log(JSON.stringify({
    action: 'budget-override',
    resourceId,
    resourceType,
    reason,
    user: userEmail,
    timestamp: new Date().toISOString()
  }));

  // Send notification
  if (SNS_TOPIC_ARN) {
    await sns.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: '[AWSnoozr] Budget Override',
        Message: `Budget override requested:
        
Resource: ${resourceType} ${resourceId}
User: ${userEmail}
Reason: ${reason}
Timestamp: ${new Date().toISOString()}

This action was approved despite budget constraints.`
      })
    );
  }

  return successResponse({ message: 'Override logged and notification sent' });
}

/**
 * Get forecast
 */
async function getForecast() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  const end = endDate.toISOString().split('T')[0];

  const startDate = new Date();
  const start = startDate.toISOString().split('T')[0];

  const response = await ce.send(
    new GetCostForecastCommand({
      TimePeriod: { Start: start, End: end },
      Metric: 'UNBLENDED_COST',
      Granularity: 'MONTHLY'
    })
  );

  const forecastedCost = response.Total?.Amount || '0';

  return successResponse({
    forecastedCost: parseFloat(forecastedCost).toFixed(2),
    period: { start, end },
    confidence: response.Total?.Unit || 'USD'
  });
}

/**
 * Get current spend for scope
 */
async function getCurrentSpend(scope) {
  const endDate = new Date();
  const end = endDate.toISOString().split('T')[0];

  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const start = startDate.toISOString().split('T')[0];

  const params = {
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost']
  };

  // Add filters based on scope
  if (scope.type === 'tag-based' && scope.filters?.tags) {
    params.Filter = {
      And: Object.entries(scope.filters.tags).map(([key, value]) => ({
        Tags: { Key: key, Values: Array.isArray(value) ? value : [value] }
      }))
    };
  } else if (scope.type === 'service' && scope.filters?.services) {
    params.Filter = {
      Dimensions: {
        Key: 'SERVICE',
        Values: scope.filters.services
      }
    };
  }

  const response = await ce.send(new GetCostAndUsageCommand(params));

  const totalCost = response.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || '0';
  return parseFloat(totalCost);
}

/**
 * Get forecast amount
 */
async function getForecastAmount(scope) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);
  const end = endDate.toISOString().split('T')[0];

  const startDate = new Date();
  const start = startDate.toISOString().split('T')[0];

  try {
    const response = await ce.send(
      new GetCostForecastCommand({
        TimePeriod: { Start: start, End: end },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY'
      })
    );

    return parseFloat(response.Total?.Amount || '0');
  } catch (error) {
    console.error('Error getting forecast:', error);
    return 0;
  }
}

/**
 * Check if resource matches budget scope
 */
function matchesBudgetScope(resourceType, tags, region, scope) {
  if (scope.type === 'account') {
    return true;
  }

  if (scope.type === 'tag-based' && scope.filters?.tags) {
    // Check if resource has all required tags
    return Object.entries(scope.filters.tags).every(([key, values]) => {
      const tagValue = tags?.[key];
      return tagValue && (Array.isArray(values) ? values.includes(tagValue) : values === tagValue);
    });
  }

  if (scope.type === 'service' && scope.filters?.services) {
    // Map resource type to AWS service name
    const serviceMap = {
      'ec2': 'Amazon Elastic Compute Cloud - Compute',
      'rds': 'Amazon Relational Database Service',
      'redshift': 'Amazon Redshift',
      'eks': 'Amazon Elastic Container Service for Kubernetes'
    };

    const serviceName = serviceMap[resourceType];
    return serviceName && scope.filters.services.includes(serviceName);
  }

  return false;
}

/**
 * Check and send budget alerts
 */
async function checkAndSendAlerts(budget, currentSpend) {
  const percentUsed = (currentSpend / budget.amount) * 100;

  for (const alert of budget.alerts) {
    if (percentUsed >= alert.threshold && !alert.notified) {
      // Send alert
      if (SNS_TOPIC_ARN) {
        await sns.send(
          new PublishCommand({
            TopicArn: SNS_TOPIC_ARN,
            Subject: `[AWSnoozr] Budget Alert - ${alert.threshold}% Threshold Reached`,
            Message: `Budget alert for ${budget.budgetId}:
            
Budget Amount: $${budget.amount}
Current Spend: $${currentSpend.toFixed(2)}
Percentage Used: ${Math.round(percentUsed)}%

${percentUsed >= 100 ? 'BUDGET EXCEEDED!' : `You have $${(budget.amount - currentSpend).toFixed(2)} remaining.`}

Take action to control costs.`
          })
        );
      }

      // Mark alert as notified
      alert.notified = true;
      await dynamodb.send(
        new UpdateItemCommand({
          TableName: BUDGETS_TABLE,
          Key: marshall({ budgetId: budget.budgetId }),
          UpdateExpression: 'SET alerts = :alerts',
          ExpressionAttributeValues: marshall({ ':alerts': budget.alerts })
        })
      );
    }
  }
}

/**
 * Get current period ID
 */
function getCurrentPeriod() {
  const now = new Date();
  return `monthly-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Helper functions
 */
function successResponse(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(data)
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ error: message })
  };
}
