import { useState } from 'react';
import { searchUsers } from '../services/userService';
import { sendFriendRequest, blockUser } from '../services/friendService';
import './SearchUsers.css';

function SearchUsers() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await searchUsers(query, 'all', 20, 0);
      setResults(data.users || []);
    } catch (error) {
      console.error('Search error:', error);
      alert(error.response?.data?.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (userId) => {
    setActionLoading({ ...actionLoading, [`request-${userId}`]: true });
    try {
      await sendFriendRequest(userId);
      alert('Friend request sent!');
      // Update the result to show pending status
      setResults(results.map(user => 
        user.id === userId ? { ...user, requestSent: true } : user
      ));
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to send request');
    } finally {
      setActionLoading({ ...actionLoading, [`request-${userId}`]: false });
    }
  };

  const handleBlock = async (userId) => {
    if (!confirm('Are you sure you want to block this user?')) return;
    
    setActionLoading({ ...actionLoading, [`block-${userId}`]: true });
    try {
      await blockUser(userId);
      alert('User blocked successfully');
      setResults(results.filter(user => user.id !== userId));
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to block user');
    } finally {
      setActionLoading({ ...actionLoading, [`block-${userId}`]: false });
    }
  };

  return (
    <div className="search-users">
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search by username, email, or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="btn-search" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="search-results">
          <h3>Search Results</h3>
          <div className="results-grid">
            {results.map((user) => (
              <div key={user.id} className="user-card">
                <div className="user-info">
                  <div className="user-avatar">
                    {user.profilePictureUrl ? (
                      <img src={user.profilePictureUrl} alt={user.name} />
                    ) : (
                      <div className="avatar-placeholder">
                        {user.name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="user-details">
                    <h3>{user.name || user.username || 'Unknown'}</h3>
                    <p>@{user.username || 'username'}</p>
                    {user.bio && <p className="bio">{user.bio}</p>}
                    {user.status && (
                      <span className={`status ${user.status}`}>{user.status}</span>
                    )}
                  </div>
                </div>
                <div className="user-actions">
                  {user.requestSent ? (
                    <span className="status-pending">Request Sent</span>
                  ) : (
                    <>
                      <button
                        className="btn-add-friend"
                        onClick={() => handleSendRequest(user.id)}
                        disabled={actionLoading[`request-${user.id}`]}
                      >
                        {actionLoading[`request-${user.id}`] ? '...' : 'Add Friend'}
                      </button>
                      <button
                        className="btn-block"
                        onClick={() => handleBlock(user.id)}
                        disabled={actionLoading[`block-${user.id}`]}
                      >
                        {actionLoading[`block-${user.id}`] ? '...' : 'Block'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="empty-state">
          <p>No users found</p>
        </div>
      )}
    </div>
  );
}

export default SearchUsers;
