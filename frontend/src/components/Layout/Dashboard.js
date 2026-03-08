import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [summary, setSummary] = useState({
    ec2: { total: 0, running: 0, stopped: 0 },
    rds: { total: 0 },
    eks: { total: 0 },
    natGateways: { total: 0 },
    elasticIPs: { total: 0, unattached: 0 },
    ebs: { total: 0, unattached: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [ec2Res, rdsRes, eksRes, natRes, eipRes, ebsRes] = await Promise.allSettled([
        api.listEC2(),
        api.listRDS(),
        api.listEKS(),
        api.listNATGateways(),
        api.listElasticIPs(),
        api.listEBSVolumes()
      ]);

      const newSummary = { ...summary };

      if (ec2Res.status === 'fulfilled' && ec2Res.value?.data?.summary) {
        newSummary.ec2.total = ec2Res.value.data.summary.totalInstances;
        // Count running and stopped
        const allInstances = ec2Res.value.data.data.flatMap(r => r.instances);
        newSummary.ec2.running = allInstances.filter(i => i.state === 'running').length;
        newSummary.ec2.stopped = allInstances.filter(i => i.state === 'stopped').length;
      }

      if (rdsRes.status === 'fulfilled' && rdsRes.value?.data?.summary) {
        newSummary.rds.total = rdsRes.value.data.summary.totalResources;
      }

      if (eksRes.status === 'fulfilled' && eksRes.value?.data?.summary) {
        newSummary.eks.total = eksRes.value.data.summary.totalClusters;
      }

      if (natRes.status === 'fulfilled' && natRes.value?.data?.summary) {
        newSummary.natGateways.total = natRes.value.data.summary.totalNATGateways;
      }

      if (eipRes.status === 'fulfilled' && eipRes.value?.data?.summary) {
        newSummary.elasticIPs.total = eipRes.value.data.summary.totalElasticIps;
        newSummary.elasticIPs.unattached = eipRes.value.data.summary.totalUnattached;
      }

      if (ebsRes.status === 'fulfilled' && ebsRes.value?.data?.summary) {
        newSummary.ebs.total = ebsRes.value.data.summary.totalVolumes;
        newSummary.ebs.unattached = ebsRes.value.data.summary.totalUnattached;
      }

      setSummary(newSummary);
    } catch (err) {
      setError('Failed to load dashboard summary');
      console.error('Dashboard error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of AWS resources across all regions</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-icon compute">EC2</div>
          <div className="card-content">
            <div className="card-number">{summary.ec2.total}</div>
            <div className="card-label">EC2 Instances</div>
            <div className="card-details">
              {summary.ec2.running} running · {summary.ec2.stopped} stopped
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon databases">RDS</div>
          <div className="card-content">
            <div className="card-number">{summary.rds.total}</div>
            <div className="card-label">RDS Resources</div>
            <div className="card-details">Instances and Clusters</div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon compute">EKS</div>
          <div className="card-content">
            <div className="card-number">{summary.eks.total}</div>
            <div className="card-label">EKS Clusters</div>
            <div className="card-details">Kubernetes clusters</div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon networking">NAT</div>
          <div className="card-content">
            <div className="card-number">{summary.natGateways.total}</div>
            <div className="card-label">NAT Gateways</div>
            <div className="card-details">Active gateways</div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon networking">EIP</div>
          <div className="card-content">
            <div className="card-number">{summary.elasticIPs.total}</div>
            <div className="card-label">Elastic IPs</div>
            <div className="card-details">
              {summary.elasticIPs.unattached > 0 && (
                <span className="warning">{summary.elasticIPs.unattached} unattached</span>
              )}
              {summary.elasticIPs.unattached === 0 && 'All attached'}
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-icon storage">EBS</div>
          <div className="card-content">
            <div className="card-number">{summary.ebs.total}</div>
            <div className="card-label">EBS Volumes</div>
            <div className="card-details">
              {summary.ebs.unattached > 0 && (
                <span className="warning">{summary.ebs.unattached} unattached</span>
              )}
              {summary.ebs.unattached === 0 && 'All attached'}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-actions">
        <button onClick={fetchSummary} className="button button-primary">
          Refresh Dashboard
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
