import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import '../Compute/EC2List.css';

function transformAggregatedRedshift(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, clusters: [] };
    byRegion[r.region].totalCount++;
    byRegion[r.region].clusters.push({
      id: r.resourceId,
      nodeType: r.nodeType || '-',
      numberOfNodes: r.numberOfNodes || '-',
      status: r.state,
      costIndicator: r.state === 'available' ? 'active-cost' : 'no-cost',
      encrypted: false,
      availabilityZone: '-',
      canPause: r.state === 'available',
      canResume: r.state === 'paused'
    });
  });
  return Object.values(byRegion);
}

const RedshiftList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchRedshiftClusters();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRedshiftClusters = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('redshift', accountId);
        setData(transformAggregatedRedshift(aggData.resources || []));
      } else {
        const response = await api.listRedshift();
        setData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load Redshift clusters');
      console.error('Redshift list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (clusterId, action, region) => {
    const key = `${clusterId}-${action}`;
    setActionLoading({ ...actionLoading, [key]: true });
    setError('');
    setSuccessMessage('');

    const confirmMessage = action === 'pause'
      ? `Are you sure you want to pause Redshift cluster ${clusterId}? This will stop compute charges but storage charges continue.`
      : `Are you sure you want to resume Redshift cluster ${clusterId}?`;

    if (!window.confirm(confirmMessage)) {
      setActionLoading({ ...actionLoading, [key]: false });
      return;
    }

    try {
      if (action === 'pause') {
        await api.pauseRedshift(clusterId, region);
      } else {
        await api.resumeRedshift(clusterId, region);
      }

      setSuccessMessage(`Redshift cluster ${action} operation initiated successfully`);
      setTimeout(() => fetchRedshiftClusters(), 2000);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} Redshift cluster`);
    } finally {
      setActionLoading({ ...actionLoading, [key]: false });
    }
  };

  if (isLoading) {
    return <div className="loading">Loading Redshift clusters...</div>;
  }

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalClusters = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>Redshift Clusters</h1>
        <p>Total: {totalClusters} clusters across {activeRegions.length} regions</p>
      </div>

      {accountId && (
        <div className="account-filter-banner">
          Filtered to account: <strong>{accountId}</strong>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {activeRegions.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} clusters)
          </h2>

          <div className="card">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Cluster ID</th>
                  <th>Node Type</th>
                  <th>Nodes</th>
                  <th>Status</th>
                  <th>Cost Indicator</th>
                  <th>Encrypted</th>
                  <th>Availability Zone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {regionData.clusters.map((cluster) => (
                  <tr key={cluster.id}>
                    <td className="instance-id">{cluster.id}</td>
                    <td>{cluster.nodeType}</td>
                    <td>{cluster.numberOfNodes}</td>
                    <td>
                      <span className={`state-badge ${cluster.status}`}>
                        {cluster.status}
                      </span>
                    </td>
                    <td>
                      <span className={`cost-indicator ${cluster.costIndicator}`}>
                        {cluster.costIndicator.replace('-', ' ')}
                      </span>
                    </td>
                    <td>{cluster.encrypted ? 'Yes' : 'No'}</td>
                    <td>{cluster.availabilityZone}</td>
                    <td>
                      <div className="action-buttons">
                        {cluster.canPause && cluster.status === 'available' && (
                          <button
                            onClick={() => handleAction(cluster.id, 'pause', regionData.region)}
                            disabled={actionLoading[`${cluster.id}-pause`]}
                            className="button button-danger button-sm"
                          >
                            {actionLoading[`${cluster.id}-pause`] ? 'Pausing...' : 'Pause'}
                          </button>
                        )}
                        {cluster.canResume && cluster.status === 'paused' && (
                          <button
                            onClick={() => handleAction(cluster.id, 'resume', regionData.region)}
                            disabled={actionLoading[`${cluster.id}-resume`]}
                            className="button button-success button-sm"
                          >
                            {actionLoading[`${cluster.id}-resume`] ? 'Resuming...' : 'Resume'}
                          </button>
                        )}
                        {!cluster.canPause && !cluster.canResume && (
                          <span className="state-note">{cluster.status}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="actions-footer">
        <button onClick={fetchRedshiftClusters} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default RedshiftList;
