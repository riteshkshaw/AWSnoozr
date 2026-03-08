import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import './EC2List.css';

function transformAggregatedEKS(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, clusters: [] };
    byRegion[r.region].totalCount++;
    byRegion[r.region].clusters.push({
      name: r.resourceId,
      accountId: r.accountId,
      version: r.version || '-',
      status: r.state,
      nodegroups: r.nodeGroups || [],
      totalNodes: r.totalNodes ?? 0,
      costIndicator: r.state === 'ACTIVE' ? 'active-cost' : 'no-cost'
    });
  });
  return Object.values(byRegion);
}

const EKSList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId') || sessionStorage.getItem('lastAccountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedClusters, setExpandedClusters] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchEKSClusters();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEKSClusters = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('eks', accountId);
        setData(transformAggregatedEKS(aggData.resources || []));
      } else {
        const response = await api.listEKS();
        setData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load EKS clusters');
      console.error('EKS list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCluster = (clusterName) => {
    setExpandedClusters({
      ...expandedClusters,
      [clusterName]: !expandedClusters[clusterName]
    });
  };

  const handleScaleNodeGroup = async (clusterName, nodegroupName, currentSize, minSize, maxSize, region, resourceAccountId) => {
    const key = `${clusterName}-${nodegroupName}`;
    const desiredSize = prompt(
      `Scale node group "${nodegroupName}" in cluster "${clusterName}"\n\n` +
      `Current size: ${currentSize}\n` +
      `Min: ${minSize}, Max: ${maxSize}\n\n` +
      `Enter desired size (or 0 to shut down):`
    );

    if (desiredSize === null) return;

    const newSize = parseInt(desiredSize, 10);
    if (isNaN(newSize) || newSize < minSize || newSize > maxSize) {
      setError(`Invalid size. Must be between ${minSize} and ${maxSize}`);
      return;
    }

    setActionLoading({ ...actionLoading, [key]: true });
    setError('');
    setSuccessMessage('');

    const effectiveAccountId = resourceAccountId || accountId;
    if (!effectiveAccountId) {
      setError('Cannot determine account for this resource. Navigate here via Account Report.');
      setActionLoading({ ...actionLoading, [key]: false });
      return;
    }

    try {
      await api.scaleEKSNodeGroup(clusterName, nodegroupName, newSize, region, effectiveAccountId);
      setSuccessMessage(`Node group scaling initiated: ${currentSize} → ${newSize} nodes`);
      setTimeout(() => fetchEKSClusters(), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to scale node group');
    } finally {
      setActionLoading({ ...actionLoading, [key]: false });
    }
  };

  if (isLoading) {
    return <div className="loading">Loading EKS clusters...</div>;
  }

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalClusters = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>EKS Clusters</h1>
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
                  <th>Cluster Name</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Node Groups</th>
                  <th>Total Nodes</th>
                  <th>Cost Indicator</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {regionData.clusters.map((cluster) => (
                  <React.Fragment key={cluster.name}>
                    <tr>
                      <td className="instance-id">{cluster.name}</td>
                      <td>{cluster.version}</td>
                      <td>
                        <span className={`state-badge ${cluster.status.toLowerCase()}`}>
                          {cluster.status}
                        </span>
                      </td>
                      <td>{cluster.nodegroups.length}</td>
                      <td>{cluster.totalNodes}</td>
                      <td>
                        <span className={`cost-indicator ${cluster.costIndicator}`}>
                          {cluster.costIndicator.replace('-', ' ')}
                        </span>
                      </td>
                      <td>
                        {cluster.nodegroups.length > 0 && (
                          <button
                            onClick={() => toggleCluster(cluster.name)}
                            className="button button-primary button-sm"
                          >
                            {expandedClusters[cluster.name] ? 'Hide' : 'Show'} Node Groups
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedClusters[cluster.name] && cluster.nodegroups.map((ng) => (
                      <tr key={`${cluster.name}-${ng.name}`} style={{ backgroundColor: '#f9f9f9' }}>
                        <td colSpan="1" style={{ paddingLeft: '40px', fontSize: '13px' }}>
                          ↳ {ng.name}
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {ng.instanceTypes?.join(', ') || '-'}
                        </td>
                        <td>
                          <span className={`state-badge ${ng.status.toLowerCase()}`}>
                            {ng.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          Desired: {ng.desiredSize}<br/>
                          Min: {ng.minSize} / Max: {ng.maxSize}
                        </td>
                        <td>{ng.desiredSize} nodes</td>
                        <td>
                          {ng.desiredSize === 0 ? (
                            <span className="cost-indicator no-cost">scaled to zero</span>
                          ) : (
                            <span className="cost-indicator active-cost">active cost</span>
                          )}
                        </td>
                        <td>
                          <button
                            onClick={() => handleScaleNodeGroup(
                              cluster.name,
                              ng.name,
                              ng.desiredSize,
                              ng.minSize,
                              ng.maxSize,
                              regionData.region,
                              cluster.accountId
                            )}
                            disabled={actionLoading[`${cluster.name}-${ng.name}`]}
                            className="button button-primary button-sm"
                          >
                            {actionLoading[`${cluster.name}-${ng.name}`] ? 'Scaling...' : 'Scale'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="actions-footer">
        <button onClick={fetchEKSClusters} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default EKSList;
