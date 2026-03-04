import api from '../config/api';

/**
 * Get all friends/friend requests
 */
export const getFriends = async (status = 'accepted', limit = 50, offset = 0) => {
  try {
    const response = await api.get('/friends', {
      params: { status, limit, offset }
    });
    return response.data.data;
  } catch (error) {
    console.error('Get friends error:', error);
    throw error;
  }
};

/**
 * Get pending friend requests
 */
export const getPendingRequests = async () => {
  try {
    const response = await api.get('/friends/requests/pending');
    return response.data.data;
  } catch (error) {
    console.error('Get pending requests error:', error);
    throw error;
  }
};

/**
 * Send friend request
 */
export const sendFriendRequest = async (userId) => {
  try {
    const response = await api.post('/friends/request', { userId });
    return response.data.data.friendship;
  } catch (error) {
    console.error('Send friend request error:', error);
    throw error;
  }
};

/**
 * Accept friend request
 */
export const acceptFriendRequest = async (friendshipId) => {
  try {
    const response = await api.post(`/friends/${friendshipId}/accept`);
    return response.data.data.friendship;
  } catch (error) {
    console.error('Accept friend request error:', error);
    throw error;
  }
};

/**
 * Deny friend request
 */
export const denyFriendRequest = async (friendshipId) => {
  try {
    const response = await api.post(`/friends/${friendshipId}/deny`);
    return response.data.data.friendship;
  } catch (error) {
    console.error('Deny friend request error:', error);
    throw error;
  }
};

/**
 * Unfriend or cancel friend request
 */
export const unfriend = async (friendshipId) => {
  try {
    await api.delete(`/friends/${friendshipId}`);
    return true;
  } catch (error) {
    console.error('Unfriend error:', error);
    throw error;
  }
};

/**
 * Block a user
 */
export const blockUser = async (userId, reason = null) => {
  try {
    const response = await api.post(`/friends/${userId}/block`, { reason });
    return response.data.data.block;
  } catch (error) {
    console.error('Block user error:', error);
    throw error;
  }
};

/**
 * Unblock a user
 */
export const unblockUser = async (userId) => {
  try {
    await api.delete(`/friends/${userId}/unblock`);
    return true;
  } catch (error) {
    console.error('Unblock user error:', error);
    throw error;
  }
};
