const { EC2Client, DescribeVolumesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');

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

async function queryEBSInRegion(regionName) {
  try {
    const ec2 = new EC2Client({ region: regionName });
    const { Volumes } = await ec2.send(new DescribeVolumesCommand({}));

    const volumes = (Volumes || []).map(vol => ({
      id: vol.VolumeId,
      size: vol.Size,
      type: vol.VolumeType,
      state: vol.State,
      iops: vol.Iops,
      throughput: vol.Throughput,
      encrypted: vol.Encrypted,
      availabilityZone: vol.AvailabilityZone,
      attached: vol.Attachments && vol.Attachments.length > 0,
      attachments: vol.Attachments?.map(att => ({
        instanceId: att.InstanceId,
        device: att.Device,
        state: att.State
      })) || [],
      createdAt: vol.CreateTime,
      tags: vol.Tags ? vol.Tags.reduce((acc, tag) => {
        acc[tag.Key] = tag.Value;
        return acc;
      }, {}) : {},
      // Unattached volumes are wasted cost
      costIndicator: vol.Attachments?.length === 0 ? 'wasted-cost' : 'active-cost'
    }));

    return {
      region: regionName,
      volumes,
      totalCount: volumes.length,
      unattachedCount: volumes.filter(v => !v.attached).length
    };
  } catch (error) {
    console.error(`Error querying EBS volumes in region ${regionName}:`, error.message);
    return {
      region: regionName,
      volumes: [],
      totalCount: 0,
      unattachedCount: 0,
      error: error.message
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log('Fetching EBS volumes across all regions...');

    const regions = await getAllRegions();
    const promises = regions.map(region => queryEBSInRegion(region.RegionName));
    const results = await Promise.allSettled(promises);

    const data = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    const totalVolumes = data.reduce((sum, r) => sum + r.totalCount, 0);
    const totalUnattached = data.reduce((sum, r) => sum + r.unattachedCount, 0);

    console.log(`Found ${totalVolumes} EBS volumes (${totalUnattached} unattached) across ${regions.length} regions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        data,
        summary: {
          totalVolumes,
          totalUnattached,
          totalRegions: regions.length,
          wastedCostAlert: totalUnattached > 0
        }
      })
    };
  } catch (error) {
    console.error('Error in list-ebs-volumes handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to fetch EBS volumes',
        message: error.message
      })
    };
  }
};
