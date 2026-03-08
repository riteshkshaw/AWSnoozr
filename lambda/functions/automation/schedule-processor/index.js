const { DynamoDBClient, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { EC2Client, StopInstancesCommand, StartInstancesCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, StopDBInstanceCommand, StartDBInstanceCommand, StopDBClusterCommand, StartDBClusterCommand } = require('@aws-sdk/client-rds');
const { RedshiftClient, PauseClusterCommand, ResumeClusterCommand } = require('@aws-sdk/client-redshift');
const { EKSClient, UpdateNodegroupConfigCommand, DescribeNodegroupCommand } = require('@aws-sdk/client-eks');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const parser = require('cron-parser');

async function sendNotification(schedule, result, error = null) {
  if (!process.env.SNS_TOPIC_ARN) {
    console.log('SNS_TOPIC_ARN not configured, skipping notification');
    return;
  }

  const sns = new SNSClient({});
  const subject = `[AWSnoozr] Scheduled ${schedule.scheduleType} for ${schedule.resourceType} ${schedule.resourceId}`;
  const message = `
Scheduled Action Executed

Resource Type: ${schedule.resourceType}
Resource ID: ${schedule.resourceId}
Region: ${schedule.region}
Action: ${schedule.scheduleType}
Schedule: ${schedule.cronExpression} (${schedule.timezone})
Timestamp: ${new Date().toISOString()}
Result: ${result}
${error ? `Error: ${error}` : ''}

${result === 'success' ? '✓' : '✗'} Scheduled operation completed ${result === 'success' ? 'successfully' : 'with errors'}.

This is an automated notification from AWSnoozr scheduled operations.
  `.trim();

  try {
    // Send to configured notification emails
    if (schedule.notificationEmails && schedule.notificationEmails.length > 0) {
      for (const email of schedule.notificationEmails) {
        await sns.send(
          new PublishCommand({
            TopicArn: process.env.SNS_TOPIC_ARN,
            Subject: subject,
            Message: message,
            MessageAttributes: {
              email: { DataType: 'String', StringValue: email }
            }
          })
        );
      }
    } else {
      // Send to default topic
      await sns.send(
        new PublishCommand({
          TopicArn: process.env.SNS_TOPIC_ARN,
          Subject: subject,
          Message: message
        })
      );
    }
    console.log(`Notification sent for scheduled ${schedule.scheduleType} on ${schedule.resourceId}`);
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

async function executeSchedule(schedule) {
  const { resourceType, region, resourceId, scheduleType, resourceSubType } = schedule;

  console.log(`Executing ${scheduleType} for ${resourceType} ${resourceId} in ${region}`);

  try {
    if (resourceType === 'ec2') {
      const ec2 = new EC2Client({ region });
      if (scheduleType === 'stop') {
        await ec2.send(new StopInstancesCommand({ InstanceIds: [resourceId] }));
      } else {
        await ec2.send(new StartInstancesCommand({ InstanceIds: [resourceId] }));
      }
    } else if (resourceType === 'rds') {
      const rds = new RDSClient({ region });
      if (resourceSubType === 'cluster') {
        if (scheduleType === 'stop') {
          await rds.send(new StopDBClusterCommand({ DBClusterIdentifier: resourceId }));
        } else {
          await rds.send(new StartDBClusterCommand({ DBClusterIdentifier: resourceId }));
        }
      } else {
        if (scheduleType === 'stop') {
          await rds.send(new StopDBInstanceCommand({ DBInstanceIdentifier: resourceId }));
        } else {
          await rds.send(new StartDBInstanceCommand({ DBInstanceIdentifier: resourceId }));
        }
      }
    } else if (resourceType === 'redshift') {
      const redshift = new RedshiftClient({ region });
      if (scheduleType === 'pause') {
        await redshift.send(new PauseClusterCommand({ ClusterIdentifier: resourceId }));
      } else {
        await redshift.send(new ResumeClusterCommand({ ClusterIdentifier: resourceId }));
      }
    } else if (resourceType === 'eks-nodegroup') {
      const eks = new EKSClient({ region });
      const [clusterName, nodegroupName] = resourceId.split('/');

      if (scheduleType === 'scale-down') {
        // Get current config
        const { nodegroup } = await eks.send(
          new DescribeNodegroupCommand({ clusterName, nodegroupName })
        );

        // Store original size in schedule metadata for scale-up
        const originalSize = nodegroup.scalingConfig.desiredSize;

        // Scale to 0
        await eks.send(
          new UpdateNodegroupConfigCommand({
            clusterName,
            nodegroupName,
            scalingConfig: {
              ...nodegroup.scalingConfig,
              desiredSize: 0
            }
          })
        );
      } else if (scheduleType === 'scale-up') {
        // Restore to original size from metadata
        const targetSize = schedule.metadata?.originalSize || 1;

        const { nodegroup } = await eks.send(
          new DescribeNodegroupCommand({ clusterName, nodegroupName })
        );

        await eks.send(
          new UpdateNodegroupConfigCommand({
            clusterName,
            nodegroupName,
            scalingConfig: {
              ...nodegroup.scalingConfig,
              desiredSize: targetSize
            }
          })
        );
      }
    }

    console.log(`✓ Successfully executed ${scheduleType} for ${resourceType} ${resourceId}`);
    return 'success';
  } catch (error) {
    console.error(`✗ Failed to execute ${scheduleType} for ${resourceType} ${resourceId}:`, error);
    throw error;
  }
}

exports.handler = async (event) => {
  console.log('Schedule processor triggered');

  const now = new Date();
  const dynamodb = new DynamoDBClient({});

  try {
    // Query enabled schedules
    const { Items } = await dynamodb.send(
      new ScanCommand({
        TableName: process.env.SCHEDULES_TABLE_NAME || 'awsnoozr-prod-schedules',
        FilterExpression: 'enabled = :enabled',
        ExpressionAttributeValues: {
          ':enabled': { N: '1' }
        }
      })
    );

    if (!Items || Items.length === 0) {
      console.log('No enabled schedules found');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No schedules to process' })
      };
    }

    const schedules = Items.map(item => unmarshall(item));
    console.log(`Found ${schedules.length} enabled schedules`);

    let executedCount = 0;
    let errorCount = 0;

    for (const schedule of schedules) {
      try {
        // Check opt-out settings
        if (schedule.scheduleType === 'stop' && schedule.optOut?.autoStop === false) {
          console.log(`Skipping stop for ${schedule.resourceId} (opted out)`);
          continue;
        }
        if (schedule.scheduleType === 'start' && schedule.optOut?.autoStart === false) {
          console.log(`Skipping start for ${schedule.resourceId} (opted out)`);
          continue;
        }

        // Parse cron expression with timezone
        const interval = parser.parseExpression(schedule.cronExpression, {
          currentDate: now,
          tz: schedule.timezone || 'UTC'
        });

        const nextExecution = interval.next().toDate();
        const timeDiff = Math.abs(nextExecution.getTime() - now.getTime());

        // Execute if within 5-minute window (EventBridge triggers every 5 minutes)
        if (timeDiff < 5 * 60 * 1000) {
          console.log(`Executing schedule for ${schedule.resourceId}`);

          try {
            await executeSchedule(schedule);
            executedCount++;

            // Send success notification
            await sendNotification(schedule, 'success');

            // Update last executed timestamp
            await dynamodb.send(
              new UpdateItemCommand({
                TableName: process.env.SCHEDULES_TABLE_NAME || 'awsnoozr-prod-schedules',
                Key: {
                  resourceId: { S: schedule.resourceId },
                  scheduleType: { S: schedule.scheduleType }
                },
                UpdateExpression: 'SET lastExecuted = :timestamp',
                ExpressionAttributeValues: {
                  ':timestamp': { S: now.toISOString() }
                }
              })
            );
          } catch (error) {
            errorCount++;
            console.error(`Failed to execute schedule for ${schedule.resourceId}:`, error);

            // Send error notification
            await sendNotification(schedule, 'error', error.message);
          }
        }
      } catch (error) {
        console.error(`Error processing schedule for ${schedule.resourceId}:`, error);
        errorCount++;
      }
    }

    console.log(`Schedule processing complete: ${executedCount} executed, ${errorCount} errors`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule processing complete',
        executed: executedCount,
        errors: errorCount,
        totalSchedules: schedules.length
      })
    };
  } catch (error) {
    console.error('Error in schedule processor:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Schedule processing failed',
        message: error.message
      })
    };
  }
};
