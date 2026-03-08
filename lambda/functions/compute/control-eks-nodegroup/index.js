const { EKSClient, DescribeNodegroupCommand, UpdateNodegroupConfigCommand } = require('@aws-sdk/client-eks');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

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
  const { cluster, nodegroupName } = event.pathParameters || {};
  const body = JSON.parse(event.body || '{}');
  const { desiredSize } = body;
  const region = event.queryStringParameters?.region || 'us-east-1';
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  console.log(`Control EKS node group request: scale ${cluster}/${nodegroupName} to ${desiredSize} in ${region} by ${userEmail}`);

  if (!cluster || !nodegroupName || desiredSize === undefined) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Missing required parameters',
        message: 'cluster, nodegroupName, and desiredSize are required'
      })
    };
  }

  const eks = new EKSClient({ region });

  try {
    // Get current node group configuration
    const { nodegroup } = await eks.send(
      new DescribeNodegroupCommand({ clusterName: cluster, nodegroupName })
    );

    if (!nodegroup) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Node group not found',
          message: `Node group ${nodegroupName} not found in cluster ${cluster}`
        })
      };
    }

    // Validate desired size is within min/max
    const minSize = nodegroup.scalingConfig.minSize;
    const maxSize = nodegroup.scalingConfig.maxSize;

    if (desiredSize < minSize || desiredSize > maxSize) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Invalid desired size',
          message: `Desired size must be between ${minSize} and ${maxSize}`,
          currentConfig: {
            minSize,
            maxSize,
            currentDesiredSize: nodegroup.scalingConfig.desiredSize
          }
        })
      };
    }

    // Update node group
    await eks.send(
      new UpdateNodegroupConfigCommand({
        clusterName: cluster,
        nodegroupName,
        scalingConfig: {
          minSize: nodegroup.scalingConfig.minSize,
          maxSize: nodegroup.scalingConfig.maxSize,
          desiredSize
        }
      })
    );

    // Log action to CloudWatch
    console.log(JSON.stringify({
      action: 'eks-nodegroup-scale',
      user: userEmail,
      cluster,
      nodegroup: nodegroupName,
      region,
      previousSize: nodegroup.scalingConfig.desiredSize,
      newSize: desiredSize,
      timestamp: new Date().toISOString(),
      result: 'success'
    }));

    // Send notification
    await sendNotification({
      action: 'eks-nodegroup-scale',
      resourceType: 'eks-nodegroup',
      resourceId: `${cluster}/${nodegroupName}`,
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
        message: 'Node group scaling initiated',
        cluster,
        nodegroupName,
        previousSize: nodegroup.scalingConfig.desiredSize,
        newSize: desiredSize
      })
    };
  } catch (error) {
    console.error(JSON.stringify({
      action: 'eks-nodegroup-scale',
      user: userEmail,
      cluster,
      nodegroup: nodegroupName,
      region,
      timestamp: new Date().toISOString(),
      result: 'error',
      error: error.message
    }));

    // Send error notification
    await sendNotification({
      action: 'eks-nodegroup-scale',
      resourceType: 'eks-nodegroup',
      resourceId: `${cluster}/${nodegroupName}`,
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
        error: 'Failed to scale EKS node group',
        message: error.message
      })
    };
  }
};
