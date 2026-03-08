import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import './AccountReport.css';

const SERVICE_CONFIG = [
  {
    label: 'EC2 Instances',
    types: ['ec2'],
    route: '/compute/ec2',
    statusFn: (resources) => {
      const running = resources.filter(r => r.state === 'running').length;
      const stopped = resources.filter(r => r.state === 'stopped').length;
      return `${running} running / ${stopped} stopped`;
    }
  },
  {
    label: 'EKS Clusters',
    types: ['eks'],
    route: '/compute/eks',
    statusFn: (resources) => {
      const active = resources.filter(r => r.state === 'ACTIVE').length;
      const scaled0 = resources.filter(r => r.state !== 'ACTIVE').length;
      return `${active} active / ${scaled0} scaled-0`;
    }
  },
  {
    label: 'RDS',
    types: ['rds-instance', 'rds-cluster'],
    route: '/databases/rds',
    statusFn: (resources) => {
      const available = resources.filter(r => r.state === 'available').length;
      const stopped = resources.filter(r => r.state === 'stopped').length;
      return `${available} available / ${stopped} stopped`;
    }
  },
  {
    label: 'Redshift',
    types: ['redshift'],
    route: '/databases/redshift',
    statusFn: (resources) => {
      const available = resources.filter(r => r.state === 'available').length;
      const paused = resources.filter(r => r.state === 'paused').length;
      return `${available} available / ${paused} paused`;
    }
  },
  {
    label: 'NAT Gateways',
    types: ['nat-gateway'],
    route: '/networking/nat-gateways',
    statusFn: (resources) => {
      const available = resources.filter(r => r.state === 'available').length;
      return `${available} available`;
    }
  },
  {
    label: 'Load Balancers',
    types: ['load-balancer'],
    route: '/networking/load-balancers',
    statusFn: (resources) => {
      const active = resources.filter(r => r.state === 'active').length;
      return `${active} active`;
    }
  },
  {
    label: 'EBS Volumes',
    types: ['ebs'],
    route: '/storage/ebs',
    statusFn: (resources) => {
      const inUse = resources.filter(r => r.state === 'in-use').length;
      const available = resources.filter(r => r.state === 'available').length;
      return `${inUse} in-use / ${available} available`;
    }
  },
  {
    label: 'Elastic IPs',
    types: ['elastic-ip'],
    route: '/networking/elastic-ips',
    statusFn: (resources) => {
      const associated = resources.filter(r => r.state === 'associated').length;
      const unassociated = resources.filter(r => r.state === 'unassociated').length;
      return `${associated} associated / ${unassociated} unassociated`;
    }
  }
];

const AccountReport = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [resources, setResources] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  useEffect(() => {
    api.listAccounts()
      .then(data => setAccounts(data.accounts || []))
      .catch(err => console.error('Failed to load accounts:', err));
  }, []);

  const handleSync = async () => {
    setIsLoading(true);
    if (selectedAccountId) {
      sessionStorage.setItem('lastAccountId', selectedAccountId);
    }
    try {
      const data = await api.aggregateResources('all', selectedAccountId || null);
      setResources(data.resources || []);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Failed to aggregate resources:', err);
      alert('Failed to sync resources. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const buildRows = () => {
    return SERVICE_CONFIG.map(svc => {
      const matching = resources.filter(r => svc.types.includes(r.resourceType));
      const activeRegions = new Set(matching.map(r => r.region)).size;
      return {
        label: svc.label,
        status: svc.statusFn(matching),
        total: matching.length,
        activeRegions,
        route: svc.route
      };
    });
  };

  return (
    <div className="account-report">
      <div className="page-header">
        <h1>Account Report</h1>
        <p className="page-subtitle">Resource summary across services for a selected account</p>
      </div>

      <div className="report-controls card">
        <div className="controls-row">
          <div className="control-group">
            <label htmlFor="account-select">Account</label>
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="account-select"
            >
              <option value="">All Accounts</option>
              {accounts.map(acc => (
                <option key={acc.accountId} value={acc.accountId}>
                  {acc.accountName} ({acc.accountId})
                </option>
              ))}
            </select>
          </div>

          <button
            className="button button-primary"
            onClick={handleSync}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" />
                Syncing...
              </>
            ) : (
              'Sync'
            )}
          </button>
        </div>

        {lastSynced && (
          <div className="last-synced">
            Last synced: {lastSynced.toLocaleTimeString()}
          </div>
        )}
      </div>

      {resources === null ? (
        <div className="empty-state card">
          <p>Select an account and click Sync to view resource counts.</p>
        </div>
      ) : (
        <div className="card">
          <table className="report-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Active Regions</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {buildRows().map(row => (
                <tr key={row.label}>
                  <td className="service-name">{row.label}</td>
                  <td>
                    <span className="status-text">{row.status}</span>
                  </td>
                  <td className="region-count">
                    {row.activeRegions > 0 ? row.activeRegions : <span className="none">—</span>}
                  </td>
                  <td>
                    <button
                      className="button button-sm button-outline"
                      onClick={() => navigate(row.route + (selectedAccountId ? `?accountId=${selectedAccountId}` : ''))}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AccountReport;
