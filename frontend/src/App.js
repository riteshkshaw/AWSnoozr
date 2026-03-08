import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/Auth/Login';
import Dashboard from './components/Layout/Dashboard';
import EC2List from './components/Compute/EC2List';
import EKSList from './components/Compute/EKSList';
import RDSList from './components/Databases/RDSList';
import RedshiftList from './components/Databases/RedshiftList';
import NATGatewayList from './components/Networking/NATGatewayList';
import ElasticIPList from './components/Networking/ElasticIPList';
import LoadBalancerList from './components/Networking/LoadBalancerList';
import EBSVolumeList from './components/Storage/EBSVolumeList';
import ScheduleList from './components/Schedules/ScheduleList';
import CostDashboard from './components/Costs/CostDashboard';
import Accounts from './components/Settings/Accounts';
import Header from './components/Layout/Header';
import Navigation from './components/Layout/Navigation';
import './App.css';

function PrivateRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  return user ? children : <Navigate to="/login" />;
}

function App() {
  const { user } = useAuth();

  return (
    <Router>
      <div className="App">
        {user && <Header />}
        <div className="main-container">
          {user && <Navigation />}
          <div className="content">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/compute/ec2"
                element={
                  <PrivateRoute>
                    <EC2List />
                  </PrivateRoute>
                }
              />
              <Route
                path="/compute/eks"
                element={
                  <PrivateRoute>
                    <EKSList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/databases/rds"
                element={
                  <PrivateRoute>
                    <RDSList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/databases/redshift"
                element={
                  <PrivateRoute>
                    <RedshiftList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/networking/nat-gateways"
                element={
                  <PrivateRoute>
                    <NATGatewayList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/networking/elastic-ips"
                element={
                  <PrivateRoute>
                    <ElasticIPList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/networking/load-balancers"
                element={
                  <PrivateRoute>
                    <LoadBalancerList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/storage/ebs"
                element={
                  <PrivateRoute>
                    <EBSVolumeList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/schedules"
                element={
                  <PrivateRoute>
                    <ScheduleList />
                  </PrivateRoute>
                }
              />
              <Route
                path="/costs"
                element={
                  <PrivateRoute>
                    <CostDashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/settings/accounts"
                element={
                  <PrivateRoute>
                    <Accounts />
                  </PrivateRoute>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
