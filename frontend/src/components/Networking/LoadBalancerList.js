import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import '../Compute/EC2List.css';

function transformAggregatedLB(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, loadBalancers: [] };
    byRegion[r.region].totalCount++;
    byRegion[r.region].loadBalancers.push({
      arn: r.resourceId,
      name: r.name,
      type: '-',
      scheme: '-',
      state: r.state,
      dnsName: '-',
      costIndicator: r.state === 'active' ? 'active-cost' : 'no-cost'
    });
  });
  return Object.values(byRegion);
}

const LoadBalancerList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLoadBalancers();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLoadBalancers = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('load-balancer', accountId);
        setData(transformAggregatedLB(aggData.resources || []));
      } else {
        const response = await api.listLoadBalancers();
        setData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load Load Balancers');
      console.error('Load Balancer list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading Load Balancers...</div>;
  }

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalLBs = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>Load Balancers</h1>
        <p>Total: {totalLBs} Load Balancers across {activeRegions.length} regions</p>
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
            {regionData.region} ({regionData.totalCount} Load Balancers)
          </h2>

          <div className="card">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Scheme</th>
                  <th>State</th>
                  <th>DNS Name</th>
                  <th>Cost Indicator</th>
                </tr>
              </thead>
              <tbody>
                {regionData.loadBalancers.map((lb) => (
                  <tr key={lb.arn}>
                    <td className="instance-id">{lb.name}</td>
                    <td>{lb.type}</td>
                    <td>{lb.scheme}</td>
                    <td>
                      <span className={`state-badge ${lb.state}`}>
                        {lb.state}
                      </span>
                    </td>
                    <td>{lb.dnsName}</td>
                    <td>
                      <span className={`cost-indicator ${lb.costIndicator}`}>
                        {lb.costIndicator.replace('-', ' ')}
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
        <button onClick={fetchLoadBalancers} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default LoadBalancerList;
