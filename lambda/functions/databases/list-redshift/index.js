const { RedshiftClient, DescribeClustersCommand } = require('@aws-sdk/client-redshift');
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

async function queryRedshiftInRegion(regionName) {
  try {
    const redshift = new RedshiftClient({ region: regionName });
    const { Clusters } = await redshift.send(new DescribeClustersCommand({}));

    const clusters = (Clusters || []).map(cluster => ({
      id: cluster.ClusterIdentifier,
      nodeType: cluster.NodeType,
      numberOfNodes: cluster.NumberOfNodes,
      status: cluster.ClusterStatus,
      availabilityZone: cluster.AvailabilityZone,
      endpoint: cluster.Endpoint?.Address,
      port: cluster.Endpoint?.Port,
      databaseName: cluster.DBName,
      masterUsername: cluster.MasterUsername,
      encrypted: cluster.Encrypted,
      vpcId: cluster.VpcId,
      tags: cluster.Tags ? cluster.Tags.reduce((acc, tag) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {}) : {},
      costIndicator: cluster.ClusterStatus === 'available' ? 'active-cost' :
                     cluster.ClusterStatus === 'paused' ? 'minimal-cost' : 'no-cost',
      canPause: cluster.ClusterStatus === 'available',
      canResume: cluster.ClusterStatus === 'paused'
    }));

    return {
      region: regionName,
      clusters,
      totalCount: clusters.length
    };
  } catch (error) {
    console.error(`Error querying Redshift in region ${regionName}:`, error.message);
    return {
      region: regionName,
      clusters: [],
      totalCount: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching Redshift clusters across all regions...');

    const regions = await getAllRegions();
    console.log(`Querying ${regions.length} regions`);

    const promises = regions.map(region => queryRedshiftInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalClusters = data.reduce((sum, r) => sum + r.totalCount, 0);

    console.log(`Found ${totalClusters} Redshift clusters across ${regions.length} regions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data,
        summary: {
          totalClusters,
          totalRegions: regions.length,
          regionsWithClusters: data.filter(r => r.totalCount > 0).length
        }
      })
    };
  } catch (error) {
    console.error('Error in list-redshift handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch Redshift clusters',
        message: error.message
      })
    };
  }
};
