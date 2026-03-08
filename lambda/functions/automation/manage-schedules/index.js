const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, DeleteItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const parser = require('cron-parser');

const dynamodb = new DynamoDBClient({});
const TABLE_NAME = process.env.SCHEDULES_TABLE_NAME || 'awsnoozr-prod-schedules';

exports.handler = async (event) => {
  const httpMethod = event.httpMethod;
  const path = event.path;

  console.log(`Schedule management: ${httpMethod} ${path}`);

  try {
    switch (httpMethod) {
      case 'GET':
        return await listSchedules(event);
      case 'POST':
        return await createSchedule(event);
      case 'PUT':
        return await updateSchedule(event);
      case 'DELETE':
        return await deleteSchedule(event);
      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
  } catch (error) {
    console.error('Error in schedule management:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

async function listSchedules(event) {
  // Query all schedules
  const { Items } = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'EnabledSchedulesIndex',
      KeyConditionExpression: 'enabled = :enabled',
      ExpressionAttributeValues: marshall({ ':enabled': 1 })
    })
  );

  const schedules = Items ? Items.map(item => unmarshall(item)) : [];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      schedules,
      count: schedules.length
    })
  };
}

async function createSchedule(event) {
  const body = JSON.parse(event.body);
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  // Validate required fields
  const required = ['resourceId', 'scheduleType', 'resourceType', 'region', 'cronExpression'];
  for (const field of required) {
    if (!body[field]) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing required field',
          field
        })
      };
    }
  }

  // Validate cron expression
  try {
    parser.parseExpression(body.cronExpression, {
      tz: body.timezone || 'UTC'
    });
  } catch (error) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Invalid cron expression',
        message: error.message
      })
    };
  }

  // Calculate next execution time
  const nextExecution = parser.parseExpression(body.cronExpression, {
    currentDate: new Date(),
    tz: body.timezone || 'UTC'
  }).next().toDate();

  const schedule = {
    resourceId: body.resourceId,
    scheduleType: body.scheduleType, // stop, start, pause, resume, scale-down, scale-up
    resourceType: body.resourceType, // ec2, rds, redshift, eks-nodegroup
    resourceSubType: body.resourceSubType, // instance, cluster (for RDS)
    region: body.region,
    cronExpression: body.cronExpression,
    timezone: body.timezone || 'UTC',
    enabled: 1,
    optOut: body.optOut || { autoStart: true, autoStop: true },
    notificationEmails: body.notificationEmails || [],
    createdBy: userEmail,
    createdAt: new Date().toISOString(),
    lastExecuted: null,
    nextExecution: nextExecution.toISOString(),
    metadata: body.metadata || {}
  };

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(schedule)
    })
  );

  console.log(`Created schedule for ${schedule.resourceId}: ${schedule.scheduleType} at ${schedule.cronExpression}`);

  return {
    statusCode: 201,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Schedule created successfully',
      schedule
    })
  };
}

async function updateSchedule(event) {
  const body = JSON.parse(event.body);
  const { resourceId, scheduleType } = event.pathParameters || {};

  if (!resourceId || !scheduleType) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing resourceId or scheduleType in path'
      })
    };
  }

  // Build update expression
  const updates = [];
  const attributeValues = {};
  const attributeNames = {};

  if (body.cronExpression !== undefined) {
    // Validate cron expression
    try {
      parser.parseExpression(body.cronExpression, {
        tz: body.timezone || 'UTC'
      });
      updates.push('#cronExpression = :cronExpression');
      attributeValues[':cronExpression'] = body.cronExpression;
      attributeNames['#cronExpression'] = 'cronExpression';

      // Recalculate next execution
      const nextExecution = parser.parseExpression(body.cronExpression, {
        currentDate: new Date(),
        tz: body.timezone || 'UTC'
      }).next().toDate();
      updates.push('nextExecution = :nextExecution');
      attributeValues[':nextExecution'] = nextExecution.toISOString();
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Invalid cron expression',
          message: error.message
        })
      };
    }
  }

  if (body.timezone !== undefined) {
    updates.push('timezone = :timezone');
    attributeValues[':timezone'] = body.timezone;
  }

  if (body.enabled !== undefined) {
    updates.push('enabled = :enabled');
    attributeValues[':enabled'] = body.enabled ? 1 : 0;
  }

  if (body.optOut !== undefined) {
    updates.push('optOut = :optOut');
    attributeValues[':optOut'] = body.optOut;
  }

  if (body.notificationEmails !== undefined) {
    updates.push('notificationEmails = :notificationEmails');
    attributeValues[':notificationEmails'] = body.notificationEmails;
  }

  if (updates.length === 0) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'No fields to update'
      })
    };
  }

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ resourceId, scheduleType }),
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: marshall(attributeValues),
      ExpressionAttributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined
    })
  );

  console.log(`Updated schedule for ${resourceId}/${scheduleType}`);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Schedule updated successfully'
    })
  };
}

async function deleteSchedule(event) {
  const { resourceId, scheduleType } = event.pathParameters || {};

  if (!resourceId || !scheduleType) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing resourceId or scheduleType in path'
      })
    };
  }

  await dynamodb.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ resourceId, scheduleType })
    })
  );

  console.log(`Deleted schedule for ${resourceId}/${scheduleType}`);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Schedule deleted successfully'
    })
  };
}
