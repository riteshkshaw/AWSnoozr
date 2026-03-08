/**
 * Tag Indexer Lambda Function
 * 
 * Discovers and indexes all tags from AWS resources
 * Provides tag filtering and search capabilities
 */

const { DynamoDBClient, PutItemCommand, ScanCommand, QueryCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { EC2Client, DescribeInstancesCommand, DescribeVolumesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBInstancesCommand, DescribeDBClustersCommand } = require('@aws-sdk/client-rds');
const { RedshiftClient, DescribeClustersCommand } = require('@aws-sdk/client-redshift');
const { EKSClient, ListClustersCommand, DescribeClusterCommand } = require('@aws-sdk/client-eks');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamodb = new DynamoDBClient({});
const TAG_INDEX_TABLE = process.env.TAG_INDEX_TABLE_NAME || 'awsnoozr-prod-tag-index';

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  const method = event.httpMethod;
  const path = event.path;

  try {
    if (method === 'GET' && path === '/tags') {
      return await getAllTags();
    } else if (method === 'GET' && path === '/tags/search') {
      return await searchByTags(event);
    } else if (method === 'POST' && path === '/tags/reindex') {
      return await reindexTags();
    } else if (method === 'POST' && path === '/resources/bulk-operation') {
      return await bulkOperation(event);
    } else {
      return errorResponse(404, 'Not found');
    }
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, error.message);
  }
};

/**
 * Get all tags with resource counts
 */
async function getAllTags() {
  const { Items } = await dynamodb.send(
    new ScanCommand({ TableName: TAG_INDEX_TABLE })
  );

  const tags = Items.map(item => unmarshall(item));

  // Group by tag key
  const groupedTags = {};
  tags.forEach(tag => {
    if (!groupedTags[tag.tagKey]) {
      groupedTags[tag.tagKey] = {};
    }
    groupedTags[tag.tagKey][tag.tagValue] = {
      count: tag.resourceCount || 0,
      resources: tag.resourceIds || []
    };
  });

  return successResponse({ tags: groupedTags });
}

/**
 * Search resources by tags
 */
async function searchByTags(event) {
  const tags = JSON.parse(event.queryStringParameters?.tags || '{}');
  
  // Get resources matching all specified tags
  const matchingResources = new Set();
  let firstTag = true;

  for (const [key, values] of Object.entries(tags)) {
    for (const value of values) {
      const { Item } = await dynamodb.send(
        new QueryCommand({
          TableName: TAG_INDEX_TABLE,
          KeyConditionExpression: 'tagKey = :key AND tagValue = :value',
          ExpressionAttributeValues: {
            ':key': { S: key },
            ':value': { S: value }
          }
        })
      );

      if (Item) {
        const tag = unmarshall(Item);
        const resources = new Set(tag.resourceIds || []);

        if (firstTag) {
          resources.forEach(r => matchingResources.add(r));
          firstTag = false;
        } else {
          // Intersection - keep only resources that match all tags
          matchingResources.forEach(r => {
            if (!resources.has(r)) {
              matchingResources.delete(r);
            }
          });
        }
      }
    }
  }

  return successResponse({
    matchingResources: Array.from(matchingResources),
    count: matchingResources.size
  });
}

/**
 * Reindex all resource tags
 */
async function reindexTags() {
  console.log('Starting tag reindex...');

  // Get all regions
  const ec2 = new EC2Client({ region: 'us-east-1' });
  const { Regions } = await ec2.send(new DescribeRegionsCommand({}));

  const tagIndex = {};

  for (const region of Regions) {
    const regionName = region.RegionName;
    console.log(`Indexing tags in ${regionName}...`);

    // Index EC2 instances
    await indexEC2Tags(regionName, tagIndex);

    // Index EBS volumes
    await indexEBSTags(regionName, tagIndex);

    // Index RDS
    await indexRDSTags(regionName, tagIndex);

    // Index Redshift
    await indexRedshiftTags(regionName, tagIndex);

    // Index EKS
    await indexEKSTags(regionName, tagIndex);
  }

  // Write tag index to DynamoDB
  await writeTagIndex(tagIndex);

  return successResponse({
    message: 'Tag reindex completed',
    totalTags: Object.keys(tagIndex).length
  });
}

/**
 * Index EC2 instance tags
 */
async function indexEC2Tags(region, tagIndex) {
  const ec2 = new EC2Client({ region });

  try {
    const { Reservations } = await ec2.send(new DescribeInstancesCommand({}));

    Reservations.forEach(reservation => {
      reservation.Instances.forEach(instance => {
        const resourceId = `ec2:${region}:${instance.InstanceId}`;
        (instance.Tags || []).forEach(tag => {
          addToTagIndex(tagIndex, tag.Key, tag.Value, resourceId);
        });
      });
    });
  } catch (error) {
    console.error(`Error indexing EC2 in ${region}:`, error.message);
  }
}

/**
 * Index EBS volume tags
 */
async function indexEBSTags(region, tagIndex) {
  const ec2 = new EC2Client({ region });

  try {
    const { Volumes } = await ec2.send(new DescribeVolumesCommand({}));

    Volumes.forEach(volume => {
      const resourceId = `ebs:${region}:${volume.VolumeId}`;
      (volume.Tags || []).forEach(tag => {
        addToTagIndex(tagIndex, tag.Key, tag.Value, resourceId);
      });
    });
  } catch (error) {
    console.error(`Error indexing EBS in ${region}:`, error.message);
  }
}

/**
 * Index RDS tags
 */
async function indexRDSTags(region, tagIndex) {
  const rds = new RDSClient({ region });

  try {
    const { DBInstances } = await rds.send(new DescribeDBInstancesCommand({}));

    DBInstances.forEach(instance => {
      const resourceId = `rds:${region}:${instance.DBInstanceIdentifier}`;
      (instance.TagList || []).forEach(tag => {
        addToTagIndex(tagIndex, tag.Key, tag.Value, resourceId);
      });
    });
  } catch (error) {
    console.error(`Error indexing RDS in ${region}:`, error.message);
  }
}

/**
 * Index Redshift tags
 */
async function indexRedshiftTags(region, tagIndex) {
  const redshift = new RedshiftClient({ region });

  try {
    const { Clusters } = await redshift.send(new DescribeClustersCommand({}));

    Clusters.forEach(cluster => {
      const resourceId = `redshift:${region}:${cluster.ClusterIdentifier}`;
      (cluster.Tags || []).forEach(tag => {
        addToTagIndex(tagIndex, tag.Key, tag.Value, resourceId);
      });
    });
  } catch (error) {
    console.error(`Error indexing Redshift in ${region}:`, error.message);
  }
}

/**
 * Index EKS tags
 */
async function indexEKSTags(region, tagIndex) {
  const eks = new EKSClient({ region });

  try {
    const { clusters } = await eks.send(new ListClustersCommand({}));

    for (const clusterName of clusters) {
      const { cluster } = await eks.send(
        new DescribeClusterCommand({ name: clusterName })
      );

      const resourceId = `eks:${region}:${clusterName}`;
      Object.entries(cluster.tags || {}).forEach(([key, value]) => {
        addToTagIndex(tagIndex, key, value, resourceId);
      });
    }
  } catch (error) {
    console.error(`Error indexing EKS in ${region}:`, error.message);
  }
}

/**
 * Add tag to index
 */
function addToTagIndex(tagIndex, key, value, resourceId) {
  const indexKey = `${key}:${value}`;

  if (!tagIndex[indexKey]) {
    tagIndex[indexKey] = {
      tagKey: key,
      tagValue: value,
      resourceIds: new Set(),
      resourceCount: 0
    };
  }

  tagIndex[indexKey].resourceIds.add(resourceId);
  tagIndex[indexKey].resourceCount = tagIndex[indexKey].resourceIds.size;
}

/**
 * Write tag index to DynamoDB
 */
async function writeTagIndex(tagIndex) {
  // Clear existing index
  const { Items } = await dynamodb.send(
    new ScanCommand({ TableName: TAG_INDEX_TABLE })
  );

  for (const item of Items) {
    const tag = unmarshall(item);
    await dynamodb.send(
      new DeleteItemCommand({
        TableName: TAG_INDEX_TABLE,
        Key: marshall({ tagKey: tag.tagKey, tagValue: tag.tagValue })
      })
    );
  }

  // Write new index
  for (const [, tagData] of Object.entries(tagIndex)) {
    await dynamodb.send(
      new PutItemCommand({
        TableName: TAG_INDEX_TABLE,
        Item: marshall({
          tagKey: tagData.tagKey,
          tagValue: tagData.tagValue,
          resourceIds: Array.from(tagData.resourceIds),
          resourceCount: tagData.resourceCount,
          lastIndexed: new Date().toISOString()
        })
      })
    );
  }
}

/**
 * Perform bulk operation on resources
 */
async function bulkOperation(event) {
  const body = JSON.parse(event.body);
  const { action, filters } = body;

  // Get resources matching tags
  const { matchingResources } = await searchByTags({
    queryStringParameters: { tags: JSON.stringify(filters.tags || {}) }
  });

  // Parse matchingResources to extract resource info
  const results = [];

  for (const resource of matchingResources) {
    const [resourceType, region, resourceId] = resource.split(':');

    try {
      // Perform action based on resource type
      if (action === 'stop' && resourceType === 'ec2') {
        const ec2 = new EC2Client({ region });
        const { StopInstancesCommand } = require('@aws-sdk/client-ec2');
        await ec2.send(new StopInstancesCommand({ InstanceIds: [resourceId] }));
        results.push({ resource, status: 'success' });
      } else if (action === 'start' && resourceType === 'ec2') {
        const ec2 = new EC2Client({ region });
        const { StartInstancesCommand } = require('@aws-sdk/client-ec2');
        await ec2.send(new StartInstancesCommand({ InstanceIds: [resourceId] }));
        results.push({ resource, status: 'success' });
      }
      // Add more resource types and actions as needed
    } catch (error) {
      results.push({ resource, status: 'failed', error: error.message });
    }
  }

  return successResponse({
    message: 'Bulk operation completed',
    totalResources: matchingResources.length,
    results
  });
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
