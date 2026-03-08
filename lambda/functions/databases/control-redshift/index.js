const { RedshiftClient, DescribeClustersCommand, PauseClusterCommand, ResumeClusterCommand } = require('@aws-sdk/client-redshift');
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
  const { clusterId } = event.pathParameters || {};
  const body = JSON.parse(event.body || '{}');
  const { action } = body; // "pause" or "resume"
  const region = event.queryStringParameters?.region || 'us-east-1';
  const accountId = event.queryStringParameters?.accountId || null;
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  console.log(`Control Redshift request: ${action} ${clusterId} in ${region} account=${accountId || 'primary'} by ${userEmail}`);

  if (!clusterId || !action) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing required parameters',
        message: 'clusterId and action are required'
      })
    };
  }

  if (action !== 'pause' && action !== 'resume') {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Invalid action',
        message: 'Action must be "pause" or "resume"'
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
  const redshift = new RedshiftClient({ region, credentials });

  try {
    // Validate cluster exists and get current state
    const { Clusters } = await redshift.send(
      new DescribeClustersCommand({ ClusterIdentifier: clusterId })
    );

    if (!Clusters || Clusters.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Cluster not found',
          message: `Redshift cluster ${clusterId} not found in region ${region}`
        })
      };
    }

    const cluster = Clusters[0];
    const currentState = cluster.ClusterStatus;

    let newState;
    if (action === 'pause') {
      if (currentState === 'paused') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Cluster already paused',
            message: `Redshift cluster ${clusterId} is already paused`
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
            error: 'Cluster cannot be paused',
            message: `Redshift cluster ${clusterId} is in state "${currentState}" and cannot be paused`
          })
        };
      }
      await redshift.send(new PauseClusterCommand({ ClusterIdentifier: clusterId }));
      newState = 'pausing';
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
            message: `Redshift cluster ${clusterId} is already running`
          })
        };
      }
      if (currentState !== 'paused') {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Cluster cannot be resumed',
            message: `Redshift cluster ${clusterId} is in state "${currentState}" and cannot be resumed`
          })
        };
      }
      await redshift.send(new ResumeClusterCommand({ ClusterIdentifier: clusterId }));
      newState = 'resuming';
    }

    // Log action to CloudWatch
    console.log(JSON.stringify({
      action: `redshift-${action}`,
      user: userEmail,
      resource: clusterId,
      region,
      timestamp: new Date().toISOString(),
      result: 'success'
    }));

    // Send notification
    await sendNotification({
      action: `redshift-${action}`,
      resourceType: 'redshift-cluster',
      resourceId: clusterId,
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
        message: `Redshift cluster ${action} operation initiated`,
        clusterId,
        previousState: currentState,
        newState
      })
    };
  } catch (error) {
    console.error(JSON.stringify({
      action: `redshift-${action}`,
      user: userEmail,
      resource: clusterId,
      region,
      timestamp: new Date().toISOString(),
      result: 'error',
      error: error.message
    }));

    // Send error notification
    await sendNotification({
      action: `redshift-${action}`,
      resourceType: 'redshift-cluster',
      resourceId: clusterId,
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
        error: 'Failed to control Redshift cluster',
        message: error.message
      })
    };
  }
};
