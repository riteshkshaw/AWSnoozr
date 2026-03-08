/**
 * Slack Integration Lambda
 * Sends notifications to Slack channels
 */

const axios = require('axios');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const SETTINGS_TABLE = process.env.SETTINGS_TABLE_NAME || 'awsnoozr-prod-settings';

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  const method = event.httpMethod;
  const path = event.path;

  try {
    if (method === 'POST' && path === '/notifications/slack') {
      return await sendSlackNotification(event);
    } else if (method === 'POST' && path === '/settings/slack/test') {
      return await testSlackConnection(event);
    }

    return errorResponse(404, 'Not found');
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, error.message);
  }
};

async function sendSlackNotification(event) {
  const body = JSON.parse(event.body);
  const { action, resource, user, status } = body;

  // Get Slack webhook URL from settings
  const { Item } = await dynamodb.send(
    new GetItemCommand({
      TableName: SETTINGS_TABLE,
      Key: { settingKey: { S: 'slack-webhook-url' } }
    })
  );

  if (!Item) {
    return errorResponse(404, 'Slack not configured');
  }

  const settings = unmarshall(Item);
  const webhookUrl = settings.settingValue;

  // Build Slack message
  const icon = status === 'success' ? ':white_check_mark:' : ':x:';
  const color = status === 'success' ? 'good' : 'danger';

  const slackMessage = {
    text: `${icon} Resource Action: ${action}`,
    attachments: [
      {
        color,
        fields: [
          { title: 'Action', value: action, short: true },
          { title: 'Resource', value: resource, short: true },
          { title: 'User', value: user, short: true },
          { title: 'Status', value: status, short: true },
          { title: 'Timestamp', value: new Date().toLocaleString(), short: false }
        ]
      }
    ]
  };

  // Send to Slack
  await axios.post(webhookUrl, slackMessage);

  return successResponse({ message: 'Slack notification sent' });
}

async function testSlackConnection(event) {
  const body = JSON.parse(event.body);
  const { webhookUrl } = body;

  try {
    await axios.post(webhookUrl, {
      text: ':wave: Test message from AWSnoozr',
      attachments: [
        {
          color: 'good',
          text: 'Slack integration is working correctly!'
        }
      ]
    });

    return successResponse({ message: 'Test message sent successfully' });
  } catch (error) {
    return errorResponse(400, `Slack test failed: ${error.message}`);
  }
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
