/**
 * Device Registration Lambda for Push Notifications
 * Registers mobile devices for SNS push notifications
 */

const { DynamoDBClient, PutItemCommand, DeleteItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { SNSClient, CreatePlatformEndpointCommand, DeleteEndpointCommand } = require('@aws-sdk/client-sns');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const sns = new SNSClient({});

const DEVICES_TABLE = process.env.DEVICES_TABLE_NAME || 'awsnoozr-prod-devices';
const APNS_PLATFORM_ARN = process.env.APNS_PLATFORM_ARN;
const FCM_PLATFORM_ARN = process.env.FCM_PLATFORM_ARN;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  const method = event.httpMethod;
  const path = event.path;

  try {
    if (method === 'POST' && path === '/devices/register') {
      return await registerDevice(event);
    } else if (method === 'POST' && path === '/devices/unregister') {
      return await unregisterDevice(event);
    } else if (method === 'POST' && path === '/notifications/send') {
      return await sendPushNotification(event);
    }

    return errorResponse(404, 'Not found');
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, error.message);
  }
};

async function registerDevice(event) {
  const body = JSON.parse(event.body);
  const { deviceToken, platform } = body;
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  // Determine platform ARN
  const platformArn = platform === 'ios' ? APNS_PLATFORM_ARN : FCM_PLATFORM_ARN;

  if (!platformArn) {
    return errorResponse(400, 'Platform not configured');
  }

  // Create SNS platform endpoint
  const { EndpointArn } = await sns.send(
    new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformArn,
      Token: deviceToken
    })
  );

  // Store device in DynamoDB
  const device = {
    deviceToken,
    endpointArn: EndpointArn,
    platform,
    userEmail,
    registeredAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };

  await dynamodb.send(
    new PutItemCommand({
      TableName: DEVICES_TABLE,
      Item: marshall(device)
    })
  );

  return successResponse({ message: 'Device registered', endpointArn: EndpointArn });
}

async function unregisterDevice(event) {
  const body = JSON.parse(event.body);
  const { deviceToken } = body;

  // Get device from DynamoDB
  const { Items } = await dynamodb.send(
    new QueryCommand({
      TableName: DEVICES_TABLE,
      KeyConditionExpression: 'deviceToken = :token',
      ExpressionAttributeValues: marshall({ ':token': deviceToken })
    })
  );

  if (Items && Items.length > 0) {
    const device = unmarshall(Items[0]);

    // Delete SNS endpoint
    await sns.send(
      new DeleteEndpointCommand({
        EndpointArn: device.endpointArn
      })
    );

    // Delete from DynamoDB
    await dynamodb.send(
      new DeleteItemCommand({
        TableName: DEVICES_TABLE,
        Key: marshall({ deviceToken })
      })
    );
  }

  return successResponse({ message: 'Device unregistered' });
}

async function sendPushNotification(event) {
  const body = JSON.parse(event.body);
  const { title, message, data, userEmail } = body;

  // Get user devices
  const { Items } = await dynamodb.send(
    new QueryCommand({
      TableName: DEVICES_TABLE,
      IndexName: 'UserEmailIndex',
      KeyConditionExpression: 'userEmail = :email',
      ExpressionAttributeValues: marshall({ ':email': userEmail })
    })
  );

  const devices = Items.map(item => unmarshall(item));

  // Send to each device
  const { PublishCommand } = require('@aws-sdk/client-sns');
  for (const device of devices) {
    const payload = device.platform === 'ios'
      ? { aps: { alert: { title, body: message }, data } }
      : { notification: { title, body: message }, data };

    await sns.send(
      new PublishCommand({
        TargetArn: device.endpointArn,
        Message: JSON.stringify(payload),
        MessageStructure: 'json'
      })
    );
  }

  return successResponse({ message: 'Notification sent', deviceCount: devices.length });
}

function successResponse(data) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data)
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: message })
  };
}
