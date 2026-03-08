const { EKSClient, ListClustersCommand, DescribeClusterCommand, ListNodegroupsCommand, DescribeNodegroupCommand } = require('@aws-sdk/client-eks');
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

async function queryEKSInRegion(regionName) {
  try {
    const eks = new EKSClient({ region: regionName });

    // List all clusters in the region
    const { clusters: clusterNames } = await eks.send(new ListClustersCommand({}));

    if (!clusterNames || clusterNames.length === 0) {
      return {
        region: regionName,
        clusters: [],
        totalCount: 0
      };
    }

    // Get detailed information for each cluster
    const clusterPromises = clusterNames.map(async (clusterName) => {
      try {
        const { cluster } = await eks.send(new DescribeClusterCommand({ name: clusterName }));

        // Get node groups for this cluster
        const { nodegroups: nodegroupNames } = await eks.send(
          new ListNodegroupsCommand({ clusterName })
        );

        // Get detailed node group information
        const nodegroupPromises = (nodegroupNames || []).map(async (nodegroupName) => {
          try {
            const { nodegroup } = await eks.send(
              new DescribeNodegroupCommand({ clusterName, nodegroupName })
            );
            return {
              name: nodegroup.nodegroupName,
              status: nodegroup.status,
              instanceTypes: nodegroup.instanceTypes,
              scalingConfig: nodegroup.scalingConfig,
              desiredSize: nodegroup.scalingConfig?.desiredSize,
              minSize: nodegroup.scalingConfig?.minSize,
              maxSize: nodegroup.scalingConfig?.maxSize,
              diskSize: nodegroup.diskSize,
              amiType: nodegroup.amiType,
              tags: nodegroup.tags || {}
            };
          } catch (err) {
            console.error(`Error describing node group ${nodegroupName}:`, err.message);
            return null;
          }
        });

        const nodegroups = (await Promise.all(nodegroupPromises)).filter(ng => ng !== null);

        return {
          name: cluster.name,
          arn: cluster.arn,
          version: cluster.version,
          endpoint: cluster.endpoint,
          status: cluster.status,
          platformVersion: cluster.platformVersion,
          createdAt: cluster.createdAt,
          tags: cluster.tags || {},
          nodegroups,
          totalNodes: nodegroups.reduce((sum, ng) => sum + (ng.desiredSize || 0), 0),
          costIndicator: cluster.status === 'ACTIVE' ? 'active-cost' : 'no-cost'
        };
      } catch (err) {
        console.error(`Error describing cluster ${clusterName}:`, err.message);
        return null;
      }
    });

    const clusters = (await Promise.all(clusterPromises)).filter(c => c !== null);

    return {
      region: regionName,
      clusters,
      totalCount: clusters.length
    };
  } catch (error) {
    console.error(`Error querying EKS in region ${regionName}:`, error.message);
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
    console.log('Fetching EKS clusters across all regions...');

    const regions = await getAllRegions();
    console.log(`Querying ${regions.length} regions`);

    const promises = regions.map(region => queryEKSInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalClusters = data.reduce((sum, r) => sum + r.totalCount, 0);
    const totalNodes = data.reduce((sum, r) =>
      sum + r.clusters.reduce((s, c) => s + c.totalNodes, 0), 0
    );

    console.log(`Found ${totalClusters} EKS clusters with ${totalNodes} total nodes across ${regions.length} regions`);

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
          totalNodes,
          totalRegions: regions.length,
          regionsWithClusters: data.filter(r => r.totalCount > 0).length
        }
      })
    };
  } catch (error) {
    console.error('Error in list-eks-clusters handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch EKS clusters',
        message: error.message
      })
    };
  }
};
