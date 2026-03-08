/**
 * Multi-Account Aggregator Lambda Function
 * 
 * Aggregates resources across multiple AWS accounts using STS AssumeRole
 * Supports all resource types and operations
 */

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBInstancesCommand, DescribeDBClustersCommand } = require('@aws-sdk/client-rds');
const { RedshiftClient, DescribeClustersCommand } = require('@aws-sdk/client-redshift');
const { EKSClient, ListClustersCommand, DescribeClusterCommand, ListNodegroupsCommand } = require('@aws-sdk/client-eks');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const sts = new STSClient({});
const TABLE_NAME = process.env.ACCOUNTS_TABLE_NAME || 'awsnoozr-prod-accounts';

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  const method = event.httpMethod;
  const path = event.path;

  try {
    // Route requests
    if (method === 'GET' && path === '/accounts') {
      return await listAccounts();
    } else if (method === 'POST' && path === '/accounts') {
      return await createAccount(event);
    } else if (method === 'PUT' && path.startsWith('/accounts/')) {
      return await updateAccount(event);
    } else if (method === 'DELETE' && path.startsWith('/accounts/')) {
      return await deleteAccount(event);
    } else if (method === 'POST' && path.includes('/test')) {
      return await testConnection(event);
    } else if (method === 'GET' && path === '/accounts/resources') {
      return await aggregateAllResources(event);
    } else {
      return errorResponse(404, 'Not found');
    }
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, error.message);
  }
};

/**
 * List all configured accounts
 */
async function listAccounts() {
  const { Items } = await dynamodb.send(
    new ScanCommand({ TableName: TABLE_NAME })
  );

  const accounts = Items.map(item => unmarshall(item));

  return successResponse({ accounts });
}

/**
 * Create new account configuration
 */
async function createAccount(event) {
  const body = JSON.parse(event.body);

  const account = {
    accountId: body.accountId,
    accountName: body.accountName || body.accountId,
    roleArn: body.roleArn || `arn:aws:iam::${body.accountId}:role/awsnoozr-prod-cross-account`,
    externalId: body.externalId || 'awsnoozr-prod',
    regions: body.regions || ['us-east-1'],
    enabled: true,
    createdAt: new Date().toISOString(),
    lastSync: null,
    status: 'pending'
  };

  const { marshall } = require('@aws-sdk/util-dynamodb');
  const { PutItemCommand } = require('@aws-sdk/client-dynamodb');

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(account)
    })
  );

  return successResponse({ account, message: 'Account created successfully' });
}

/**
 * Update account configuration
 */
async function updateAccount(event) {
  const accountId = event.pathParameters.accountId;
  const body = JSON.parse(event.body);

  const updates = {};
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  if (body.accountName) {
    updateExpressions.push('#accountName = :accountName');
    expressionAttributeNames['#accountName'] = 'accountName';
    expressionAttributeValues[':accountName'] = { S: body.accountName };
  }

  if (body.regions) {
    updateExpressions.push('#regions = :regions');
    expressionAttributeNames['#regions'] = 'regions';
    expressionAttributeValues[':regions'] = { L: body.regions.map(r => ({ S: r })) };
  }

  if (body.enabled !== undefined) {
    updateExpressions.push('#enabled = :enabled');
    expressionAttributeNames['#enabled'] = 'enabled';
    expressionAttributeValues[':enabled'] = { BOOL: body.enabled };
  }

  if (updateExpressions.length === 0) {
    return errorResponse(400, 'No updates provided');
  }

  const { UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

  await dynamodb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { accountId: { S: accountId } },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    })
  );

  return successResponse({ message: 'Account updated successfully' });
}

/**
 * Delete account configuration
 */
async function deleteAccount(event) {
  const accountId = event.pathParameters.accountId;

  const { DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

  await dynamodb.send(
    new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: { accountId: { S: accountId } }
    })
  );

  return successResponse({ message: 'Account deleted successfully' });
}

/**
 * Test connection to account
 */
async function testConnection(event) {
  const accountId = event.pathParameters.accountId;

  // Get account configuration
  const { GetItemCommand } = require('@aws-sdk/client-dynamodb');
  const { Item } = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { accountId: { S: accountId } }
    })
  );

  if (!Item) {
    return errorResponse(404, 'Account not found');
  }

  const account = unmarshall(Item);

  try {
    // Attempt to assume role
    const credentials = await assumeRole(account.roleArn, account.externalId);

    // Try to list regions as a test
    const ec2 = new EC2Client({ credentials });
    const { Regions } = await ec2.send(new DescribeRegionsCommand({}));

    // Update account status
    await dynamodb.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { accountId: { S: accountId } },
        UpdateExpression: 'SET #status = :status, #lastSync = :lastSync',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#lastSync': 'lastSync'
        },
        ExpressionAttributeValues: {
          ':status': { S: 'connected' },
          ':lastSync': { S: new Date().toISOString() }
        }
      })
    );

    return successResponse({
      status: 'connected',
      regionsAvailable: Regions.length,
      message: 'Connection successful'
    });
  } catch (error) {
    // Update account status to failed
    await dynamodb.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { accountId: { S: accountId } },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': { S: 'failed' } }
      })
    );

    return errorResponse(403, `Connection failed: ${error.message}`);
  }
}

/**
 * Aggregate resources from all accounts
 */
async function aggregateAllResources(event) {
  const resourceType = event.queryStringParameters?.type || 'all';

  // Get all enabled accounts
  const { Items } = await dynamodb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#enabled = :enabled',
      ExpressionAttributeNames: { '#enabled': 'enabled' },
      ExpressionAttributeValues: { ':enabled': { BOOL: true } }
    })
  );

  const accounts = Items.map(item => unmarshall(item));

  const results = [];

  for (const account of accounts) {
    try {
      const credentials = await assumeRole(account.roleArn, account.externalId);

      for (const region of account.regions) {
        if (resourceType === 'all' || resourceType === 'ec2') {
          const ec2Resources = await queryEC2(region, credentials, account.accountId);
          results.push(...ec2Resources);
        }

        if (resourceType === 'all' || resourceType === 'rds') {
          const rdsResources = await queryRDS(region, credentials, account.accountId);
          results.push(...rdsResources);
        }

        if (resourceType === 'all' || resourceType === 'redshift') {
          const redshiftResources = await queryRedshift(region, credentials, account.accountId);
          results.push(...redshiftResources);
        }

        if (resourceType === 'all' || resourceType === 'eks') {
          const eksResources = await queryEKS(region, credentials, account.accountId);
          results.push(...eksResources);
        }
      }
    } catch (error) {
      console.error(`Error querying account ${account.accountId}:`, error);
      results.push({
        accountId: account.accountId,
        error: error.message,
        status: 'failed'
      });
    }
  }

  return successResponse({
    totalAccounts: accounts.length,
    totalResources: results.length,
    resources: results
  });
}

/**
 * Assume role in target account
 */
async function assumeRole(roleArn, externalId) {
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'AWSnoozrSession',
      ExternalId: externalId,
      DurationSeconds: 3600
    })
  );

  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken
  };
}

/**
 * Query EC2 instances in account/region
 */
async function queryEC2(region, credentials, accountId) {
  const ec2 = new EC2Client({ region, credentials });

  try {
    const { Reservations } = await ec2.send(new DescribeInstancesCommand({}));

    return Reservations.flatMap(r =>
      r.Instances.map(i => ({
        accountId,
        region,
        resourceType: 'ec2',
        resourceId: i.InstanceId,
        name: i.Tags?.find(t => t.Key === 'Name')?.Value || '',
        state: i.State.Name,
        instanceType: i.InstanceType,
        launchTime: i.LaunchTime,
        tags: i.Tags || []
      }))
    );
  } catch (error) {
    console.error(`Error querying EC2 in ${region}:`, error);
    return [];
  }
}

/**
 * Query RDS instances in account/region
 */
async function queryRDS(region, credentials, accountId) {
  const rds = new RDSClient({ region, credentials });

  try {
    const { DBInstances } = await rds.send(new DescribeDBInstancesCommand({}));
    const { DBClusters } = await rds.send(new DescribeDBClustersCommand({}));

    const instances = DBInstances.map(i => ({
      accountId,
      region,
      resourceType: 'rds-instance',
      resourceId: i.DBInstanceIdentifier,
      name: i.DBInstanceIdentifier,
      state: i.DBInstanceStatus,
      engine: i.Engine,
      instanceClass: i.DBInstanceClass
    }));

    const clusters = DBClusters.map(c => ({
      accountId,
      region,
      resourceType: 'rds-cluster',
      resourceId: c.DBClusterIdentifier,
      name: c.DBClusterIdentifier,
      state: c.Status,
      engine: c.Engine
    }));

    return [...instances, ...clusters];
  } catch (error) {
    console.error(`Error querying RDS in ${region}:`, error);
    return [];
  }
}

/**
 * Query Redshift clusters in account/region
 */
async function queryRedshift(region, credentials, accountId) {
  const redshift = new RedshiftClient({ region, credentials });

  try {
    const { Clusters } = await redshift.send(new DescribeClustersCommand({}));

    return Clusters.map(c => ({
      accountId,
      region,
      resourceType: 'redshift',
      resourceId: c.ClusterIdentifier,
      name: c.ClusterIdentifier,
      state: c.ClusterStatus,
      nodeType: c.NodeType,
      numberOfNodes: c.NumberOfNodes
    }));
  } catch (error) {
    console.error(`Error querying Redshift in ${region}:`, error);
    return [];
  }
}

/**
 * Query EKS clusters in account/region
 */
async function queryEKS(region, credentials, accountId) {
  const eks = new EKSClient({ region, credentials });

  try {
    const { clusters } = await eks.send(new ListClustersCommand({}));

    const results = [];

    for (const clusterName of clusters) {
      const { cluster } = await eks.send(
        new DescribeClusterCommand({ name: clusterName })
      );

      const { nodegroups } = await eks.send(
        new ListNodegroupsCommand({ clusterName })
      );

      results.push({
        accountId,
        region,
        resourceType: 'eks',
        resourceId: clusterName,
        name: clusterName,
        state: cluster.status,
        version: cluster.version,
        nodeGroupCount: nodegroups.length
      });
    }

    return results;
  } catch (error) {
    console.error(`Error querying EKS in ${region}:`, error);
    return [];
  }
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
