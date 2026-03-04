import { useState, useEffect, useRef } from 'react';
import { getMessages, markMultipleAsRead } from '../services/messageService';
import { getSocket, sendMessageViaSocket, markMessageAsReadViaSocket } from '../services/socketService';
import { getCurrentUser } from '../services/authService';
import MessageInput from './MessageInput';
import './ChatWindow.css';

function ChatWindow({ userId, userName, userAvatar }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const currentUser = getCurrentUser();


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!userId) return;
    
    setLoading(true);
    setMessages([]); // Clear previous messages
    try {
      const data = await getMessages(userId, 50, 0);
      const loadedMessages = data.messages || [];
      
      // Sort messages by sentAt (oldest first)
      const sortedMessages = loadedMessages.sort((a, b) => 
        new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );
      
      setMessages(sortedMessages);
      setHasMore(data.pagination?.hasMore || false);
      
      // Mark messages as read
      const unreadMessages = sortedMessages
        .filter(msg => msg.senderId === userId && msg.status !== 'read')
        .map(msg => msg.id);
      
      if (unreadMessages.length > 0) {
        markMultipleAsRead(unreadMessages, userId).catch(console.error);
        // Also via socket
        if (unreadMessages.length > 0) {
          markMessageAsReadViaSocket(unreadMessages[0]);
        }
      }
      
      // Scroll to bottom after messages load
      setTimeout(() => scrollToBottom(true), 200);
    } catch (error) {
      console.error('Load messages error:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const setupSocketListeners = () => {
    const socket = getSocket();
    if (!socket) return;

    // New message received
    const handleMessageReceived = (data) => {
      if (data.message?.senderId === userId || data.message?.recipientId === userId) {
        setMessages(prev => {
          // Check if message already exists
          const exists = prev.some(msg => msg.id === data.message.id);
          if (exists) {
            // Update existing message
            return prev.map(msg => 
              msg.id === data.message.id ? { ...msg, ...data.message } : msg
            );
          }
          
          // Add new message and sort
          const newMessages = [...prev, {
            ...data.message,
            sender: data.message.sender,
          }];
          
          return newMessages.sort((a, b) => 
            new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          );
        });
        
        // Scroll to bottom when new message arrives
        setTimeout(() => scrollToBottom(), 150);
        
        // Mark as read if chat is open and message is from the other user
        if (data.message.id && data.message.senderId === userId) {
          markMessageAsReadViaSocket(data.message.id);
        }
      }
    };

    socket.on('message:received', handleMessageReceived);

    // Message sent confirmation
    const handleMessageSent = (data) => {
      if (data.message) {
        setMessages(prev => {
          // Replace temp message with real message
          const tempIndex = prev.findIndex(msg => msg.id?.startsWith('temp-'));
          if (tempIndex !== -1) {
            const tempMsg = prev[tempIndex];
            const newMessages = [...prev];
            newMessages[tempIndex] = {
              ...data.message,
              encryptedContent: tempMsg.encryptedContent, // Keep the content we stored
            };
            // Sort messages
            return newMessages.sort((a, b) => 
              new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
            );
          }
          
          // If no temp message, just add it
          const exists = prev.some(msg => msg.id === data.message.id);
          if (exists) {
            const updated = prev.map(msg => 
              msg.id === data.message.id ? { ...msg, ...data.message } : msg
            );
            return updated.sort((a, b) => 
              new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
            );
          }
          
          const newMessages = [...prev, data.message];
          return newMessages.sort((a, b) => 
            new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          );
        });
        setSending(false);
        setTimeout(() => scrollToBottom(), 150);
      }
    };

    socket.on('message:sent', handleMessageSent);

    // Message delivered
    const handleMessageDelivered = (data) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.messageId
          ? { ...msg, status: 'delivered' }
          : msg
      ));
    };

    socket.on('message:delivered', handleMessageDelivered);

    // Message read
    const handleMessageRead = (data) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.messageId
          ? { ...msg, status: 'read' }
          : msg
      ));
    };

    socket.on('message:read', handleMessageRead);

    // Typing indicators
    const handleTypingStart = (data) => {
      if (data.userId === userId) {
        setTyping(true);
      }
    };

    const handleTypingStop = (data) => {
      if (data.userId === userId) {
        setTyping(false);
      }
    };

    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);

    // Cleanup function
    return () => {
      socket.off('message:received', handleMessageReceived);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:read', handleMessageRead);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
    };
  };

  useEffect(() => {
    if (!userId) return;
    
    loadMessages();
    const cleanup = setupSocketListeners();

    return () => {
      if (cleanup) cleanup();
    };
  }, [userId]);

  const handleSendMessage = async (text) => {
    if (!text.trim() || !userId) return;

    setSending(true);
    
    // Create temporary message for immediate display
    const tempMessage = {
      id: `temp-${Date.now()}`,
      senderId: currentUser?.id,
      recipientId: userId,
      messageType: 'text',
      status: 'sending',
      sentAt: new Date().toISOString(),
      encryptedContent: btoa(text), // Store locally for display
      sender: {
        id: currentUser?.id,
        name: currentUser?.name,
        username: currentUser?.username,
      },
    };

    // Add temporary message immediately
    setMessages(prev => {
      const newMessages = [...prev, tempMessage];
      // Sort to maintain order
      return newMessages.sort((a, b) => 
        new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );
    });
    setTimeout(() => scrollToBottom(), 50);
    
    try {
      // For now, send plain text (in production, this should be encrypted)
      // Convert text to base64 for the API
      const encryptedContent = btoa(text);
      const encryptedKey = btoa('key'); // Placeholder - should be actual encryption key

      const messageData = {
        recipientId: userId,
        encryptedContent,
        encryptedKey,
        messageType: 'text',
      };

      // Send via WebSocket
      sendMessageViaSocket(messageData);
    } catch (error) {
      console.error('Send message error:', error);
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      setSending(false);
    }
  };

  const scrollToBottom = (force = false) => {
    if (messagesEndRef.current) {
      if (force) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  if (!userId) {
    return (
      <div className="chat-window-empty">
        <p>Select a conversation to start chatting</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="chat-window-loading">
        <p>Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-user-info">
          <div className="chat-avatar">
            {userAvatar ? (
              <img src={userAvatar} alt={userName} />
            ) : (
              <div className="avatar-placeholder">
                {userName?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div>
            <h3>{userName || 'Unknown'}</h3>
            {typing && <p className="typing-indicator">typing...</p>}
          </div>
        </div>
      </div>

      <div className="messages-container" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const isOwn = message.senderId === currentUser?.id;
              const sender = message.sender || { name: 'Unknown' };
              
              // Decode message content
              let messageText = '';
              if (message.messageType === 'text') {
                if (message.encryptedContent) {
                  try {
                    // Decode base64 to get the actual message text
                    messageText = atob(message.encryptedContent);
                    // If decoded text is empty or invalid, show fallback
                    if (!messageText || messageText.trim() === '') {
                      messageText = 'Empty message';
                    }
                  } catch (error) {
                    console.error('Failed to decode message:', error);
                    messageText = 'Unable to decode message';
                  }
                } else {
                  // Fallback if no encryptedContent (shouldn't happen but handle gracefully)
                  messageText = message.content || 'Message content unavailable';
                }
              } else {
                // For non-text messages, show the message type
                messageText = `${message.messageType} message`;
              }

              return (
                <div
                  key={message.id || `temp-${message.sentAt}`}
                  className={`message ${isOwn ? 'own' : 'other'}`}
                >
                  {!isOwn && (
                    <div className="message-avatar">
                      {sender.profilePictureUrl ? (
                        <img src={sender.profilePictureUrl} alt={sender.name} />
                      ) : (
                        <div className="avatar-placeholder-small">
                          {sender.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="message-content">
                    {!isOwn && <span className="message-sender">{sender.name || sender.username || 'Unknown'}</span>}
                    <div className="message-bubble">
                      <p>{messageText}</p>
                      <div className="message-meta">
                        <span className="message-time">
                          {new Date(message.sentAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isOwn && (
                          <span className="message-status">
                            {message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : message.status === 'sending' ? '...' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <MessageInput 
        onSend={handleSendMessage} 
        disabled={sending}
        recipientId={userId}
      />
    </div>
  );
}

export default ChatWindow;
