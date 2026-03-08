import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';

const RDSList = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchRDSResources();
  }, []);

  const fetchRDSResources = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listRDS();
      setData(response.data.data);
    } catch (err) {
      setError('Failed to load RDS resources');
      console.error('RDS list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (resourceId, action, resourceType, region) => {
    const key = `${resourceId}-${action}`;
    setActionLoading({ ...actionLoading, [key]: true });
    setError('');
    setSuccessMessage('');

    const confirmMessage = action === 'stop'
      ? `Are you sure you want to stop RDS ${resourceType} ${resourceId}?`
      : `Are you sure you want to start RDS ${resourceType} ${resourceId}?`;

    if (!window.confirm(confirmMessage)) {
      setActionLoading({ ...actionLoading, [key]: false });
      return;
    }

    try {
      if (action === 'stop') {
        await api.stopRDS(resourceId, resourceType, region);
      } else {
        await api.startRDS(resourceId, resourceType, region);
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

  const totalResources = data.reduce((sum, region) => sum + region.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>RDS Resources</h1>
        <p>Total: {totalResources} resources across {data.length} regions</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {data.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} resources)
          </h2>

          {regionData.totalCount === 0 ? (
            <p className="no-resources">No RDS resources in this region</p>
          ) : (
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
                                  onClick={() => handleAction(instance.id, 'stop', 'instance', regionData.region)}
                                  disabled={actionLoading[`${instance.id}-stop`]}
                                  className="button button-danger button-sm"
                                >
                                  {actionLoading[`${instance.id}-stop`] ? 'Stopping...' : 'Stop'}
                                </button>
                              )}
                              {instance.state === 'stopped' && (
                                <button
                                  onClick={() => handleAction(instance.id, 'start', 'instance', regionData.region)}
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
                                  onClick={() => handleAction(cluster.id, 'stop', 'cluster', regionData.region)}
                                  disabled={actionLoading[`${cluster.id}-stop`]}
                                  className="button button-danger button-sm"
                                >
                                  {actionLoading[`${cluster.id}-stop`] ? 'Stopping...' : 'Stop'}
                                </button>
                              )}
                              {cluster.state === 'stopped' && (
                                <button
                                  onClick={() => handleAction(cluster.id, 'start', 'cluster', regionData.region)}
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
          )}
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
