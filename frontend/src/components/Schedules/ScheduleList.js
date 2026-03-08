import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import '../Compute/EC2List.css';
import './ScheduleList.css';

const TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'US/Eastern (ET)', value: 'America/New_York' },
  { label: 'US/Central (CT)', value: 'America/Chicago' },
  { label: 'US/Mountain (MT)', value: 'America/Denver' },
  { label: 'US/Pacific (PT)', value: 'America/Los_Angeles' },
  { label: 'Europe/London (GMT)', value: 'Europe/London' },
  { label: 'Europe/Paris (CET)', value: 'Europe/Paris' },
  { label: 'Asia/Kolkata (IST)', value: 'Asia/Kolkata' },
  { label: 'Asia/Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Australia/Sydney', value: 'Australia/Sydney' },
];

const SERVICE_DEFS = [
  {
    key: 'ec2',
    label: 'EC2 Instances',
    types: ['ec2'],
    activeStates: ['running'],
    scheduleType: 'stop',
    actionLabel: 'Stop',
    buildScheduleItem: (r) => ({
      resourceId: r.resourceId,
      scheduleType: 'stop',
      resourceType: 'ec2',
      region: r.region,
    }),
  },
  {
    key: 'rds',
    label: 'RDS Instances',
    types: ['rds-instance'],
    activeStates: ['available'],
    scheduleType: 'stop',
    actionLabel: 'Stop',
    buildScheduleItem: (r) => ({
      resourceId: r.resourceId,
      scheduleType: 'stop',
      resourceType: 'rds',
      resourceSubType: 'instance',
      region: r.region,
    }),
  },
  {
    key: 'rds-cluster',
    label: 'RDS Clusters',
    types: ['rds-cluster'],
    activeStates: ['available'],
    scheduleType: 'stop',
    actionLabel: 'Stop',
    buildScheduleItem: (r) => ({
      resourceId: r.resourceId,
      scheduleType: 'stop',
      resourceType: 'rds',
      resourceSubType: 'cluster',
      region: r.region,
    }),
  },
  {
    key: 'redshift',
    label: 'Redshift Clusters',
    types: ['redshift'],
    activeStates: ['available'],
    scheduleType: 'pause',
    actionLabel: 'Pause',
    buildScheduleItem: (r) => ({
      resourceId: r.resourceId,
      scheduleType: 'pause',
      resourceType: 'redshift',
      region: r.region,
    }),
  },
];

function buildCron(time, days) {
  if (!time) return null;
  const [hh, mm] = time.split(':');
  const dayPart = days === 'weekdays' ? '1-5' : days === 'weekends' ? '0,6' : '*';
  return `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * ${dayPart}`;
}

const defaultServiceState = () =>
  Object.fromEntries(
    SERVICE_DEFS.map((s) => [
      s.key,
      { enabled: false, time: '18:00', days: 'daily', timezone: 'UTC' },
    ])
  );

const ScheduleList = () => {
  const [activeTab, setActiveTab] = useState('automation');

  // --- Automation tab state ---
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [resources, setResources] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [serviceConfig, setServiceConfig] = useState(defaultServiceState());
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  // --- Schedules tab state ---
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);

  // --- Shared ---
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    api.listAccounts()
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => {});
    fetchSchedules();
  }, []);

  // ── Schedules tab ─────────────────────────────────────────────────────────

  const fetchSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const res = await api.listSchedules();
      setSchedules(res.data.schedules || []);
    } catch {
      setError('Failed to load schedules');
    } finally {
      setSchedulesLoading(false);
    }
  };

  const handleToggleSchedule = async (schedule) => {
    try {
      await api.updateSchedule(schedule.resourceId, schedule.scheduleType, {
        enabled: schedule.enabled === 1 ? 0 : 1,
      });
      setSuccessMessage(`Schedule ${schedule.enabled === 1 ? 'disabled' : 'enabled'}`);
      fetchSchedules();
    } catch {
      setError('Failed to update schedule');
    }
  };

  const handleDeleteSchedule = async (schedule) => {
    if (!window.confirm(`Delete ${schedule.scheduleType} schedule for ${schedule.resourceId}?`)) return;
    try {
      await api.deleteSchedule(schedule.resourceId, schedule.scheduleType);
      setSuccessMessage('Schedule deleted');
      fetchSchedules();
    } catch {
      setError('Failed to delete schedule');
    }
  };

  // ── Automation tab ────────────────────────────────────────────────────────

  const handleSync = async () => {
    if (!selectedAccountId) return;
    setIsSyncing(true);
    setError('');
    setApplyResult(null);
    try {
      sessionStorage.setItem('lastAccountId', selectedAccountId);
      const data = await api.aggregateResources('all', selectedAccountId);
      setResources(data.resources || []);
    } catch {
      setError('Failed to sync resources');
    } finally {
      setIsSyncing(false);
    }
  };

  const getActiveResources = (svcDef) => {
    if (!resources) return [];
    return resources.filter(
      (r) => svcDef.types.includes(r.resourceType) && svcDef.activeStates.includes(r.state)
    );
  };

  const updateServiceConfig = (key, field, value) => {
    setServiceConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleApplyAutomation = async () => {
    if (!selectedAccountId || !resources) return;

    const enabledServices = SERVICE_DEFS.filter((s) => serviceConfig[s.key].enabled);
    if (enabledServices.length === 0) {
      setError('Enable at least one service before applying.');
      return;
    }

    for (const svc of enabledServices) {
      const cfg = serviceConfig[svc.key];
      if (!cfg.time) {
        setError(`Set a time for ${svc.label} before applying.`);
        return;
      }
    }

    setApplying(true);
    setError('');
    setApplyResult(null);

    let created = 0;
    let failed = 0;

    for (const svc of enabledServices) {
      const cfg = serviceConfig[svc.key];
      const cron = buildCron(cfg.time, cfg.days);
      const activeResources = getActiveResources(svc);

      for (const r of activeResources) {
        try {
          await api.createSchedule({
            ...svc.buildScheduleItem(r),
            accountId: selectedAccountId,
            cronExpression: cron,
            timezone: cfg.timezone,
          });
          created++;
        } catch {
          failed++;
        }
      }
    }

    setApplying(false);
    setApplyResult({ created, failed });
    if (created > 0) {
      setSuccessMessage(`${created} schedule${created > 1 ? 's' : ''} created successfully`);
      fetchSchedules();
    }
    if (failed > 0) {
      setError(`${failed} schedule${failed > 1 ? 's' : ''} failed to create`);
    }
  };

  const formatCron = (expr) => {
    const map = {
      '0 18 * * *': 'Daily at 18:00',
      '0 8 * * *': 'Daily at 08:00',
      '0 18 * * 1-5': 'Weekdays at 18:00',
      '0 8 * * 1-5': 'Weekdays at 08:00',
      '0 0 * * 6': 'Saturdays at midnight',
    };
    return map[expr] || expr;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ec2-list schedule-list">
      <div className="page-header">
        <h1>Scheduled Operations</h1>
        <p>Automate stop/pause actions for resources across accounts</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* Tabs */}
      <div className="schedule-tabs">
        <button
          className={`schedule-tab${activeTab === 'automation' ? ' active' : ''}`}
          onClick={() => setActiveTab('automation')}
        >
          Automation Setup
        </button>
        <button
          className={`schedule-tab${activeTab === 'schedules' ? ' active' : ''}`}
          onClick={() => { setActiveTab('schedules'); fetchSchedules(); }}
        >
          Active Schedules {schedules.length > 0 && <span className="schedule-count">{schedules.length}</span>}
        </button>
      </div>

      {/* ── AUTOMATION TAB ── */}
      {activeTab === 'automation' && (
        <div>
          {/* Account selector + Sync */}
          <div className="card automation-controls">
            <div className="controls-row">
              <div className="control-group">
                <label>Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => { setSelectedAccountId(e.target.value); setResources(null); }}
                  className="account-select"
                >
                  <option value="">Select an account…</option>
                  {accounts.map((a) => (
                    <option key={a.accountId} value={a.accountId}>
                      {a.accountName} ({a.accountId})
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="button button-primary"
                onClick={handleSync}
                disabled={!selectedAccountId || isSyncing}
              >
                {isSyncing ? <><span className="spinner" /> Syncing…</> : 'Sync Resources'}
              </button>
            </div>
            {!selectedAccountId && (
              <p className="hint-text">Select an account and click Sync to view schedulable resources.</p>
            )}
          </div>

          {/* Service automation table */}
          {resources !== null && (
            <div className="card">
              <table className="resource-table schedule-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Active Resources</th>
                    <th>Action</th>
                    <th>Stop Time</th>
                    <th>Days</th>
                    <th>Timezone</th>
                    <th>Automate</th>
                  </tr>
                </thead>
                <tbody>
                  {SERVICE_DEFS.map((svc) => {
                    const active = getActiveResources(svc);
                    const cfg = serviceConfig[svc.key];
                    const hasResources = active.length > 0;

                    return (
                      <tr key={svc.key} className={!hasResources ? 'row-dim' : ''}>
                        <td className="svc-name">{svc.label}</td>
                        <td>
                          {hasResources ? (
                            <span className="state-badge running">
                              {active.length} {svc.actionLabel === 'Stop' ? 'running' : 'active'}
                            </span>
                          ) : (
                            <span className="state-badge stopped">none active</span>
                          )}
                        </td>
                        <td>
                          <span className="action-badge">{svc.actionLabel}</span>
                        </td>
                        <td>
                          <input
                            type="time"
                            value={cfg.time}
                            disabled={!cfg.enabled || !hasResources}
                            onChange={(e) => updateServiceConfig(svc.key, 'time', e.target.value)}
                            className="time-input"
                          />
                        </td>
                        <td>
                          <select
                            value={cfg.days}
                            disabled={!cfg.enabled || !hasResources}
                            onChange={(e) => updateServiceConfig(svc.key, 'days', e.target.value)}
                            className="days-select"
                          >
                            <option value="daily">Every day</option>
                            <option value="weekdays">Weekdays only</option>
                            <option value="weekends">Weekends only</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={cfg.timezone}
                            disabled={!cfg.enabled || !hasResources}
                            onChange={(e) => updateServiceConfig(svc.key, 'timezone', e.target.value)}
                            className="tz-select"
                          >
                            {TIMEZONES.map((tz) => (
                              <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className={`toggle-switch${!hasResources ? ' toggle-disabled' : ''}`}>
                            <input
                              type="checkbox"
                              checked={cfg.enabled && hasResources}
                              disabled={!hasResources}
                              onChange={(e) => updateServiceConfig(svc.key, 'enabled', e.target.checked)}
                            />
                            <span className="toggle-slider" />
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="automation-footer">
                {applyResult && (
                  <span className="apply-result">
                    {applyResult.created} schedule{applyResult.created !== 1 ? 's' : ''} created
                    {applyResult.failed > 0 && `, ${applyResult.failed} failed`}
                  </span>
                )}
                <button
                  className="button button-primary"
                  onClick={handleApplyAutomation}
                  disabled={applying || !SERVICE_DEFS.some((s) => serviceConfig[s.key].enabled)}
                >
                  {applying ? <><span className="spinner" /> Applying…</> : 'Apply Automation'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SCHEDULES TAB ── */}
      {activeTab === 'schedules' && (
        <div>
          {schedulesLoading ? (
            <div className="loading">Loading schedules…</div>
          ) : schedules.length === 0 ? (
            <div className="card">
              <p className="empty-hint">
                No schedules configured yet. Use the Automation Setup tab to create them.
              </p>
            </div>
          ) : (
            <div className="card">
              <table className="resource-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Type</th>
                    <th>Account</th>
                    <th>Region</th>
                    <th>Action</th>
                    <th>Schedule</th>
                    <th>Timezone</th>
                    <th>Next Run</th>
                    <th>Last Run</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules
                    .sort((a, b) => (a.resourceId > b.resourceId ? 1 : -1))
                    .map((s) => (
                      <tr key={`${s.resourceId}-${s.scheduleType}`}>
                        <td className="instance-id">{s.resourceId}</td>
                        <td>{s.resourceType}</td>
                        <td style={{ fontSize: '12px', color: '#666' }}>{s.accountId || '—'}</td>
                        <td>{s.region}</td>
                        <td>
                          <span className={`state-badge ${s.scheduleType}`}>{s.scheduleType}</span>
                        </td>
                        <td>{formatCron(s.cronExpression)}</td>
                        <td>{s.timezone}</td>
                        <td style={{ fontSize: '12px' }}>
                          {s.nextExecution ? new Date(s.nextExecution).toLocaleString() : '—'}
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {s.lastExecuted ? new Date(s.lastExecuted).toLocaleString() : 'Never'}
                        </td>
                        <td>
                          <span className={`state-badge ${s.enabled === 1 ? 'running' : 'stopped'}`}>
                            {s.enabled === 1 ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => handleToggleSchedule(s)}
                              className={`button button-sm ${s.enabled === 1 ? 'button-danger' : 'button-success'}`}
                            >
                              {s.enabled === 1 ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleDeleteSchedule(s)}
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
            <button onClick={fetchSchedules} className="button button-primary">Refresh</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleList;
