const { EC2Client, DescribeInstancesCommand, StopInstancesCommand, StartInstancesCommand } = require('@aws-sdk/client-ec2');
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
  const { instanceId } = event.pathParameters || {};
  const body = JSON.parse(event.body || '{}');
  const { action } = body; // "stop" or "start"
  const region = event.queryStringParameters?.region || 'us-east-1';
  const accountId = event.queryStringParameters?.accountId || null;
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  console.log(`Control EC2 request: ${action} ${instanceId} in ${region} account=${accountId || 'primary'} by ${userEmail}`);

  if (!instanceId || !action) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing required parameters',
        message: 'instanceId and action are required'
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
  const ec2 = new EC2Client({ region, credentials });

  try {
    // Validate instance exists and get current state
    const { Reservations } = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    );

    if (!Reservations || Reservations.length === 0 || !Reservations[0].Instances || Reservations[0].Instances.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Instance not found',
          message: `Instance ${instanceId} not found in region ${region}`
        })
      };
    }

    const instance = Reservations[0].Instances[0];

    // Check for protected tags
    const protectedTag = instance.Tags?.find(t => t.Key === 'Protected' && t.Value === 'true');
    if (protectedTag) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Instance is protected',
          message: 'This instance has the Protected=true tag and cannot be stopped/started via AWSnoozr'
        })
      };
    }

    // Perform action
    let newState;
    if (action === 'stop') {
      if (instance.State.Name === 'stopped') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Instance already stopped',
            message: `Instance ${instanceId} is already stopped`
          })
        };
      }
      await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
      newState = 'stopping';
    } else if (action === 'start') {
      if (instance.State.Name === 'running') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Instance already running',
            message: `Instance ${instanceId} is already running`
          })
        };
      }
      await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
      newState = 'pending';
    }

    // Log action to CloudWatch
    console.log(JSON.stringify({
      action: `ec2-${action}`,
      user: userEmail,
      resource: instanceId,
      region,
      timestamp: new Date().toISOString(),
      result: 'success'
    }));

    // Send notification
    await sendNotification({
      action: `ec2-${action}`,
      resourceType: 'ec2',
      resourceId: instanceId,
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
        message: `Instance ${action} operation initiated`,
        instanceId,
        previousState: instance.State.Name,
        newState
      })
    };
  } catch (error) {
    console.error(JSON.stringify({
      action: `ec2-${action}`,
      user: userEmail,
      resource: instanceId,
      region,
      timestamp: new Date().toISOString(),
      result: 'error',
      error: error.message
    }));

    // Send error notification
    await sendNotification({
      action: `ec2-${action}`,
      resourceType: 'ec2',
      resourceId: instanceId,
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
        error: 'Failed to control EC2 instance',
        message: error.message
      })
    };
  }
};
