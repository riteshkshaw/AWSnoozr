import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import '../Compute/EC2List.css';

function transformAggregatedEBS(resources) {
  const byRegion = {};
  resources.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { region: r.region, totalCount: 0, unattachedCount: 0, volumes: [] };
    byRegion[r.region].totalCount++;
    const attached = r.state === 'in-use';
    if (!attached) byRegion[r.region].unattachedCount++;
    byRegion[r.region].volumes.push({
      id: r.resourceId,
      size: '-',
      type: '-',
      state: r.state,
      attached,
      attachments: [],
      costIndicator: attached ? 'active-cost' : 'wasted-cost'
    });
  });
  return Object.values(byRegion);
}

const EBSVolumeList = () => {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get('accountId');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEBSVolumes();
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEBSVolumes = async () => {
    setIsLoading(true);
    setError('');

    try {
      if (accountId) {
        const aggData = await api.aggregateResources('ebs', accountId);
        setData(transformAggregatedEBS(aggData.resources || []));
      } else {
        const response = await api.listEBSVolumes();
        setData(response.data.data);
      }
    } catch (err) {
      setError('Failed to load EBS volumes');
      console.error('EBS volume list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading EBS volumes...</div>;
  }

  const activeRegions = data.filter(r => r.totalCount > 0);
  const totalVolumes = activeRegions.reduce((sum, r) => sum + r.totalCount, 0);
  const totalUnattached = activeRegions.reduce((sum, r) => sum + r.unattachedCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>EBS Volumes</h1>
        <p>
          Total: {totalVolumes} volumes across {activeRegions.length} regions
          {totalUnattached > 0 && (
            <span style={{ color: '#dc3545', marginLeft: '8px' }}>
              ({totalUnattached} unattached - wasted cost!)
            </span>
          )}
        </p>
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
            {regionData.region} ({regionData.totalCount} volumes)
          </h2>

          <div className="card">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Volume ID</th>
                  <th>Size</th>
                  <th>Type</th>
                  <th>State</th>
                  <th>Attached</th>
                  <th>Instance ID</th>
                  <th>Cost Indicator</th>
                </tr>
              </thead>
              <tbody>
                {regionData.volumes.map((volume) => (
                  <tr key={volume.id}>
                    <td className="instance-id">{volume.id}</td>
                    <td>{volume.size} GB</td>
                    <td>{volume.type}</td>
                    <td>
                      <span className={`state-badge ${volume.state}`}>
                        {volume.state}
                      </span>
                    </td>
                    <td>
                      <span className={`state-badge ${volume.attached ? 'running' : 'stopped'}`}>
                        {volume.attached ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{volume.attachments[0]?.instanceId || '-'}</td>
                    <td>
                      <span className={`cost-indicator ${volume.costIndicator}`}>
                        {volume.costIndicator.replace('-', ' ')}
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
        <button onClick={fetchEBSVolumes} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default EBSVolumeList;
