import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import '../Compute/EC2List.css';

function transformAggregatedNAT(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, natGateways: [] };
    byRegion[r.region].totalCount++;
    byRegion[r.region].natGateways.push({
      id: r.resourceId,
      state: r.state,
      vpcId: '-',
      subnetId: '-',
      publicIp: '-',
      costIndicator: r.state === 'available' ? 'active-cost' : 'no-cost'
    });
  });
  return Object.values(byRegion);
}

const NATGatewayList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchNATGateways();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNATGateways = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('nat-gateway', accountId);
        setData(transformAggregatedNAT(aggData.resources || []));
      } else {
        const response = await api.listNATGateways();
        setData(response.data.data);
      }
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

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalNATGateways = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>NAT Gateways</h1>
        <p>Total: {totalNATGateways} NAT Gateways across {activeRegions.length} regions</p>
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
            {regionData.region} ({regionData.totalCount} NAT Gateways)
          </h2>

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
