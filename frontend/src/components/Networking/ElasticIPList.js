import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';

const ElasticIPList = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchElasticIPs();
  }, []);

  const fetchElasticIPs = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listElasticIPs();
      setData(response.data.data);
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

  const totalEIPs = data.reduce((sum, region) => sum + region.totalCount, 0);
  const totalUnattached = data.reduce((sum, region) => sum + region.unattachedCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>Elastic IPs</h1>
        <p>
          Total: {totalEIPs} Elastic IPs across {data.length} regions
          {totalUnattached > 0 && (
            <span style={{ color: '#dc3545', marginLeft: '8px' }}>
              ({totalUnattached} unattached - costing money!)
            </span>
          )}
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {data.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} Elastic IPs)
          </h2>

          {regionData.totalCount === 0 ? (
            <p className="no-resources">No Elastic IPs in this region</p>
          ) : (
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
          )}
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
