const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require('@aws-sdk/client-cost-explorer');

// Cost Explorer is a global service, always use us-east-1
const ce = new CostExplorerClient({ region: 'us-east-1' });

async function getCostSummary() {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get cost by service and region
  const response = await ce.send(
    new GetCostAndUsageCommand({
      TimePeriod: {
        Start: startDate,
        End: endDate
      },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' },
        { Type: 'DIMENSION', Key: 'REGION' }
      ]
    })
  );

  // Process cost data
  const costByService = {};
  let totalCost = 0;

  response.ResultsByTime.forEach(result => {
    result.Groups.forEach(group => {
      const [service, region] = group.Keys;
      const cost = parseFloat(group.Metrics.UnblendedCost.Amount);

      if (!costByService[service]) {
        costByService[service] = { total: 0, regions: {} };
      }

      costByService[service].total += cost;
      costByService[service].regions[region] =
        (costByService[service].regions[region] || 0) + cost;

      totalCost += cost;
    });
  });

  // Sort services by cost (descending)
  const sortedServices = Object.entries(costByService)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([service, data]) => ({
      service,
      cost: data.total,
      regions: data.regions
    }));

  return {
    period: { start: startDate, end: endDate },
    totalCost: totalCost.toFixed(2),
    services: sortedServices,
    topServices: sortedServices.slice(0, 10)
  };
}

async function getCostForecast() {
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const response = await ce.send(
      new GetCostForecastCommand({
        TimePeriod: {
          Start: startDate,
          End: endDate
        },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY'
      })
    );

    const forecastedCost = parseFloat(response.Total.Amount);

    return {
      period: { start: startDate, end: endDate },
      forecastedCost: forecastedCost.toFixed(2),
      confidence: response.ForecastResultsByTime?.[0]?.MeanValue
    };
  } catch (error) {
    console.error('Error getting cost forecast:', error);
    return null;
  }
}

async function getCostTrend() {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const response = await ce.send(
    new GetCostAndUsageCommand({
      TimePeriod: {
        Start: startDate,
        End: endDate
      },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost']
    })
  );

  const dailyCosts = response.ResultsByTime.map(result => ({
    date: result.TimePeriod.Start,
    cost: parseFloat(result.Total.UnblendedCost.Amount).toFixed(2)
  }));

  return {
    period: { start: startDate, end: endDate },
    dailyCosts
  };
}

async function getResourceCost(resourceId, resourceType, region, days = 30) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    // Note: This requires proper resource tagging with "ResourceId" tag
    const response = await ce.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: startDate, End: endDate },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
        Filter: {
          And: [
            {
              Dimensions: {
                Key: 'REGION',
                Values: [region]
              }
            },
            {
              Tags: {
                Key: 'ResourceId',
                Values: [resourceId]
              }
            }
          ]
        }
      })
    );

    const costs = response.ResultsByTime.map(r => parseFloat(r.Total.UnblendedCost.Amount));
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const avgDailyCost = costs.length > 0 ? totalCost / costs.length : 0;

    return {
      resourceId,
      resourceType,
      region,
      period: { start: startDate, end: endDate },
      totalCost: totalCost.toFixed(2),
      avgDailyCost: avgDailyCost.toFixed(2),
      monthlyCost: (avgDailyCost * 30).toFixed(2),
      // Estimate 80% savings when stopped (EBS still charged)
      savingsFromStop: (avgDailyCost * 30 * 0.8).toFixed(2)
    };
  } catch (error) {
    console.error(`Error getting cost for ${resourceId}:`, error);

    // Return estimated costs based on resource type if tags are not available
    return getEstimatedResourceCost(resourceType, region);
  }
}

function getEstimatedResourceCost(resourceType, region) {
  // Rough cost estimates when actual cost data is not available
  const estimates = {
    ec2: { hourly: 0.10, monthly: 73, savingsFromStop: 58 },      // t3.medium average
    rds: { hourly: 0.15, monthly: 109, savingsFromStop: 87 },     // db.t3.medium average
    redshift: { hourly: 0.25, monthly: 180, savingsFromStop: 144 }, // dc2.large
    'eks-nodegroup': { hourly: 0.10, monthly: 73, savingsFromStop: 58 }
  };

  const estimate = estimates[resourceType] || { hourly: 0.05, monthly: 36, savingsFromStop: 29 };

  return {
    resourceType,
    region,
    estimated: true,
    avgDailyCost: (estimate.hourly * 24).toFixed(2),
    monthlyCost: estimate.monthly.toFixed(2),
    savingsFromStop: estimate.savingsFromStop.toFixed(2),
    note: 'Estimated cost (actual cost requires ResourceId tag)'
  };
}

exports.handler = async (event) => {
  console.log('Cost analyzer invoked:', event.path);

  const path = event.path;
  const queryParams = event.queryStringParameters || {};

  try {
    if (path.endsWith('/summary')) {
      const summary = await getCostSummary();
      const forecast = await getCostForecast();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          ...summary,
          forecast
        })
      };
    } else if (path.endsWith('/trend')) {
      const trend = await getCostTrend();

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(trend)
      };
    } else if (path.includes('/resource/')) {
      const resourceId = path.split('/resource/')[1];
      const { resourceType, region } = queryParams;

      if (!resourceId || !resourceType || !region) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Missing required parameters',
            message: 'resourceType and region are required'
          })
        };
      }

      const resourceCost = await getResourceCost(resourceId, resourceType, region);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(resourceCost)
      };
    } else {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Endpoint not found',
          availableEndpoints: ['/costs/summary', '/costs/trend', '/costs/resource/{resourceId}']
        })
      };
    }
  } catch (error) {
    console.error('Error in cost analyzer:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Failed to analyze costs',
        message: error.message
      })
    };
  }
};
