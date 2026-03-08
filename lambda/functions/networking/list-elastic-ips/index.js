const { EC2Client, DescribeAddressesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');

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

async function queryElasticIPsInRegion(regionName) {
  try {
    const ec2 = new EC2Client({ region: regionName });
    const { Addresses } = await ec2.send(new DescribeAddressesCommand({}));

    const elasticIps = (Addresses || []).map(addr => ({
      ip: addr.PublicIp,
      allocationId: addr.AllocationId,
      domain: addr.Domain,
      instanceId: addr.InstanceId,
      networkInterfaceId: addr.NetworkInterfaceId,
      privateIpAddress: addr.PrivateIpAddress,
      associated: !!(addr.InstanceId || addr.NetworkInterfaceId),
      tags: addr.Tags ? addr.Tags.reduce((acc, tag) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {}) : {},
      // Unattached Elastic IPs cost $0.005/hour
      costIndicator: (!addr.InstanceId && !addr.NetworkInterfaceId) ? 'wasted-cost' : 'no-cost'
    }));

    return {
      region: regionName,
      elasticIps,
      totalCount: elasticIps.length,
      unattachedCount: elasticIps.filter(ip => !ip.associated).length
    };
  } catch (error) {
    console.error(`Error querying Elastic IPs in region ${regionName}:`, error.message);
    return {
      region: regionName,
      elasticIps: [],
      totalCount: 0,
      unattachedCount: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching Elastic IPs across all regions...');

    const regions = await getAllRegions();
    const promises = regions.map(region => queryElasticIPsInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalElasticIps = data.reduce((sum, r) => sum + r.totalCount, 0);
    const totalUnattached = data.reduce((sum, r) => sum + r.unattachedCount, 0);

    console.log(`Found ${totalElasticIps} Elastic IPs (${totalUnattached} unattached) across ${regions.length} regions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data,
        summary: {
          totalElasticIps,
          totalUnattached,
          totalRegions: regions.length,
          wastedCostAlert: totalUnattached > 0
        }
      })
    };
  } catch (error) {
    console.error('Error in list-elastic-ips handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch Elastic IPs',
        message: error.message
      })
    };
  }
};
