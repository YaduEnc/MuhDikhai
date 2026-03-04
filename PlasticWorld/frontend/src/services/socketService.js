import { io } from 'socket.io-client';

let socket = null;

/**
 * Initialize Socket.io connection
 */
export const connectSocket = (token) => {
  // If socket exists and is connected, return it
  if (socket?.connected) {
    return socket;
  }

  // If socket exists but not connected, disconnect and create new one
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Use production WebSocket URL by default, or localhost for development
  const WS_URL = import.meta.env.VITE_WS_URL || 
    (import.meta.env.DEV ? 'http://localhost:3000' : 'wss://plasticworld.yaduraj.me');

  socket = io(WS_URL, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
};

/**
 * Disconnect Socket.io
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Get current socket instance
 */
export const getSocket = () => {
  return socket;
};

/**
 * Send message via WebSocket
 */
export const sendMessageViaSocket = (data) => {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }
  socket.emit('message:send', data);
};

/**
 * Start typing indicator
 */
export const startTyping = (recipientId) => {
  if (!socket || !socket.connected) return;
  socket.emit('typing:start', { recipientId });
};

/**
 * Stop typing indicator
 */
export const stopTyping = (recipientId) => {
  if (!socket || !socket.connected) return;
  socket.emit('typing:stop', { recipientId });
};

/**
 * Mark message as read via WebSocket
 */
export const markMessageAsReadViaSocket = (messageId) => {
  if (!socket || !socket.connected) return;
  socket.emit('message:read', { messageId });
};

/**
 * Mark multiple messages as read via WebSocket
 */
export const markMessagesAsReadViaSocket = (messageIds, senderId) => {
  if (!socket || !socket.connected) return;
  socket.emit('messages:read', { messageIds, senderId });
};

/**
 * Update user status
 */
export const updateStatus = (status) => {
  if (!socket || !socket.connected) return;
  socket.emit('status:update', { status });
};
