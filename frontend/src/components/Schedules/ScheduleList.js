import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';
import './ScheduleModal.css';

const ScheduleList = () => {
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.listSchedules();
      setSchedules(response.data.schedules || []);
    } catch (err) {
      setError('Failed to load schedules');
      console.error('Schedules list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (schedule) => {
    try {
      await api.updateSchedule(schedule.resourceId, schedule.scheduleType, {
        enabled: !schedule.enabled
      });
      setSuccessMessage(`Schedule ${schedule.enabled ? 'disabled' : 'enabled'} successfully`);
      fetchSchedules();
    } catch (err) {
      setError('Failed to update schedule');
    }
  };

  const handleDelete = async (schedule) => {
    if (!window.confirm(`Are you sure you want to delete the ${schedule.scheduleType} schedule for ${schedule.resourceId}?`)) {
      return;
    }

    try {
      await api.deleteSchedule(schedule.resourceId, schedule.scheduleType);
      setSuccessMessage('Schedule deleted successfully');
      fetchSchedules();
    } catch (err) {
      setError('Failed to delete schedule');
    }
  };

  const formatCron = (cronExpression) => {
    const presets = {
      '0 18 * * *': 'Daily at 6:00 PM',
      '0 8 * * *': 'Daily at 8:00 AM',
      '0 18 * * 1-5': 'Weekdays at 6:00 PM',
      '0 8 * * 1-5': 'Weekdays at 8:00 AM',
      '0 0 * * 6': 'Saturdays at midnight'
    };
    return presets[cronExpression] || cronExpression;
  };

  if (isLoading) {
    return <div className="loading">Loading schedules...</div>;
  }

  return (
    <div className="ec2-list">
      <div className="page-header">
        <h1>Scheduled Operations</h1>
        <p>Total: {schedules.length} scheduled operations</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {schedules.length === 0 ? (
        <div className="card">
          <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
            No schedules configured. Create schedules from resource lists by clicking the "Schedule" button.
          </p>
        </div>
      ) : (
        <div className="card">
          <table className="resource-table">
            <thead>
              <tr>
                <th>Resource ID</th>
                <th>Type</th>
                <th>Region</th>
                <th>Action</th>
                <th>Schedule</th>
                <th>Timezone</th>
                <th>Next Execution</th>
                <th>Last Executed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={`${schedule.resourceId}-${schedule.scheduleType}`}>
                  <td className="instance-id">{schedule.resourceId}</td>
                  <td>{schedule.resourceType}</td>
                  <td>{schedule.region}</td>
                  <td>
                    <span className={`state-badge ${schedule.scheduleType}`}>
                      {schedule.scheduleType}
                    </span>
                  </td>
                  <td>{formatCron(schedule.cronExpression)}</td>
                  <td>{schedule.timezone}</td>
                  <td>
                    {schedule.nextExecution
                      ? new Date(schedule.nextExecution).toLocaleString()
                      : '-'}
                  </td>
                  <td>
                    {schedule.lastExecuted
                      ? new Date(schedule.lastExecuted).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <span className={`state-badge ${schedule.enabled === 1 ? 'running' : 'stopped'}`}>
                      {schedule.enabled === 1 ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        onClick={() => handleToggle(schedule)}
                        className={`button button-sm ${schedule.enabled === 1 ? 'button-danger' : 'button-success'}`}
                      >
                        {schedule.enabled === 1 ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleDelete(schedule)}
                        className="button button-danger button-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions-footer">
        <button onClick={fetchSchedules} className="button button-primary">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default ScheduleList;
