import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getConversations, getUnreadCount } from '../services/messageService';
import { getSocket } from '../services/socketService';
import './ConversationsList.css';

function ConversationsList({ onSelectConversation, selectedUserId, conversations: externalConversations }) {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastError, setLastError] = useState(null);
  
  // Use refs to track loading state without causing re-renders or stale closures
  const loadingConversationsRef = useRef(false);
  const loadingUnreadCountsRef = useRef(false);

  useEffect(() => {
    // Initial load
    loadConversations();
    loadUnreadCounts();
    
    // Refresh conversations every 60 seconds (less frequent to avoid rate limiting)
    const conversationsInterval = setInterval(() => {
      if (!loadingConversationsRef.current) {
        loadConversations();
      }
    }, 60000); // 60 seconds

    // Refresh unread counts every 45 seconds (reduced frequency to avoid rate limiting)
    const unreadInterval = setInterval(() => {
      if (!loadingUnreadCountsRef.current) {
        loadUnreadCounts();
      }
    }, 45000); // 45 seconds

    // Set up socket listeners for real-time unread count updates
    const socket = getSocket();
    if (socket) {
      // When messages are marked as read, decrease unread count
      // The event is received when WE read messages from someone else
      // senderId in the event is the person whose messages we read (the conversation partner)
      const handleMessageRead = (data) => {
        if (data.senderId) {
          setUnreadCounts(prev => {
            const newCounts = { ...prev };
            if (newCounts[data.senderId] && newCounts[data.senderId] > 0) {
              newCounts[data.senderId] = Math.max(0, newCounts[data.senderId] - 1);
            }
            return newCounts;
          });
          
          // Also update conversations to reflect the change
          setConversations(prev => prev.map(conv => 
            conv.userId === data.senderId && conv.unreadCount > 0
              ? { ...conv, unreadCount: Math.max(0, conv.unreadCount - 1) }
              : conv
          ));
        }
      };

      // When multiple messages are marked as read
      const handleMessagesRead = (data) => {
        if (data.senderId) {
          const readCount = data.messageIds?.length || 1;
          setUnreadCounts(prev => {
            const newCounts = { ...prev };
            if (newCounts[data.senderId]) {
              newCounts[data.senderId] = Math.max(0, newCounts[data.senderId] - readCount);
            }
            return newCounts;
          });
          
          // Also update conversations
          setConversations(prev => prev.map(conv => 
            conv.userId === data.senderId && conv.unreadCount > 0
              ? { ...conv, unreadCount: Math.max(0, conv.unreadCount - readCount) }
              : conv
          ));
        }
      };

      // When a new message is received, increment unread count
      const handleMessageReceived = (data) => {
        if (data.message?.senderId) {
          setUnreadCounts(prev => {
            const newCounts = { ...prev };
            newCounts[data.message.senderId] = (newCounts[data.message.senderId] || 0) + 1;
            return newCounts;
          });
        }
      };

      socket.on('message:read', handleMessageRead);
      socket.on('messages:read', handleMessagesRead);
      socket.on('message:received', handleMessageReceived);

      return () => {
        clearInterval(conversationsInterval);
        clearInterval(unreadInterval);
        socket.off('message:read', handleMessageRead);
        socket.off('messages:read', handleMessagesRead);
        socket.off('message:received', handleMessageReceived);
      };
    }

    return () => {
      clearInterval(conversationsInterval);
      clearInterval(unreadInterval);
    };
  }, []);

  const loadConversations = async () => {
    if (loadingConversationsRef.current) return; // Prevent duplicate requests
    
    loadingConversationsRef.current = true;
    setLastError(null);
    try {
      const data = await getConversations();
      setConversations(data || []);
    } catch (error) {
      // Handle rate limiting gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded for conversations. Will retry later.');
        setLastError('Rate limit exceeded. Please wait a moment.');
        // Don't update state on rate limit - keep existing data
      } else {
        console.error('Load conversations error:', error);
        setLastError('Failed to load conversations');
      }
    } finally {
      loadingConversationsRef.current = false;
      setLoading(false);
    }
  };

  const loadUnreadCounts = async () => {
    if (loadingUnreadCountsRef.current) return; // Prevent duplicate requests
    
    loadingUnreadCountsRef.current = true;
    try {
      const data = await getUnreadCount();
      const counts = {};
      
      // perConversation is an object with userId as keys and count as values
      if (data.perConversation) {
        if (Array.isArray(data.perConversation)) {
          // If it's an array, convert to object
          data.perConversation.forEach(item => {
            counts[item.userId] = item.count;
          });
        } else {
          // If it's already an object, use it directly
          Object.assign(counts, data.perConversation);
        }
      }
      
      setUnreadCounts(counts);
    } catch (error) {
      // Handle rate limiting gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded for unread counts. Will retry later.');
        // Don't update state on rate limit - keep existing counts
      } else {
        console.error('Load unread counts error:', error);
      }
    } finally {
      loadingUnreadCountsRef.current = false;
    }
  };

  if (loading) {
    return <div className="conversations-loading">Loading conversations...</div>;
  }

  return (
    <div className="conversations-list">
      <h3>Conversations</h3>
      {lastError && (
        <div className="conversations-error" style={{ 
          padding: '8px', 
          marginBottom: '8px', 
          backgroundColor: '#fee', 
          color: '#c33', 
          fontSize: '12px',
          borderRadius: '4px'
        }}>
          {lastError}
        </div>
      )}
      {conversations.length === 0 ? (
        <div className="empty-conversations">
          <p>No conversations yet</p>
          <p className="hint">Start chatting with your friends!</p>
        </div>
      ) : (
        <div className="conversations">
          {conversations.map((conv) => {
            const userId = conv.userId;
            const unread = conv.unreadCount || unreadCounts[userId] || 0;
            const isSelected = selectedUserId === userId;

            return (
              <div
                key={userId}
                className={`conversation-item ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  // Navigate to separate chat page
                  navigate(`/chat/${userId}`);
                  // Also call onSelectConversation if provided (for backward compatibility)
                  if (onSelectConversation) {
                    onSelectConversation(userId, conv.name || conv.username, conv.profilePictureUrl);
                  }
                }}
              >
                <div className="conversation-avatar">
                  {conv.profilePictureUrl ? (
                    <img src={conv.profilePictureUrl} alt={conv.name} />
                  ) : (
                    <div className="avatar-placeholder">
                      {conv.name?.[0]?.toUpperCase() || conv.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <div className="conversation-info">
                  <div className="conversation-header">
                    <h4>{conv.name || conv.username || 'Unknown'}</h4>
                    {conv.lastMessage && (
                      <span className="conversation-time">
                        {new Date(conv.lastMessage.sentAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="conversation-preview">
                    <p>
                      {conv.lastMessage ? (
                        conv.lastMessage.messageType === 'text' && conv.lastMessage.encryptedContent ? (
                          (() => {
                            try {
                              const decoded = atob(conv.lastMessage.encryptedContent);
                              // Truncate long messages to 50 characters
                              return decoded.length > 50 ? decoded.substring(0, 50) + '...' : decoded;
                            } catch {
                              return 'Text message';
                            }
                          })()
                        ) : (
                          `${conv.lastMessage.messageType} message`
                        )
                      ) : (
                        'No messages yet'
                      )}
                    </p>
                    {unread > 0 && (
                      <span className="unread-badge">{unread}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConversationsList;
