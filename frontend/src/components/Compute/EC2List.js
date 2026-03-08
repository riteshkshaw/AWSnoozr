import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import ScheduleModal from '../Schedules/ScheduleModal';
import './EC2List.css';

const EC2List = () => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);

  useEffect(() => {
    fetchEC2Instances();
  }, []);

  const fetchEC2Instances = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listEC2();
      setData(response.data.data);
    } catch (err) {
      setError('Failed to load EC2 instances');
      console.error('EC2 list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (instanceId, action, region) => {
    const key = `${instanceId}-${action}`;
    setActionLoading({ ...actionLoading, [key]: true });
    setError('');
    setSuccessMessage('');

    const confirmMessage = action === 'stop'
      ? `Are you sure you want to stop instance ${instanceId}?`
      : `Are you sure you want to start instance ${instanceId}?`;

    if (!window.confirm(confirmMessage)) {
      setActionLoading({ ...actionLoading, [key]: false });
      return;
    }

    try {
      if (action === 'stop') {
        await api.stopEC2(instanceId, region);
      } else {
        await api.startEC2(instanceId, region);
      }

      setSuccessMessage(`Instance ${action} operation initiated successfully`);
      setTimeout(() => fetchEC2Instances(), 2000);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} instance`);
    } finally {
      setActionLoading({ ...actionLoading, [key]: false });
    }
  };

  const handleSchedule = (instance, region) => {
    setSelectedResource({
      id: instance.id,
      type: 'ec2',
      region: region
    });
    setScheduleModalOpen(true);
  };

  const handleSaveSchedule = async (schedule) => {
    try {
      await api.createSchedule(schedule);
      setSuccessMessage('Schedule created successfully');
      setScheduleModalOpen(false);
      setSelectedResource(null);
    } catch (err) {
      setError('Failed to create schedule');
    }
  };

  if (isLoading) {
    return <div className="loading">Loading EC2 instances...</div>;
  }

  const totalInstances = data.reduce((sum, region) => sum + region.count, 0);

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>EC2 Instances</h1>
        <p>Total: {totalInstances} instances across {data.length} regions</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {data.map((regionData) => (
        <div key={regionData.region} className="region-section">
          <h2 className="region-title">
            {regionData.region} ({regionData.count} instances)
          </h2>

          {regionData.count === 0 ? (
            <p className="no-resources">No EC2 instances in this region</p>
          ) : (
            <div className="card">
              <table className="resource-table">
                <thead>
                  <tr>
                    <th>Instance ID</th>
                    <th>Type</th>
                    <th>State</th>
                    <th>Cost Indicator</th>
                    <th>Availability Zone</th>
                    <th>Private IP</th>
                    <th>Public IP</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regionData.instances.map((instance) => (
                    <tr key={instance.id}>
                      <td className="instance-id">{instance.id}</td>
                      <td>{instance.type}</td>
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
                      <td>{instance.availabilityZone}</td>
                      <td>{instance.privateIp || '-'}</td>
                      <td>{instance.publicIp || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          {instance.state === 'running' && (
                            <button
                              onClick={() => handleAction(instance.id, 'stop', regionData.region)}
                              disabled={actionLoading[`${instance.id}-stop`]}
                              className="button button-danger button-sm"
                            >
                              {actionLoading[`${instance.id}-stop`] ? 'Stopping...' : 'Stop'}
                            </button>
                          )}
                          {instance.state === 'stopped' && (
                            <button
                              onClick={() => handleAction(instance.id, 'start', regionData.region)}
                              disabled={actionLoading[`${instance.id}-start`]}
                              className="button button-success button-sm"
                            >
                              {actionLoading[`${instance.id}-start`] ? 'Starting...' : 'Start'}
                            </button>
                          )}
                          {['running', 'stopped'].includes(instance.state) && (
                            <button
                              onClick={() => handleSchedule(instance, regionData.region)}
                              className="button button-primary button-sm"
                            >
                              Schedule
                            </button>
                          )}
                          {!['running', 'stopped'].includes(instance.state) && (
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
        </div>
      ))}

      <div className="actions-footer">
        <button onClick={fetchEC2Instances} className="button button-primary">
          Refresh
        </button>
      </div>

      <ScheduleModal
        isOpen={scheduleModalOpen}
        onClose={() => {
          setScheduleModalOpen(false);
          setSelectedResource(null);
        }}
        onSave={handleSaveSchedule}
        resource={selectedResource}
      />
    </div>
  );
};

export default EC2List;
