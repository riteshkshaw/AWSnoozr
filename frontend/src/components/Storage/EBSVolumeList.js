import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';

const EBSVolumeList = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEBSVolumes();
  }, []);

  const fetchEBSVolumes = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listEBSVolumes();
      setData(response.data.data);
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

  const totalVolumes = data.reduce((sum, region) => sum + region.totalCount, 0);
  const totalUnattached = data.reduce((sum, region) => sum + region.unattachedCount, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>EBS Volumes</h1>
        <p>
          Total: {totalVolumes} volumes across {data.length} regions
          {totalUnattached > 0 && (
            <span style={{ color: '#dc3545', marginLeft: '8px' }}>
              ({totalUnattached} unattached - wasted cost!)
            </span>
          )}
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {data.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.totalCount} volumes)
          </h2>

          {regionData.totalCount === 0 ? (
            <p className="no-resources">No EBS volumes in this region</p>
          ) : (
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
          )}
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
