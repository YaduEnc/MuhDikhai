import { useState, useEffect } from 'react';
import {
  getFriends,
  getPendingRequests,
  acceptFriendRequest,
  denyFriendRequest,
  unfriend,
  blockUser
} from '../services/friendService';
import './FriendsList.css';

function FriendsList() {
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' or 'requests'
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState({ sent: [], received: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'friends') {
        const data = await getFriends('accepted');
        setFriends(data.friendships || []);
      } else {
        const data = await getPendingRequests();
        setPendingRequests(data);
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (friendshipId) => {
    setActionLoading({ ...actionLoading, [friendshipId]: true });
    try {
      await acceptFriendRequest(friendshipId);
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to accept request');
    } finally {
      setActionLoading({ ...actionLoading, [friendshipId]: false });
    }
  };

  const handleDeny = async (friendshipId) => {
    setActionLoading({ ...actionLoading, [friendshipId]: true });
    try {
      await denyFriendRequest(friendshipId);
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to deny request');
    } finally {
      setActionLoading({ ...actionLoading, [friendshipId]: false });
    }
  };

  const handleUnfriend = async (friendshipId) => {
    if (!confirm('Are you sure you want to unfriend this user?')) return;
    
    setActionLoading({ ...actionLoading, [friendshipId]: true });
    try {
      await unfriend(friendshipId);
      await loadData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to unfriend');
    } finally {
      setActionLoading({ ...actionLoading, [friendshipId]: false });
    }
  };

  const handleBlock = async (userId) => {
    if (!confirm('Are you sure you want to block this user?')) return;
    
    setActionLoading({ ...actionLoading, [`block-${userId}`]: true });
    try {
      await blockUser(userId);
      await loadData();
      alert('User blocked successfully');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to block user');
    } finally {
      setActionLoading({ ...actionLoading, [`block-${userId}`]: false });
    }
  };

  if (loading) {
    return <div className="friends-loading">Loading...</div>;
  }

  return (
    <div className="friends-list">
      <div className="friends-tabs">
        <button
          className={activeTab === 'friends' ? 'tab-active' : 'tab'}
          onClick={() => setActiveTab('friends')}
        >
          Friends
        </button>
        <button
          className={activeTab === 'requests' ? 'tab-active' : 'tab'}
          onClick={() => setActiveTab('requests')}
        >
          Requests
          {pendingRequests.received?.length > 0 && (
            <span className="badge">{pendingRequests.received.length}</span>
          )}
        </button>
      </div>

      <div className="friends-content">
        {activeTab === 'friends' ? (
          <div className="friends-grid">
            {friends.length === 0 ? (
              <p className="empty-state">No friends yet</p>
            ) : (
              friends.map((friendship) => (
                <div key={friendship.id} className="friend-card">
                  <div className="friend-info">
                    <div className="friend-avatar">
                      {friendship.user?.profilePictureUrl ? (
                        <img src={friendship.user.profilePictureUrl} alt={friendship.user.name} />
                      ) : (
                        <div className="avatar-placeholder">
                          {friendship.user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="friend-details">
                      <h3>{friendship.user?.name || friendship.user?.username || 'Unknown'}</h3>
                      <p>@{friendship.user?.username || 'username'}</p>
                      {friendship.user?.bio && <p className="bio">{friendship.user.bio}</p>}
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button
                      className="btn-unfriend"
                      onClick={() => handleUnfriend(friendship.id)}
                      disabled={actionLoading[friendship.id]}
                    >
                      {actionLoading[friendship.id] ? '...' : 'Unfriend'}
                    </button>
                    <button
                      className="btn-block"
                      onClick={() => handleBlock(friendship.user?.id)}
                      disabled={actionLoading[`block-${friendship.user?.id}`]}
                    >
                      {actionLoading[`block-${friendship.user?.id}`] ? '...' : 'Block'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="requests-section">
            <div className="requests-group">
              <h3>Received Requests</h3>
              {pendingRequests.received?.length === 0 ? (
                <p className="empty-state">No pending requests</p>
              ) : (
                pendingRequests.received.map((request) => (
                  <div key={request.id} className="request-card">
                    <div className="request-info">
                      <div className="request-avatar">
                        {request.user?.profilePictureUrl ? (
                          <img src={request.user.profilePictureUrl} alt={request.user.name} />
                        ) : (
                          <div className="avatar-placeholder">
                            {request.user?.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="request-details">
                        <h3>{request.user?.name || request.user?.username || 'Unknown'}</h3>
                        <p>@{request.user?.username || 'username'}</p>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button
                        className="btn-accept"
                        onClick={() => handleAccept(request.id)}
                        disabled={actionLoading[request.id]}
                      >
                        {actionLoading[request.id] ? '...' : 'Accept'}
                      </button>
                      <button
                        className="btn-deny"
                        onClick={() => handleDeny(request.id)}
                        disabled={actionLoading[request.id]}
                      >
                        {actionLoading[request.id] ? '...' : 'Deny'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="requests-group">
              <h3>Sent Requests</h3>
              {pendingRequests.sent?.length === 0 ? (
                <p className="empty-state">No sent requests</p>
              ) : (
                pendingRequests.sent.map((request) => (
                  <div key={request.id} className="request-card">
                    <div className="request-info">
                      <div className="request-avatar">
                        {request.user?.profilePictureUrl ? (
                          <img src={request.user.profilePictureUrl} alt={request.user.name} />
                        ) : (
                          <div className="avatar-placeholder">
                            {request.user?.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="request-details">
                        <h3>{request.user?.name || request.user?.username || 'Unknown'}</h3>
                        <p>@{request.user?.username || 'username'}</p>
                      </div>
                    </div>
                    <div className="request-status">
                      <span className="status-pending">Pending</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FriendsList;
