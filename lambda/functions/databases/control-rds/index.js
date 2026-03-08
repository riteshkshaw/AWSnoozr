const {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
  StopDBInstanceCommand,
  StartDBInstanceCommand,
  StopDBClusterCommand,
  StartDBClusterCommand
} = require('@aws-sdk/client-rds');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const sts = new STSClient({});
const TABLE_NAME = process.env.ACCOUNTS_TABLE_NAME || 'awsnoozr-prod-accounts';

async function getCredentialsForAccount(accountId) {
  const { Item } = await dynamodb.send(
    new GetItemCommand({ TableName: TABLE_NAME, Key: { accountId: { S: accountId } } })
  );
  if (!Item) throw new Error(`Account ${accountId} not found`);
  const account = unmarshall(Item);
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      RoleSessionName: 'AWSnoozrControlSession',
      ExternalId: account.externalId,
      DurationSeconds: 900
    })
  );
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken
  };
}

async function sendNotification({ action, resourceType, resourceId, region, user, timestamp, result, error = null }) {
  if (!process.env.SNS_TOPIC_ARN) {
    console.log('SNS_TOPIC_ARN not configured, skipping notification');
    return;
  }

  const sns = new SNSClient({});
  const subject = `[AWSnoozr] ${action} ${resourceType} ${resourceId}`;
  const message = `
Action: ${action}
Resource Type: ${resourceType}
Resource ID: ${resourceId}
Region: ${region}
User: ${user}
Timestamp: ${timestamp}
Result: ${result}
${error ? `Error: ${error}` : ''}

${result === 'success' ? '✓' : '✗'} Operation completed ${result === 'success' ? 'successfully' : 'with errors'}.

This is an automated notification from AWSnoozr resource management system.
  `.trim();

  try {
    await sns.send(
      new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN,
        Subject: subject,
        Message: message
      })
    );
    console.log(`Notification sent for ${action} on ${resourceId}`);
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

exports.handler = async (event) => {
  const { resourceId } = event.pathParameters || {};
  const body = JSON.parse(event.body || '{}');
  const { action, resourceType } = body; // action: "stop" or "start", resourceType: "instance" or "cluster"
  const region = event.queryStringParameters?.region || 'us-east-1';
  const accountId = event.queryStringParameters?.accountId || null;
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  console.log(`Control RDS request: ${action} ${resourceType} ${resourceId} in ${region} account=${accountId || 'primary'} by ${userEmail}`);

  if (!resourceId || !action || !resourceType) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing required parameters',
        message: 'resourceId, action, and resourceType are required'
      })
    };
  }

  if (action !== 'stop' && action !== 'start') {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Invalid action',
        message: 'Action must be "stop" or "start"'
      })
    };
  }

  if (resourceType !== 'instance' && resourceType !== 'cluster') {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Invalid resourceType',
        message: 'resourceType must be "instance" or "cluster"'
      })
    };
  }

  if (!accountId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing accountId', message: 'accountId query parameter is required' })
    };
  }
  let credentials;
  try {
    credentials = await getCredentialsForAccount(accountId);
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Account lookup failed', message: err.message })
    };
  }
  const rds = new RDSClient({ region, credentials });

  try {
    let currentState;
    let newState;

    if (resourceType === 'instance') {
      // Validate instance exists and get current state
      const { DBInstances } = await rds.send(
        new DescribeDBInstancesCommand({ DBInstanceIdentifier: resourceId })
      );

      if (!DBInstances || DBInstances.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Instance not found',
            message: `RDS instance ${resourceId} not found in region ${region}`
          })
        };
      }

      const instance = DBInstances[0];
      currentState = instance.DBInstanceStatus;

      // Check if instance can be stopped/started
      if (action === 'stop') {
        if (currentState === 'stopped') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              error: 'Instance already stopped',
              message: `RDS instance ${resourceId} is already stopped`
            })
          };
        }
        if (currentState !== 'available') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              error: 'Instance cannot be stopped',
              message: `RDS instance ${resourceId} is in state "${currentState}" and cannot be stopped`
            })
          };
        }
        await rds.send(new StopDBInstanceCommand({ DBInstanceIdentifier: resourceId }));
        newState = 'stopping';
      } else {
        if (currentState === 'available') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              error: 'Instance already running',
              message: `RDS instance ${resourceId} is already running`
            })
          };
        }
        await rds.send(new StartDBInstanceCommand({ DBInstanceIdentifier: resourceId }));
        newState = 'starting';
      }
    } else {
      // Cluster control
      const { DBClusters } = await rds.send(
        new DescribeDBClustersCommand({ DBClusterIdentifier: resourceId })
      );

      if (!DBClusters || DBClusters.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Cluster not found',
            message: `RDS cluster ${resourceId} not found in region ${region}`
          })
        };
      }

      const cluster = DBClusters[0];
      currentState = cluster.Status;

      if (action === 'stop') {
        if (currentState === 'stopped') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              error: 'Cluster already stopped',
              message: `RDS cluster ${resourceId} is already stopped`
            })
          };
        }
        if (currentState !== 'available') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              error: 'Cluster cannot be stopped',
              message: `RDS cluster ${resourceId} is in state "${currentState}" and cannot be stopped`
            })
          };
        }
        await rds.send(new StopDBClusterCommand({ DBClusterIdentifier: resourceId }));
        newState = 'stopping';
      } else {
        if (currentState === 'available') {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              error: 'Cluster already running',
              message: `RDS cluster ${resourceId} is already running`
            })
          };
        }
        await rds.send(new StartDBClusterCommand({ DBClusterIdentifier: resourceId }));
        newState = 'starting';
      }
    }

    // Log action to CloudWatch
    console.log(JSON.stringify({
      action: `rds-${resourceType}-${action}`,
      user: userEmail,
      resource: resourceId,
      region,
      timestamp: new Date().toISOString(),
      result: 'success'
    }));

    // Send notification
    await sendNotification({
      action: `rds-${resourceType}-${action}`,
      resourceType: `rds-${resourceType}`,
      resourceId,
      region,
      user: userEmail,
      timestamp: new Date().toISOString(),
      result: 'success'
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: `RDS ${resourceType} ${action} operation initiated`,
        resourceId,
        resourceType,
        previousState: currentState,
        newState
      })
    };
  } catch (error) {
    console.error(JSON.stringify({
      action: `rds-${resourceType}-${action}`,
      user: userEmail,
      resource: resourceId,
      region,
      timestamp: new Date().toISOString(),
      result: 'error',
      error: error.message
    }));

    // Send error notification
    await sendNotification({
      action: `rds-${resourceType}-${action}`,
      resourceType: `rds-${resourceType}`,
      resourceId,
      region,
      user: userEmail,
      timestamp: new Date().toISOString(),
      result: 'error',
      error: error.message
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to control RDS resource',
        message: error.message
      })
    };
  }
};
