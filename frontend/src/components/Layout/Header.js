import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

const Header = () => {
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="logo">AWSnoozr</h1>
          <span className="tagline">AWS Resource Management</span>
        </div>
        <div className="header-right">
          <span className="user-email">{user?.signInDetails?.loginId || user?.username || 'User'}</span>
          <button onClick={handleSignOut} className="button button-signout">
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
