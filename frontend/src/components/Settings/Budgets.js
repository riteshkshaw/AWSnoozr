import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import './Budgets.css';

const Budgets = () => {
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    amount: 10000,
    scope: 'account',
    scopeFilters: {},
    preventStart: true,
    allowOverride: true
  });

  useEffect(() => {
    fetchCurrentBudget();
  }, []);

  const fetchCurrentBudget = async () => {
    try {
      setLoading(true);
      const data = await api.getCurrentBudget();
      setBudget(data.budget);
      
      if (data.budget) {
        setFormData({
          amount: data.budget.amount,
          scope: data.budget.scope?.type || 'account',
          scopeFilters: data.budget.scope?.filters || {},
          preventStart: data.budget.enforcement?.preventStartWhenExceeded || true,
          allowOverride: data.budget.enforcement?.allowOverrideWithReason || true
        });
      }
    } catch (error) {
      console.error('Error fetching budget:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.createOrUpdateBudget({
        amount: parseFloat(formData.amount),
        currency: 'USD',
        period: 'monthly',
        scope: {
          type: formData.scope,
          filters: formData.scopeFilters
        },
        enforcement: {
          preventStartWhenExceeded: formData.preventStart,
          allowOverrideWithReason: formData.allowOverride,
          overrideRequiresApproval: false
        },
        alerts: [
          { threshold: 80, notified: false },
          { threshold: 90, notified: false },
          { threshold: 100, notified: false }
        ]
      });

      setEditing(false);
      fetchCurrentBudget();
      alert('Budget saved successfully');
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Failed to save budget');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      ok: '#48bb78',
      warning: '#ed8936',
      critical: '#f56565',
      exceeded: '#c53030'
    };
    return colors[status] || '#718096';
  };

  const getGaugeStyle = () => {
    if (!budget) return {};

    const percentage = Math.min(budget.percentUsed, 100);
    const color = getStatusColor(budget.status);

    return {
      background: `conic-gradient(${color} ${percentage * 3.6}deg, #e2e8f0 0deg)`
    };
  };

  if (loading) {
    return <div className="loading">Loading budget information...</div>;
  }

  return (
    <div className="budgets-container">
      <div className="budgets-header">
        <h2>Budget Management</h2>
        {budget && !editing && (
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            Edit Budget
          </button>
        )}
      </div>

      {budget && !editing ? (
        <div className="budget-overview">
          <div className="budget-gauge-container">
            <div className="budget-gauge" style={getGaugeStyle()}>
              <div className="gauge-inner">
                <div className="gauge-percentage">{budget.percentUsed}%</div>
                <div className="gauge-label">Used</div>
              </div>
            </div>
            <div className="budget-stats">
              <div className="stat">
                <span className="stat-label">Budget</span>
                <span className="stat-value">${budget.amount.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Current Spend</span>
                <span className="stat-value">${budget.currentSpend.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Remaining</span>
                <span className={`stat-value ${budget.remaining < 0 ? 'negative' : ''}`}>
                  ${Math.abs(budget.remaining).toLocaleString()}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Forecast</span>
                <span className="stat-value">${budget.forecast.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="budget-status">
            <div className={`status-badge status-${budget.status}`}>
              {budget.status === 'ok' && '✓ Within Budget'}
              {budget.status === 'warning' && '⚠ Approaching Limit'}
              {budget.status === 'critical' && '🔥 Critical'}
              {budget.status === 'exceeded' && '❌ Budget Exceeded'}
            </div>

            {budget.status === 'exceeded' && budget.enforcement.preventStartWhenExceeded && (
              <div className="alert alert-danger">
                Resource start operations are blocked until budget is increased or spending decreases.
                {budget.enforcement.allowOverrideWithReason && (
                  <span> Override available with justification.</span>
                )}
              </div>
            )}
          </div>

          <div className="enforcement-rules">
            <h3>Enforcement Rules</h3>
            <ul>
              <li>
                {budget.enforcement.preventStartWhenExceeded ? '✓' : '✗'}
                {' '}Prevent resource start when budget exceeded
              </li>
              <li>
                {budget.enforcement.allowOverrideWithReason ? '✓' : '✗'}
                {' '}Allow override with justification
              </li>
            </ul>
          </div>

          <div className="budget-scope">
            <h3>Budget Scope</h3>
            <p>
              {budget.scope.type === 'account' && 'Entire AWS Account'}
              {budget.scope.type === 'tag-based' && `Tag-based: ${JSON.stringify(budget.scope.filters.tags)}`}
              {budget.scope.type === 'service' && `Services: ${budget.scope.filters.services.join(', ')}`}
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="budget-form">
          <div className="form-group">
            <label>Monthly Budget Amount ($)</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              min="0"
              step="100"
              required
            />
            <small>Set your monthly AWS spending limit</small>
          </div>

          <div className="form-group">
            <label>Budget Scope</label>
            <select
              value={formData.scope}
              onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
            >
              <option value="account">Entire Account</option>
              <option value="tag-based">Tag-Based</option>
              <option value="service">Specific Services</option>
            </select>
          </div>

          <div className="form-section">
            <h3>Enforcement Rules</h3>
            
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.preventStart}
                onChange={(e) => setFormData({ ...formData, preventStart: e.target.checked })}
              />
              Prevent starting resources when budget is exceeded
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.allowOverride}
                onChange={(e) => setFormData({ ...formData, allowOverride: e.target.checked })}
              />
              Allow override with justification
            </label>
          </div>

          <div className="alert alert-info">
            <strong>💡 Budget Alerts:</strong> You'll receive email notifications at 80%, 90%, and 100% of budget usage.
          </div>

          <div className="form-actions">
            {budget && (
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {budget ? 'Update Budget' : 'Create Budget'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Budgets;
