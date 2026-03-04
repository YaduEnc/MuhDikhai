import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import api from '../config/api';
import { connectSocket, disconnectSocket } from './socketService';

/**
 * Sign in with Google
 */
export const signInWithGoogle = async () => {
  try {
    // Sign in with Firebase
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Get Firebase ID token
    const idToken = await user.getIdToken();

    // Send to backend
    const response = await api.post('/auth/google-signin', {
      idToken,
    });

    const { accessToken, refreshToken, user: userData } = response.data.data;

    // Store tokens and user data
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));

    // Initialize socket connection
    connectSocket(accessToken);

    return { user: userData, accessToken, refreshToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
};

/**
 * Sign out
 */
export const signOut = async () => {
  try {
    // Call backend logout endpoint
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
    // Continue with local logout even if API call fails
  } finally {
    // Disconnect socket
    disconnectSocket();

    // Clear local storage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    // Sign out from Firebase
    await auth.signOut();
  }
};

/**
 * Get current user from localStorage
 */
export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  return !!localStorage.getItem('accessToken');
};

/**
 * Delete user account
 */
export const deleteAccount = async () => {
  try {
    await api.delete('/users/me');
    
    // Clear local storage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    // Sign out from Firebase
    await auth.signOut();

    return true;
  } catch (error) {
    console.error('Delete account error:', error);
    throw error;
  } finally {
    // Disconnect socket
    disconnectSocket();
  }
};
