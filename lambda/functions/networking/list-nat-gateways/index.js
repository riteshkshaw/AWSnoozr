const { EC2Client, DescribeNatGatewaysCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');

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

async function queryNATGatewaysInRegion(regionName) {
  try {
    const ec2 = new EC2Client({ region: regionName });
    const { NatGateways } = await ec2.send(new DescribeNatGatewaysCommand({}));

    const natGateways = (NatGateways || []).map(nat => ({
      id: nat.NatGatewayId,
      state: nat.State,
      vpcId: nat.VpcId,
      subnetId: nat.SubnetId,
      connectivityType: nat.ConnectivityType,
      createdAt: nat.CreateTime,
      publicIp: nat.NatGatewayAddresses?.[0]?.PublicIp,
      privateIp: nat.NatGatewayAddresses?.[0]?.PrivateIp,
      tags: nat.Tags ? nat.Tags.reduce((acc, tag) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {}) : {},
      costIndicator: nat.State === 'available' ? 'active-cost' : 'no-cost'
    }));

    return {
      region: regionName,
      natGateways,
      totalCount: natGateways.length
    };
  } catch (error) {
    console.error(`Error querying NAT Gateways in region ${regionName}:`, error.message);
    return {
      region: regionName,
      natGateways: [],
      totalCount: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching NAT Gateways across all regions...');

    const regions = await getAllRegions();
    const promises = regions.map(region => queryNATGatewaysInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalNATGateways = data.reduce((sum, r) => sum + r.totalCount, 0);

    console.log(`Found ${totalNATGateways} NAT Gateways across ${regions.length} regions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data,
        summary: {
          totalNATGateways,
          totalRegions: regions.length
        }
      })
    };
  } catch (error) {
    console.error('Error in list-nat-gateways handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch NAT Gateways',
        message: error.message
      })
    };
  }
};
