import api from '../config/api';

/**
 * Get all conversations
 */
export const getConversations = async () => {
  try {
    const response = await api.get('/messages/conversations');
    return response.data.data.conversations || [];
  } catch (error) {
    console.error('Get conversations error:', error);
    throw error;
  }
};

/**
 * Get messages with a user
 */
export const getMessages = async (userId, limit = 50, offset = 0, beforeMessageId = null) => {
  try {
    const params = { limit, offset };
    if (beforeMessageId) {
      params.beforeMessageId = beforeMessageId;
    }
    const response = await api.get(`/messages/${userId}`, { params });
    return response.data.data;
  } catch (error) {
    console.error('Get messages error:', error);
    throw error;
  }
};

/**
 * Send a message (REST API - for fallback)
 * Note: In production, messages should be sent via WebSocket
 */
export const sendMessage = async (data) => {
  try {
    const response = await api.post('/messages', data);
    return response.data.data.message;
  } catch (error) {
    console.error('Send message error:', error);
    throw error;
  }
};

/**
 * Edit a message
 */
export const editMessage = async (messageId, encryptedContent, encryptedKey) => {
  try {
    const response = await api.put(`/messages/${messageId}`, {
      encryptedContent,
      encryptedKey,
    });
    return response.data.data.message;
  } catch (error) {
    console.error('Edit message error:', error);
    throw error;
  }
};

/**
 * Delete a message
 */
export const deleteMessage = async (messageId) => {
  try {
    await api.delete(`/messages/${messageId}`);
    return true;
  } catch (error) {
    console.error('Delete message error:', error);
    throw error;
  }
};

/**
 * Mark message as delivered
 */
export const markAsDelivered = async (messageId) => {
  try {
    await api.post(`/messages/${messageId}/delivered`);
    return true;
  } catch (error) {
    console.error('Mark as delivered error:', error);
    throw error;
  }
};

/**
 * Mark message as read
 */
export const markAsRead = async (messageId) => {
  try {
    await api.post(`/messages/${messageId}/read`);
    return true;
  } catch (error) {
    console.error('Mark as read error:', error);
    throw error;
  }
};

/**
 * Mark multiple messages as read
 */
export const markMultipleAsRead = async (messageIds, senderId) => {
  try {
    await api.post('/messages/read', { messageIds, senderId });
    return true;
  } catch (error) {
    console.error('Mark multiple as read error:', error);
    throw error;
  }
};

/**
 * Get unread count
 */
export const getUnreadCount = async () => {
  try {
    const response = await api.get('/messages/unread/count');
    return response.data.data;
  } catch (error) {
    console.error('Get unread count error:', error);
    throw error;
  }
};
