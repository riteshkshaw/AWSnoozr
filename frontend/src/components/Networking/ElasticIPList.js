import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import '../Compute/EC2List.css';

function transformAggregatedEIP(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, unattachedCount: 0, elasticIps: [] };
    byRegion[r.region].totalCount++;
    const associated = r.state === 'associated';
    if (!associated) byRegion[r.region].unattachedCount++;
    byRegion[r.region].elasticIps.push({
      ip: r.name,
      allocationId: r.resourceId,
      associated,
      instanceId: '-',
      costIndicator: associated ? 'active-cost' : 'wasted-cost'
    });
  });
  return Object.values(byRegion);
}

const ElasticIPList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchElasticIPs();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchElasticIPs = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('elastic-ip', accountId);
        setData(transformAggregatedEIP(aggData.resources || []));
      } else {
        const response = await api.listElasticIPs();
        setData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load Elastic IPs');
      console.error('Elastic IP list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading Elastic IPs...</div>;
  }

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalEIPs = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);
  const totalUnattached = activeRegions.reduce((sum, r) => sum + r.unattachedCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>Elastic IPs</h1>
        <p>
          Total: {totalEIPs} Elastic IPs across {activeRegions.length} regions
          {totalUnattached > 0 && (
            <span style={{ color: '#dc3545', marginLeft: '8px' }}>
              ({totalUnattached} unattached - costing money!)
            </span>
          )}
        </p>
      </div>

      {accountId && (
        <div className="account-filter-banner">
          Filtered to account: <strong>{accountId}</strong>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {activeRegions.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} Elastic IPs)
          </h2>

          <div className="card">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Public IP</th>
                  <th>Allocation ID</th>
                  <th>Associated</th>
                  <th>Instance ID</th>
                  <th>Cost Indicator</th>
                </tr>
              </thead>
              <tbody>
                {regionData.elasticIps.map((eip) => (
                  <tr key={eip.allocationId}>
                    <td className="instance-id">{eip.ip}</td>
                    <td>{eip.allocationId}</td>
                    <td>
                      <span className={`state-badge ${eip.associated ? 'running' : 'stopped'}`}>
                        {eip.associated ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{eip.instanceId || '-'}</td>
                    <td>
                      <span className={`cost-indicator ${eip.costIndicator}`}>
                        {eip.costIndicator.replace('-', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="actions-footer">
        <button onClick={fetchElasticIPs} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default ElasticIPList;
