import { useState, useEffect } from 'react';
import { connectSocket, getSocket } from '../services/socketService';
import { getCurrentUser } from '../services/authService';
import ConversationsList from './ConversationsList';
import ChatWindow from './ChatWindow';
import './Messages.css';

function Messages() {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    // Check socket connection status
    const socket = getSocket();
    
    if (socket) {
      const handleConnect = () => {
        setSocketConnected(true);
      };

      const handleDisconnect = () => {
        setSocketConnected(false);
      };

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);

      // Check if already connected
      if (socket.connected) {
        setSocketConnected(true);
      }

      return () => {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      };
    } else {
      // Socket not initialized, try to connect
      const token = localStorage.getItem('accessToken');
      const currentUser = getCurrentUser();
      
      if (token && currentUser) {
        const newSocket = connectSocket(token);
        newSocket.on('connect', () => setSocketConnected(true));
        newSocket.on('disconnect', () => setSocketConnected(false));
      }
    }
  }, []);

  const handleSelectConversation = (userId, userName, userAvatar) => {
    setSelectedUserId(userId);
    setSelectedUser({
      id: userId,
      name: userName || 'User',
      avatar: userAvatar,
    });
  };

  return (
    <div className="messages-container">
      <div className="messages-sidebar">
        <ConversationsList
          onSelectConversation={handleSelectConversation}
          selectedUserId={selectedUserId}
        />
      </div>
      <div className="messages-chat">
        {selectedUserId ? (
          <ChatWindow
            userId={selectedUserId}
            userName={selectedUser?.name}
            userAvatar={selectedUser?.avatar}
          />
        ) : (
          <div className="chat-window-empty">
            <p>Select a conversation to start chatting</p>
          </div>
        )}
      </div>
      {!socketConnected && (
        <div className="socket-status">
          <span className="status-indicator offline"></span>
          Connecting...
        </div>
      )}
    </div>
  );
}

export default Messages;
