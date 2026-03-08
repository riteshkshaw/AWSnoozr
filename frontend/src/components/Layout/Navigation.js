import React from 'react';
import { NavLink } from 'react-router-dom';
import './Navigation.css';

const Navigation = () => {
  return (
    <nav className="navigation">
      <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        Dashboard
      </NavLink>

      <div className="nav-section">
        <div className="nav-section-title">Compute</div>
        <NavLink to="/compute/ec2" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          EC2 Instances
        </NavLink>
        <NavLink to="/compute/eks" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          EKS Clusters
        </NavLink>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Databases</div>
        <NavLink to="/databases/rds" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          RDS
        </NavLink>
        <NavLink to="/databases/redshift" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Redshift
        </NavLink>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Networking</div>
        <NavLink to="/networking/nat-gateways" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          NAT Gateways
        </NavLink>
        <NavLink to="/networking/elastic-ips" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Elastic IPs
        </NavLink>
        <NavLink to="/networking/load-balancers" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Load Balancers
        </NavLink>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Storage</div>
        <NavLink to="/storage/ebs" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          EBS Volumes
        </NavLink>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Automation</div>
        <NavLink to="/schedules" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Schedules
        </NavLink>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Analytics</div>
        <NavLink to="/costs" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Cost Dashboard
        </NavLink>
        <NavLink to="/reports" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Account Report
        </NavLink>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Settings</div>
        <NavLink to="/settings/accounts" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
          Multi-Account
        </NavLink>
      </div>
    </nav>
  );
};

export default Navigation;
