import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import '../Compute/EC2List.css';

function transformAggregatedRDS(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, instances: [], clusters: [] };
    byRegion[r.region].totalCount++;
    if (r.resourceType === 'rds-cluster') {
      byRegion[r.region].clusters.push({
        id: r.resourceId,
        accountId: r.accountId,
        engine: r.engine || '-',
        engineVersion: '',
        state: r.state,
        costIndicator: r.state === 'available' ? 'active-cost' : 'no-cost',
        multiAZ: false,
        members: [],
        canStop: r.state === 'available'
      });
    } else {
      byRegion[r.region].instances.push({
        id: r.resourceId,
        accountId: r.accountId,
        engine: r.engine || '-',
        engineVersion: '',
        instanceClass: r.instanceClass || '-',
        state: r.state,
        costIndicator: r.state === 'available' ? 'active-cost' : 'no-cost',
        multiAZ: false,
        allocatedStorage: '-',
        storageType: '-',
        canStop: r.state === 'available'
      });
    }
  });
  return Object.values(byRegion);
}

const RDSList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId') || sessionStorage.getItem('lastAccountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchRDSResources();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRDSResources = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('rds', accountId);
        setData(transformAggregatedRDS(aggData.resources || []));
      } else {
        const response = await api.listRDS();
        setData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load RDS resources');
      console.error('RDS list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (resourceId, action, resourceType, region, resourceAccountId) => {
    const key = `${resourceId}-${action}`;
    setActionLoading({ ...actionLoading, [key]: true });
    setError('');
    setSuccessMessage('');

    const effectiveAccountId = resourceAccountId || accountId;
    if (!effectiveAccountId) {
      setError('Cannot determine account for this resource. Navigate here via Account Report.');
      setActionLoading({ ...actionLoading, [key]: false });
      return;
    }

    const confirmMessage = action === 'stop'
      ? `Are you sure you want to stop RDS ${resourceType} ${resourceId}?`
      : `Are you sure you want to start RDS ${resourceType} ${resourceId}?`;

    if (!window.confirm(confirmMessage)) {
      setActionLoading({ ...actionLoading, [key]: false });
      return;
    }

    try {
      if (action === 'stop') {
        await api.stopRDS(resourceId, resourceType, region, effectiveAccountId);
      } else {
        await api.startRDS(resourceId, resourceType, region, effectiveAccountId);
      }

      setSuccessMessage(`RDS ${resourceType} ${action} operation initiated successfully`);
      setTimeout(() => fetchRDSResources(), 2000);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} RDS ${resourceType}`);
    } finally {
      setActionLoading({ ...actionLoading, [key]: false });
    }
  };

  if (isLoading) {
    return <div className="loading">Loading RDS resources...</div>;
  }

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalResources = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>RDS Resources</h1>
        <p>Total: {totalResources} resources across {activeRegions.length} regions</p>
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
            {regionData.region} ({regionData.totalCount} resources)
          </h2>

          <>
            {regionData.instances.length > 0 && (
              <div className="card">
                <h3 style={{ marginBottom: '16px', fontSize: '16px', color: '#666' }}>
                  DB Instances ({regionData.instances.length})
                </h3>
                <table className="resource-table">
                  <thead>
                    <tr>
                      <th>Instance ID</th>
                      <th>Engine</th>
                      <th>Instance Class</th>
                      <th>State</th>
                      <th>Cost Indicator</th>
                      <th>Multi-AZ</th>
                      <th>Storage</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionData.instances.map((instance) => (
                      <tr key={instance.id}>
                        <td className="instance-id">{instance.id}</td>
                        <td>{instance.engine} {instance.engineVersion}</td>
                        <td>{instance.instanceClass}</td>
                        <td>
                          <span className={`state-badge ${instance.state}`}>
                            {instance.state}
                          </span>
                        </td>
                        <td>
                          <span className={`cost-indicator ${instance.costIndicator}`}>
                            {instance.costIndicator.replace('-', ' ')}
                          </span>
                        </td>
                        <td>{instance.multiAZ ? 'Yes' : 'No'}</td>
                        <td>{instance.allocatedStorage} GB ({instance.storageType})</td>
                        <td>
                          <div className="action-buttons">
                            {instance.canStop && instance.state === 'available' && (
                              <button
                                onClick={() => handleAction(instance.id, 'stop', 'instance', regionData.region, instance.accountId)}
                                disabled={actionLoading[`${instance.id}-stop`]}
                                className="button button-danger button-sm"
                              >
                                {actionLoading[`${instance.id}-stop`] ? 'Stopping...' : 'Stop'}
                              </button>
                            )}
                            {instance.state === 'stopped' && (
                              <button
                                onClick={() => handleAction(instance.id, 'start', 'instance', regionData.region, instance.accountId)}
                                disabled={actionLoading[`${instance.id}-start`]}
                                className="button button-success button-sm"
                              >
                                {actionLoading[`${instance.id}-start`] ? 'Starting...' : 'Start'}
                              </button>
                            )}
                            {!instance.canStop && instance.state !== 'stopped' && (
                              <span className="state-note">{instance.state}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {regionData.clusters.length > 0 && (
              <div className="card" style={{ marginTop: '20px' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px', color: '#666' }}>
                  DB Clusters ({regionData.clusters.length})
                </h3>
                <table className="resource-table">
                  <thead>
                    <tr>
                      <th>Cluster ID</th>
                      <th>Engine</th>
                      <th>State</th>
                      <th>Cost Indicator</th>
                      <th>Multi-AZ</th>
                      <th>Members</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionData.clusters.map((cluster) => (
                      <tr key={cluster.id}>
                        <td className="instance-id">{cluster.id}</td>
                        <td>{cluster.engine} {cluster.engineVersion}</td>
                        <td>
                          <span className={`state-badge ${cluster.state}`}>
                            {cluster.state}
                          </span>
                        </td>
                        <td>
                          <span className={`cost-indicator ${cluster.costIndicator}`}>
                            {cluster.costIndicator.replace('-', ' ')}
                          </span>
                        </td>
                        <td>{cluster.multiAZ ? 'Yes' : 'No'}</td>
                        <td>{cluster.members.length} instances</td>
                        <td>
                          <div className="action-buttons">
                            {cluster.canStop && cluster.state === 'available' && (
                              <button
                                onClick={() => handleAction(cluster.id, 'stop', 'cluster', regionData.region, cluster.accountId)}
                                disabled={actionLoading[`${cluster.id}-stop`]}
                                className="button button-danger button-sm"
                              >
                                {actionLoading[`${cluster.id}-stop`] ? 'Stopping...' : 'Stop'}
                              </button>
                            )}
                            {cluster.state === 'stopped' && (
                              <button
                                onClick={() => handleAction(cluster.id, 'start', 'cluster', regionData.region, cluster.accountId)}
                                disabled={actionLoading[`${cluster.id}-start`]}
                                className="button button-success button-sm"
                              >
                                {actionLoading[`${cluster.id}-start`] ? 'Starting...' : 'Start'}
                              </button>
                            )}
                            {!cluster.canStop && cluster.state !== 'stopped' && (
                              <span className="state-note">{cluster.state}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        </div>
      ))}

      <div className="actions-footer">
        <button onClick={fetchRDSResources} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default RDSList;
