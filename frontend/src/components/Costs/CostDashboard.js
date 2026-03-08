import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../../services/api';
import './CostDashboard.css';

const COLORS = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#38f9d7', '#fa709a', '#fee140'];

const CostDashboard = () => {
  const [costData, setCostData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCostData();
  }, []);

  const fetchCostData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [summaryRes, trendRes] = await Promise.all([
        api.getCostSummary(),
        api.getCostTrend()
      ]);

      setCostData(summaryRes.data);
      setTrendData(trendRes.data);
    } catch (err) {
      setError('Failed to load cost data');
      console.error('Cost data error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading cost data...</div>;
  }

  if (error) {
    return (
      <div className="ec2-list">
        <div className="page-header">
          <h1>Cost Dashboard</h1>
          <p>AWS Cost Explorer Integration</p>
        </div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  // Prepare data for charts
  const topServicesData = costData?.topServices?.map(s => ({
    name: s.service,
    cost: parseFloat(s.cost)
  })) || [];

  const trendChartData = trendData?.dailyCosts?.slice(-30).map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: parseFloat(d.cost)
  })) || [];

  return (
    <div className="cost-dashboard">
      <div className="page-header">
        <h1>Cost Dashboard</h1>
        <p>AWS Cost Explorer - Last 30 Days</p>
      </div>

      {/* Summary Cards */}
      <div className="cost-summary-grid">
        <div className="cost-card">
          <div className="cost-card-header">
            <h3>Total Cost (30 Days)</h3>
          </div>
          <div className="cost-card-value">
            ${costData?.totalCost || '0.00'}
          </div>
          <div className="cost-card-label">
            {costData?.period?.start} to {costData?.period?.end}
          </div>
        </div>

        {costData?.forecast && (
          <div className="cost-card">
            <div className="cost-card-header">
              <h3>Forecasted Cost (30 Days)</h3>
            </div>
            <div className="cost-card-value forecast">
              ${costData.forecast.forecastedCost}
            </div>
            <div className="cost-card-label">
              Next 30 days projection
            </div>
          </div>
        )}

        <div className="cost-card">
          <div className="cost-card-header">
            <h3>Top Service</h3>
          </div>
          <div className="cost-card-value" style={{ fontSize: '20px' }}>
            {costData?.topServices?.[0]?.service || 'N/A'}
          </div>
          <div className="cost-card-label">
            ${costData?.topServices?.[0]?.cost?.toFixed(2) || '0.00'}
          </div>
        </div>

        <div className="cost-card">
          <div className="cost-card-header">
            <h3>Services Tracked</h3>
          </div>
          <div className="cost-card-value">
            {costData?.services?.length || 0}
          </div>
          <div className="cost-card-label">
            Active AWS services
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="cost-charts-grid">
        {/* Cost Trend Line Chart */}
        <div className="card chart-card">
          <h3>Cost Trend (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value}`} />
              <Legend />
              <Line type="monotone" dataKey="cost" stroke="#667eea" strokeWidth={2} name="Daily Cost" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Services Bar Chart */}
        <div className="card chart-card">
          <h3>Top 10 Services by Cost</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topServicesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
              <Legend />
              <Bar dataKey="cost" fill="#764ba2" name="Cost" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Service Breakdown Pie Chart */}
        <div className="card chart-card">
          <h3>Cost Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={topServicesData.slice(0, 8)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: $${entry.cost.toFixed(0)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="cost"
              >
                {topServicesData.slice(0, 8).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Services Table */}
        <div className="card chart-card">
          <h3>All Services</h3>
          <div className="services-table-wrapper">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Cost</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {costData?.services?.slice(0, 15).map((service, index) => (
                  <tr key={index}>
                    <td>{service.service}</td>
                    <td>${service.cost.toFixed(2)}</td>
                    <td>{((service.cost / parseFloat(costData.totalCost)) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="actions-footer">
        <button onClick={fetchCostData} className="button button-primary">
          Refresh Cost Data
        </button>
      </div>
    </div>
  );
};

export default CostDashboard;
