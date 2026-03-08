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
      fargateProfiles: r.fargateProfiles || [],
      computeType: r.computeType || 'unknown',
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
  const [workloads, setWorkloads] = useState({});       // clusterName → { namespaces }
  const [workloadsLoading, setWorkloadsLoading] = useState({});
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

  const toggleCluster = async (clusterName, cluster, region) => {
    const nowExpanded = !expandedClusters[clusterName];
    setExpandedClusters({ ...expandedClusters, [clusterName]: nowExpanded });

    // Fetch workloads on first expand for Fargate clusters
    if (nowExpanded && cluster.computeType === 'fargate' && !workloads[clusterName]) {
      setWorkloadsLoading(prev => ({ ...prev, [clusterName]: true }));
      try {
        const data = await api.listEKSWorkloads(clusterName, region, cluster.accountId || accountId);
        setWorkloads(prev => ({ ...prev, [clusterName]: data.namespaces || {} }));
      } catch (err) {
        setError(`Failed to load workloads for ${clusterName}: ${err.message}`);
      } finally {
        setWorkloadsLoading(prev => ({ ...prev, [clusterName]: false }));
      }
    }
  };

  const handleScaleDeployment = async (clusterName, namespace, deployment, replicas, region, clusterAccountId) => {
    const key = `${clusterName}-${namespace}-${deployment}`;
    const effectiveAccountId = clusterAccountId || accountId;

    if (!window.confirm(
      replicas === 0
        ? `Scale DOWN ${namespace}/${deployment} to 0 replicas? This stops all pods.`
        : `Scale UP ${namespace}/${deployment} to ${replicas} replicas?`
    )) return;

    setActionLoading(prev => ({ ...prev, [key]: true }));
    setError('');
    try {
      await api.scaleEKSDeployment(clusterName, namespace, deployment, replicas, region, effectiveAccountId);
      setSuccessMessage(`${namespace}/${deployment} scaled to ${replicas} replicas`);
      // Refresh workloads
      setWorkloads(prev => ({ ...prev, [clusterName]: undefined }));
      setTimeout(async () => {
        const refreshed = await api.listEKSWorkloads(clusterName, region, effectiveAccountId);
        setWorkloads(prev => ({ ...prev, [clusterName]: refreshed.namespaces || {} }));
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to scale ${deployment}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
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
                  <th>Compute</th>
                  <th>Node Groups / Profiles</th>
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
                      <td>
                        <span className={`state-badge ${
                          cluster.computeType === 'fargate' ? 'running' :
                          cluster.computeType === 'managed' ? 'available' :
                          cluster.computeType === 'self-managed' ? 'available' : ''
                        }`}>
                          {cluster.computeType === 'fargate' ? 'Fargate' :
                           cluster.computeType === 'managed' ? 'Managed EC2' :
                           cluster.computeType === 'self-managed' ? 'Self-Managed' : 'Unknown'}
                        </span>
                      </td>
                      <td>
                        {cluster.computeType === 'fargate'
                          ? cluster.fargateProfiles.length
                          : cluster.nodegroups.length}
                      </td>
                      <td>
                        {cluster.computeType === 'fargate' ? (
                          <span style={{ color: '#999', fontSize: '12px' }}>Serverless</span>
                        ) : cluster.totalNodes}
                      </td>

                      <td>
                        <span className={`cost-indicator ${cluster.costIndicator}`}>
                          {cluster.costIndicator.replace('-', ' ')}
                        </span>
                      </td>
                      <td>
                        {cluster.computeType === 'fargate' && (
                          <button
                            onClick={() => toggleCluster(cluster.name, cluster, regionData.region)}
                            className="button button-primary button-sm"
                          >
                            {workloadsLoading[cluster.name] ? 'Loading...' :
                              expandedClusters[cluster.name] ? 'Hide Workloads' : 'Show Workloads'}
                          </button>
                        )}
                        {cluster.computeType !== 'fargate' && cluster.nodegroups.length > 0 && (
                          <button
                            onClick={() => toggleCluster(cluster.name, cluster, regionData.region)}
                            className="button button-primary button-sm"
                          >
                            {expandedClusters[cluster.name] ? 'Hide' : 'Show'} Node Groups
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedClusters[cluster.name] && cluster.computeType === 'fargate' && (() => {
                      const nsData = workloads[cluster.name];
                      if (workloadsLoading[cluster.name] || !nsData) {
                        return (
                          <tr><td colSpan="8" style={{ textAlign: 'center', padding: '16px', color: '#999' }}>
                            {workloadsLoading[cluster.name] ? 'Loading workloads...' : 'No workload data yet.'}
                          </td></tr>
                        );
                      }
                      return Object.entries(nsData).map(([ns, nsInfo]) => (
                        <React.Fragment key={`${cluster.name}-ns-${ns}`}>
                          {/* Namespace header row */}
                          <tr style={{ backgroundColor: '#f0f4ff' }}>
                            <td colSpan="3" style={{ paddingLeft: '32px', fontWeight: 700, fontSize: '13px', color: '#444' }}>
                              📁 {ns}
                            </td>
                            <td colSpan="2" style={{ fontSize: '12px', color: '#666' }}>
                              {nsInfo.deployments.length} deployments · {nsInfo.pods.length} pods
                            </td>
                            <td colSpan="3">
                              {nsInfo.deployments.some(d => d.replicas > 0) && (
                                <button
                                  className="button button-danger button-sm"
                                  onClick={() => {
                                    nsInfo.deployments.filter(d => d.replicas > 0).forEach(d =>
                                      handleScaleDeployment(cluster.name, ns, d.name, 0, regionData.region, cluster.accountId)
                                    );
                                  }}
                                >
                                  Scale All to 0
                                </button>
                              )}
                            </td>
                          </tr>
                          {/* Deployment rows */}
                          {nsInfo.deployments.map(dep => (
                            <tr key={`${cluster.name}-${ns}-${dep.name}`} style={{ backgroundColor: '#fafbff' }}>
                              <td colSpan="2" style={{ paddingLeft: '52px', fontSize: '13px' }}>
                                ↳ {dep.name}
                              </td>
                              <td>
                                <span className={`state-badge ${dep.availableReplicas > 0 ? 'active' : 'stopped'}`}>
                                  {dep.readyReplicas}/{dep.replicas} ready
                                </span>
                              </td>
                              <td style={{ fontSize: '12px', color: '#666' }}>
                                {dep.image?.split('/').pop() || '-'}
                              </td>
                              <td>
                                {dep.replicas > 0
                                  ? <span className="cost-indicator active-cost">active cost</span>
                                  : <span className="cost-indicator no-cost">scaled to 0</span>
                                }
                              </td>
                              <td colSpan="3">
                                <div className="action-buttons">
                                  {dep.replicas > 0 ? (
                                    <button
                                      className="button button-danger button-sm"
                                      disabled={actionLoading[`${cluster.name}-${ns}-${dep.name}`]}
                                      onClick={() => handleScaleDeployment(cluster.name, ns, dep.name, 0, regionData.region, cluster.accountId)}
                                    >
                                      {actionLoading[`${cluster.name}-${ns}-${dep.name}`] ? 'Scaling...' : 'Scale to 0'}
                                    </button>
                                  ) : (
                                    <button
                                      className="button button-success button-sm"
                                      disabled={actionLoading[`${cluster.name}-${ns}-${dep.name}`]}
                                      onClick={() => {
                                        const n = prompt(`Restore ${dep.name} — how many replicas?`, '1');
                                        if (n && !isNaN(parseInt(n))) {
                                          handleScaleDeployment(cluster.name, ns, dep.name, parseInt(n), regionData.region, cluster.accountId);
                                        }
                                      }}
                                    >
                                      {actionLoading[`${cluster.name}-${ns}-${dep.name}`] ? 'Scaling...' : 'Restore'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ));
                    })()}
                    {expandedClusters[cluster.name] && cluster.computeType !== 'fargate' && cluster.nodegroups.map((ng) => (
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
