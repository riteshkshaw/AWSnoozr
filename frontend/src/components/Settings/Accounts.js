import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import './Accounts.css';

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState({
    accountId: '',
    accountName: '',
    roleArn: '',
    externalId: 'awsnoozr-prod',
    regions: ['us-east-1']
  });
  const [testingConnection, setTestingConnection] = useState(null);

  const availableRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
    'ap-south-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
    'ca-central-1', 'sa-east-1'
  ];

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await api.listAccounts();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      alert('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = () => {
    setEditingAccount(null);
    setFormData({
      accountId: '',
      accountName: '',
      roleArn: '',
      externalId: 'awsnoozr-prod',
      regions: ['us-east-1']
    });
    setShowModal(true);
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setFormData({
      accountId: account.accountId,
      accountName: account.accountName,
      roleArn: account.roleArn,
      externalId: account.externalId,
      regions: account.regions
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingAccount) {
        await api.updateAccount(formData.accountId, {
          accountName: formData.accountName,
          regions: formData.regions,
          enabled: true
        });
      } else {
        // Auto-generate role ARN if not provided
        const roleArn = formData.roleArn || 
          `arn:aws:iam::${formData.accountId}:role/awsnoozr-prod-cross-account`;

        await api.createAccount({
          ...formData,
          roleArn
        });
      }

      setShowModal(false);
      fetchAccounts();
      alert(`Account ${editingAccount ? 'updated' : 'added'} successfully`);
    } catch (error) {
      console.error('Error saving account:', error);
      alert(`Failed to ${editingAccount ? 'update' : 'add'} account: ${error.message}`);
    }
  };

  const handleTestConnection = async (accountId) => {
    try {
      setTestingConnection(accountId);
      const result = await api.testAccountConnection(accountId);
      
      if (result.status === 'connected') {
        alert(`Connection successful! ${result.regionsAvailable} regions available.`);
        fetchAccounts(); // Refresh to show updated status
      }
    } catch (error) {
      alert(`Connection failed: ${error.message}`);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this account?')) {
      return;
    }

    try {
      await api.deleteAccount(accountId);
      fetchAccounts();
      alert('Account deleted successfully');
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account');
    }
  };

  const handleRegionToggle = (region) => {
    if (formData.regions.includes(region)) {
      setFormData({
        ...formData,
        regions: formData.regions.filter(r => r !== region)
      });
    } else {
      setFormData({
        ...formData,
        regions: [...formData.regions, region]
      });
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      connected: { class: 'status-connected', text: 'Connected' },
      pending: { class: 'status-pending', text: 'Pending' },
      failed: { class: 'status-failed', text: 'Failed' }
    };
    const badge = badges[status] || badges.pending;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
  };

  if (loading) {
    return <div className="loading">Loading accounts...</div>;
  }

  return (
    <div className="accounts-container">
      <div className="accounts-header">
        <h2>AWS Accounts</h2>
        <button className="btn btn-primary" onClick={handleAddAccount}>
          + Add Account
        </button>
      </div>

      <div className="accounts-info">
        <p>
          Configure additional AWS accounts to monitor and control resources across your organization.
          You'll need to deploy the cross-account IAM role in each target account.
        </p>
        <a 
          href="https://github.com/your-org/awsnoozr-app/blob/main/terraform/modules/multi-account/README.md" 
          target="_blank" 
          rel="noopener noreferrer"
        >
          View setup instructions →
        </a>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <p>No accounts configured yet.</p>
          <button className="btn btn-primary" onClick={handleAddAccount}>
            Add Your First Account
          </button>
        </div>
      ) : (
        <table className="accounts-table">
          <thead>
            <tr>
              <th>Account ID</th>
              <th>Account Name</th>
              <th>Regions</th>
              <th>Status</th>
              <th>Last Sync</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(account => (
              <tr key={account.accountId}>
                <td className="account-id">{account.accountId}</td>
                <td>{account.accountName}</td>
                <td>
                  <span className="region-count">
                    {account.regions.length} region{account.regions.length !== 1 ? 's' : ''}
                  </span>
                </td>
                <td>{getStatusBadge(account.status)}</td>
                <td>
                  {account.lastSync 
                    ? new Date(account.lastSync).toLocaleString() 
                    : 'Never'}
                </td>
                <td className="actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleTestConnection(account.accountId)}
                    disabled={testingConnection === account.accountId}
                  >
                    {testingConnection === account.accountId ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleEditAccount(account)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeleteAccount(account.accountId)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingAccount ? 'Edit Account' : 'Add Account'}</h3>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Account ID *</label>
                <input
                  type="text"
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  placeholder="123456789012"
                  pattern="\d{12}"
                  required
                  disabled={editingAccount}
                />
                <small>12-digit AWS account ID</small>
              </div>

              <div className="form-group">
                <label>Account Name *</label>
                <input
                  type="text"
                  value={formData.accountName}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                  placeholder="Production Account"
                  required
                />
              </div>

              {!editingAccount && (
                <>
                  <div className="form-group">
                    <label>IAM Role ARN</label>
                    <input
                      type="text"
                      value={formData.roleArn}
                      onChange={(e) => setFormData({ ...formData, roleArn: e.target.value })}
                      placeholder={`arn:aws:iam::${formData.accountId || '123456789012'}:role/awsnoozr-prod-cross-account`}
                    />
                    <small>Leave empty to use default: awsnoozr-prod-cross-account</small>
                  </div>

                  <div className="form-group">
                    <label>External ID</label>
                    <input
                      type="text"
                      value={formData.externalId}
                      onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                      required
                    />
                    <small>Used for additional security when assuming role</small>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Regions to Monitor *</label>
                <div className="regions-grid">
                  {availableRegions.map(region => (
                    <label key={region} className="region-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.regions.includes(region)}
                        onChange={() => handleRegionToggle(region)}
                      />
                      {region}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingAccount ? 'Update Account' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;
