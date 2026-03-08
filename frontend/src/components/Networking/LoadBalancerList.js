import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';

const LoadBalancerList = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLoadBalancers();
  }, []);

  const fetchLoadBalancers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listLoadBalancers();
      setData(response.data.data);
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

  const totalLBs = data.reduce((sum, region) => sum + region.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>Load Balancers</h1>
        <p>Total: {totalLBs} Load Balancers across {data.length} regions</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {data.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} Load Balancers)
          </h2>

          {regionData.totalCount === 0 ? (
            <p className="no-resources">No Load Balancers in this region</p>
          ) : (
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
          )}
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
