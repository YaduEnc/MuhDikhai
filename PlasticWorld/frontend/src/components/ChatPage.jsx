import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getPublicUserProfile } from '../services/userService';
import { connectSocket, getSocket } from '../services/socketService';
import { getCurrentUser } from '../services/authService';
import ChatWindow from './ChatWindow';
import './ChatPage.css';

function ChatPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    // Ensure socket is connected
    const token = localStorage.getItem('accessToken');
    const currentUser = getCurrentUser();
    
    if (token && currentUser) {
      const socket = getSocket();
      if (!socket || !socket.connected) {
        connectSocket(token);
      }
    }

    // Load user info
    const loadUserInfo = async () => {
      try {
        if (userId) {
          const user = await getPublicUserProfile(userId);
          setUserInfo({
            name: user.name || user.username,
            avatar: user.profilePictureUrl,
          });
        }
      } catch (error) {
        console.error('Failed to load user info:', error);
        setUserInfo({
          name: 'User',
          avatar: null,
        });
      } finally {
        setLoading(false);
      }
    };

    loadUserInfo();

    // Monitor socket connection
    const socket = getSocket();
    if (socket) {
      const handleConnect = () => setSocketConnected(true);
      const handleDisconnect = () => setSocketConnected(false);

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      if (socket.connected) {
        setSocketConnected(true);
      }

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    }
  }, [userId]);

  const handleBack = () => {
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="chat-page">
        <div className="chat-page-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-page-header">
        <button className="btn-back" onClick={handleBack}>
          ← Back
        </button>
        <h2 className="chat-page-title">Messages</h2>
        {!socketConnected && (
          <div className="socket-status-indicator">
            <span className="status-dot offline"></span>
            Connecting...
          </div>
        )}
      </div>
      <div className="chat-page-content">
        <ChatWindow
          userId={userId}
          userName={userInfo?.name}
          userAvatar={userInfo?.avatar}
        />
      </div>
    </div>
  );
}

export default ChatPage;
