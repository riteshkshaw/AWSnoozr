import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';

const NATGatewayList = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchNATGateways();
  }, []);

  const fetchNATGateways = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listNATGateways();
      setData(response.data.data);
    } catch (err) {
      setError('Failed to load NAT Gateways');
      console.error('NAT Gateway list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading NAT Gateways...</div>;
  }

  const totalNATGateways = data.reduce((sum, region) => sum + region.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>NAT Gateways</h1>
        <p>Total: {totalNATGateways} NAT Gateways across {data.length} regions</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {data.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} NAT Gateways)
          </h2>

          {regionData.totalCount === 0 ? (
            <p className="no-resources">No NAT Gateways in this region</p>
          ) : (
            <div className="card">
              <table className="resource-table">
                <thead>
                  <tr>
                    <th>NAT Gateway ID</th>
                    <th>State</th>
                    <th>VPC ID</th>
                    <th>Subnet ID</th>
                    <th>Public IP</th>
                    <th>Cost Indicator</th>
                  </tr>
                </thead>
                <tbody>
                  {regionData.natGateways.map((nat) => (
                    <tr key={nat.id}>
                      <td className="instance-id">{nat.id}</td>
                      <td>
                        <span className={`state-badge ${nat.state}`}>
                          {nat.state}
                        </span>
                      </td>
                      <td>{nat.vpcId}</td>
                      <td>{nat.subnetId}</td>
                      <td>{nat.publicIp || '-'}</td>
                      <td>
                        <span className={`cost-indicator ${nat.costIndicator}`}>
                          {nat.costIndicator.replace('-', ' ')}
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
        <button onClick={fetchNATGateways} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default NATGatewayList;
