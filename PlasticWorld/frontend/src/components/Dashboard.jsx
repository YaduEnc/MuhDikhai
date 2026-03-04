import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, deleteAccount, getCurrentUser } from '../services/authService';
import { getUserProfile } from '../services/userService';
import FriendsList from './FriendsList';
import SearchUsers from './SearchUsers';
import ProfileSettings from './ProfileSettings';
import Messages from './Messages';
import './Dashboard.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('messages'); // 'messages', 'friends', 'search', 'settings'
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Try to get from API first
      const userData = await getUserProfile();
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      // Fallback to localStorage
      const localUser = getCurrentUser();
      if (localUser) {
        setUser(localUser);
      } else {
        navigate('/signin');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/signin');
    } catch (error) {
      console.error('Logout error:', error);
      // Still navigate to signin even if API call fails
      navigate('/signin');
    }
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setDeleting(true);
    try {
      await deleteAccount();
      navigate('/signin');
    } catch (error) {
      console.error('Delete account error:', error);
      alert('Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="container">
          <div className="logo">PlasticWorld</div>
          <div className="header-actions">
            <span className="user-name">{user.name || user.username}</span>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="container">
          <div className="dashboard-tabs">
            <button
              className={activeTab === 'messages' ? 'tab-active' : 'tab'}
              onClick={() => setActiveTab('messages')}
            >
              Messages
            </button>
            <button
              className={activeTab === 'friends' ? 'tab-active' : 'tab'}
              onClick={() => setActiveTab('friends')}
            >
              Friends
            </button>
            <button
              className={activeTab === 'search' ? 'tab-active' : 'tab'}
              onClick={() => setActiveTab('search')}
            >
              Search
            </button>
            <button
              className={activeTab === 'settings' ? 'tab-active' : 'tab'}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>

          <div className="dashboard-content">
            {activeTab === 'messages' && <Messages />}
            {activeTab === 'friends' && <FriendsList />}
            {activeTab === 'search' && <SearchUsers />}
            {activeTab === 'settings' && (
              <div className="settings-container">
                <ProfileSettings />
                <div className="account-actions">
                  <h2>Account Actions</h2>
                  <div className="action-buttons">
                    {!showDeleteConfirm ? (
                      <button
                        className="btn-delete"
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                      >
                        Delete Account
                      </button>
                    ) : (
                      <div className="delete-confirm">
                        <p>Are you sure you want to delete your account? This action cannot be undone.</p>
                        <div className="confirm-buttons">
                          <button
                            className="btn-confirm-delete"
                            onClick={handleDeleteAccount}
                            disabled={deleting}
                          >
                            {deleting ? 'Deleting...' : 'Yes, Delete Account'}
                          </button>
                          <button
                            className="btn-cancel"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={deleting}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
