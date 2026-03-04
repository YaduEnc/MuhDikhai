import api from '../config/api';

/**
 * Get current user profile
 */
export const getUserProfile = async () => {
  try {
    const response = await api.get('/users/me');
    return response.data.data.user;
  } catch (error) {
    console.error('Get user profile error:', error);
    throw error;
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (data) => {
  try {
    const response = await api.put('/users/me', data);
    const user = response.data.data.user;
    
    // Update localStorage
    localStorage.setItem('user', JSON.stringify(user));
    
    return user;
  } catch (error) {
    console.error('Update profile error:', error);
    
    // Log detailed error for debugging
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    
    throw error;
  }
};

/**
 * Get public user profile by ID
 */
export const getPublicUserProfile = async (userId) => {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data.data.user;
  } catch (error) {
    console.error('Get public user profile error:', error);
    throw error;
  }
};

/**
 * Search users
 */
export const searchUsers = async (query, type = 'all', limit = 20, offset = 0) => {
  try {
    const response = await api.get('/users/search', {
      params: { q: query, type, limit, offset }
    });
    return response.data.data;
  } catch (error) {
    console.error('Search users error:', error);
    throw error;
  }
};
