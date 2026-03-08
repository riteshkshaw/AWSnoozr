const { RDSClient, DescribeDBInstancesCommand, DescribeDBClustersCommand } = require('@aws-sdk/client-rds');
const { EC2Client, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');

let cachedRegions = null;

async function getAllRegions() {
  if (cachedRegions) {
    return cachedRegions;
  }

  const ec2 = new EC2Client({ region: 'us-east-1' });
  const { Regions } = await ec2.send(new DescribeRegionsCommand({}));
  cachedRegions = Regions.filter(r => r.OptInStatus !== 'not-opted-in');
  return cachedRegions;
}

async function queryRDSInRegion(regionName) {
  try {
    const rds = new RDSClient({ region: regionName });

    // Query DB Instances
    const { DBInstances } = await rds.send(new DescribeDBInstancesCommand({}));

    // Query DB Clusters (Aurora)
    const { DBClusters } = await rds.send(new DescribeDBClustersCommand({}));

    const instances = DBInstances.map(db => ({
      id: db.DBInstanceIdentifier,
      type: 'instance',
      engine: db.Engine,
      engineVersion: db.EngineVersion,
      instanceClass: db.DBInstanceClass,
      state: db.DBInstanceStatus,
      availabilityZone: db.AvailabilityZone,
      multiAZ: db.MultiAZ,
      storageType: db.StorageType,
      allocatedStorage: db.AllocatedStorage,
      endpoint: db.Endpoint?.Address,
      port: db.Endpoint?.Port,
      clusterIdentifier: db.DBClusterIdentifier,
      tags: db.TagList ? db.TagList.reduce((acc, tag) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {}) : {},
      costIndicator: db.DBInstanceStatus === 'available' ? 'active-cost' :
                     db.DBInstanceStatus === 'stopped' ? 'minimal-cost' : 'no-cost',
      canStop: ['available', 'storage-optimization'].includes(db.DBInstanceStatus)
    }));

    const clusters = DBClusters.map(cluster => ({
      id: cluster.DBClusterIdentifier,
      type: 'cluster',
      engine: cluster.Engine,
      engineVersion: cluster.EngineVersion,
      state: cluster.Status,
      multiAZ: cluster.MultiAZ,
      endpoint: cluster.Endpoint,
      readerEndpoint: cluster.ReaderEndpoint,
      port: cluster.Port,
      members: cluster.DBClusterMembers?.map(m => m.DBInstanceIdentifier) || [],
      tags: cluster.TagList ? cluster.TagList.reduce((acc, tag) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {}) : {},
      costIndicator: cluster.Status === 'available' ? 'active-cost' :
                     cluster.Status === 'stopped' ? 'minimal-cost' : 'no-cost',
      canStop: ['available'].includes(cluster.Status)
    }));

    return {
      region: regionName,
      instances,
      clusters,
      totalCount: instances.length + clusters.length
    };
  } catch (error) {
    console.error(`Error querying RDS in region ${regionName}:`, error.message);
    return {
      region: regionName,
      instances: [],
      clusters: [],
      totalCount: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching RDS instances and clusters across all regions...');

    const regions = await getAllRegions();
    console.log(`Querying ${regions.length} regions`);

    const promises = regions.map(region => queryRDSInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalInstances = data.reduce((sum, r) => sum + r.instances.length, 0);
    const totalClusters = data.reduce((sum, r) => sum + r.clusters.length, 0);

    console.log(`Found ${totalInstances} RDS instances and ${totalClusters} clusters across ${regions.length} regions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data,
        summary: {
          totalInstances,
          totalClusters,
          totalResources: totalInstances + totalClusters,
          totalRegions: regions.length,
          regionsWithResources: data.filter(r => r.totalCount > 0).length
        }
      })
    };
  } catch (error) {
    console.error('Error in list-rds handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch RDS resources',
        message: error.message
      })
    };
  }
};
