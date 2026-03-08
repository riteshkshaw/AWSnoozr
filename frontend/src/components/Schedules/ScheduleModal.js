import React, { useState } from 'react';
import './ScheduleModal.css';

const ScheduleModal = ({ isOpen, onClose, onSave, resource }) => {
  const [formData, setFormData] = useState({
    scheduleType: 'stop',
    cronPreset: 'daily-6pm',
    cronExpression: '0 18 * * *',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    autoStart: true,
    autoStop: true,
    notificationEmails: ''
  });

  const cronPresets = {
    'daily-6pm': { cron: '0 18 * * *', label: 'Daily at 6:00 PM' },
    'daily-8am': { cron: '0 8 * * *', label: 'Daily at 8:00 AM' },
    'weekdays-6pm': { cron: '0 18 * * 1-5', label: 'Weekdays at 6:00 PM' },
    'weekdays-8am': { cron: '0 8 * * 1-5', label: 'Weekdays at 8:00 AM' },
    'weekends-off': { cron: '0 0 * * 6', label: 'Saturdays at midnight' },
    'custom': { cron: '', label: 'Custom cron expression' }
  };

  const handlePresetChange = (preset) => {
    setFormData({
      ...formData,
      cronPreset: preset,
      cronExpression: cronPresets[preset].cron
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const schedule = {
      resourceId: resource.id,
      resourceType: resource.type, // ec2, rds, redshift, eks-nodegroup
      resourceSubType: resource.subType, // instance, cluster
      region: resource.region,
      scheduleType: formData.scheduleType,
      cronExpression: formData.cronExpression,
      timezone: formData.timezone,
      optOut: {
        autoStart: formData.autoStart,
        autoStop: formData.autoStop
      },
      notificationEmails: formData.notificationEmails
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0),
      metadata: resource.metadata || {}
    };

    await onSave(schedule);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schedule Resource Control</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="schedule-form">
          <div className="form-group">
            <label>Resource</label>
            <div className="resource-info">
              <strong>{resource?.id}</strong>
              <span className="resource-type">{resource?.type}</span>
              <span className="resource-region">{resource?.region}</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="scheduleType">Action</label>
            <select
              id="scheduleType"
              value={formData.scheduleType}
              onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value })}
              required
            >
              <option value="stop">Stop (EC2, RDS)</option>
              <option value="start">Start (EC2, RDS)</option>
              <option value="pause">Pause (Redshift)</option>
              <option value="resume">Resume (Redshift)</option>
              <option value="scale-down">Scale Down (EKS)</option>
              <option value="scale-up">Scale Up (EKS)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="cronPreset">Schedule</label>
            <select
              id="cronPreset"
              value={formData.cronPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              required
            >
              {Object.entries(cronPresets).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </div>

          {formData.cronPreset === 'custom' && (
            <div className="form-group">
              <label htmlFor="cronExpression">Cron Expression</label>
              <input
                type="text"
                id="cronExpression"
                value={formData.cronExpression}
                onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                placeholder="0 18 * * *"
                required
              />
              <small className="help-text">
                Format: minute hour day month weekday (e.g., "0 18 * * 1-5" = 6 PM on weekdays)
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="timezone">Timezone</label>
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              required
            >
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="America/Chicago">America/Chicago (CT)</option>
              <option value="America/Denver">America/Denver (MT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
            </select>
          </div>

          <div className="form-group">
            <label>Opt-Out Options</label>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.autoStop}
                  onChange={(e) => setFormData({ ...formData, autoStop: e.target.checked })}
                />
                Enable scheduled stop/pause
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.autoStart}
                  onChange={(e) => setFormData({ ...formData, autoStart: e.target.checked })}
                />
                Enable auto-start/resume
              </label>
            </div>
            <small className="help-text">
              Uncheck "auto-start" to only stop the resource without restarting it
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="notificationEmails">Notification Emails (optional)</label>
            <input
              type="text"
              id="notificationEmails"
              value={formData.notificationEmails}
              onChange={(e) => setFormData({ ...formData, notificationEmails: e.target.value })}
              placeholder="email1@example.com, email2@example.com"
            />
            <small className="help-text">
              Comma-separated email addresses. Leave empty to use default notification topic.
            </small>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="button button-secondary">
              Cancel
            </button>
            <button type="submit" className="button button-primary">
              Create Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleModal;
