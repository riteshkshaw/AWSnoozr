const { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');

// Cache regions to avoid repeated API calls
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

async function queryEC2InRegion(regionName) {
  try {
    const ec2 = new EC2Client({ region: regionName });
    const { Reservations } = await ec2.send(new DescribeInstancesCommand({}));

    const instances = Reservations.flatMap(r =>
      r.Instances.map(i => ({
        id: i.InstanceId,
        type: i.InstanceType,
        state: i.State.Name,
        launchTime: i.LaunchTime,
        privateIp: i.PrivateIpAddress,
        publicIp: i.PublicIpAddress,
        platform: i.Platform || 'linux',
        availabilityZone: i.Placement?.AvailabilityZone,
        tags: i.Tags ? i.Tags.reduce((acc, tag) => {
          acc[tag.Key] = tag.Value;
          return acc;
        }, {}) : {},
        costIndicator: i.State.Name === 'running' ? 'active-cost' :
                       i.State.Name === 'stopped' ? 'minimal-cost' : 'no-cost',
        vpcId: i.VpcId,
        subnetId: i.SubnetId,
        securityGroups: i.SecurityGroups?.map(sg => sg.GroupName) || []
      }))
    );

    return {
      region: regionName,
      instances,
      count: instances.length
    };
  } catch (error) {
    console.error(`Error querying EC2 in region ${regionName}:`, error.message);
    return {
      region: regionName,
      instances: [],
      count: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching EC2 instances across all regions...');

    const regions = await getAllRegions();
    console.log(`Querying ${regions.length} regions`);

    // Query all regions in parallel
    const promises = regions.map(region => queryEC2InRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    // Extract successful results
    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalInstances = data.reduce((sum, r) => sum + r.count, 0);

    console.log(`Found ${totalInstances} EC2 instances across ${regions.length} regions`);

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
          totalRegions: regions.length,
          regionsWithInstances: data.filter(r => r.count > 0).length
        }
      })
    };
  } catch (error) {
    console.error('Error in list-ec2 handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch EC2 instances',
        message: error.message
      })
    };
  }
};
