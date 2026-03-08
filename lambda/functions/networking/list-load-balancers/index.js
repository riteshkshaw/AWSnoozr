const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');
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

async function queryLoadBalancersInRegion(regionName) {
  try {
    const elbv2 = new ElasticLoadBalancingV2Client({ region: regionName });
    const { LoadBalancers } = await elbv2.send(new DescribeLoadBalancersCommand({}));

    const loadBalancers = (LoadBalancers || []).map(lb => ({
      arn: lb.LoadBalancerArn,
      name: lb.LoadBalancerName,
      dnsName: lb.DNSName,
      type: lb.Type, // application, network, gateway
      scheme: lb.Scheme, // internet-facing or internal
      state: lb.State?.Code,
      vpcId: lb.VpcId,
      availabilityZones: lb.AvailabilityZones?.map(az => az.ZoneName) || [],
      createdAt: lb.CreatedTime,
      ipAddressType: lb.IpAddressType,
      costIndicator: 'active-cost' // Load balancers always cost money when provisioned
    }));

    return {
      region: regionName,
      loadBalancers,
      totalCount: loadBalancers.length
    };
  } catch (error) {
    console.error(`Error querying Load Balancers in region ${regionName}:`, error.message);
    return {
      region: regionName,
      loadBalancers: [],
      totalCount: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching Load Balancers across all regions...');

    const regions = await getAllRegions();
    const promises = regions.map(region => queryLoadBalancersInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalLoadBalancers = data.reduce((sum, r) => sum + r.totalCount, 0);

    console.log(`Found ${totalLoadBalancers} Load Balancers across ${regions.length} regions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data,
        summary: {
          totalLoadBalancers,
          totalRegions: regions.length
        }
      })
    };
  } catch (error) {
    console.error('Error in list-load-balancers handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch Load Balancers',
        message: error.message
      })
    };
  }
};
