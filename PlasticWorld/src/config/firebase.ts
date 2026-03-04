import admin from 'firebase-admin';
import logger from '../utils/logger';

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase(): void {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      logger.info('Firebase Admin SDK already initialized');
      return;
    }

    // Get credentials from environment
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
      throw new Error('Missing Firebase configuration. Check FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL');
    }

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey,
        clientEmail,
      }),
    });

    logger.info('Firebase Admin SDK initialized successfully', {
      projectId,
      clientEmail,
    });
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get Firebase Auth instance
 */
function getAuth(): admin.auth.Auth {
  if (admin.apps.length === 0) {
    throw new Error('Firebase Admin SDK not initialized. Call initializeFirebase() first.');
  }
  return admin.auth();
}

/**
 * Verify Firebase ID token
 */
async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Firebase ID token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Check if Firebase user exists
 */
async function firebaseUserExists(firebaseUid: string): Promise<boolean> {
  try {
    const auth = getAuth();
    await auth.getUser(firebaseUid);
    return true;
  } catch (error: any) {
    // If error code is 'auth/user-not-found', user doesn't exist
    if (error?.code === 'auth/user-not-found') {
      return false;
    }
    // For other errors, log and return false (safer to assume user doesn't exist)
    logger.warn('Error checking Firebase user existence', {
      error: error instanceof Error ? error.message : 'Unknown error',
      firebaseUid,
    });
    return false;
  }
}

/**
 * Delete user from Firebase Authentication
 * Returns true if deleted, false if user doesn't exist (already deleted)
 */
async function deleteFirebaseUser(firebaseUid: string): Promise<boolean> {
  try {
    const auth = getAuth();
    
    // First check if user exists
    const userExists = await firebaseUserExists(firebaseUid);
    if (!userExists) {
      logger.info('Firebase user does not exist (may have been already deleted)', { firebaseUid });
      return false; // User doesn't exist, which is fine - goal achieved
    }
    
    // User exists, delete it
    await auth.deleteUser(firebaseUid);
    logger.info('Firebase user deleted successfully', { firebaseUid });
    return true;
  } catch (error: any) {
    // Handle specific Firebase error codes
    if (error?.code === 'auth/user-not-found') {
      logger.info('Firebase user not found (may have been already deleted)', { firebaseUid });
      return false; // User doesn't exist, which is fine
    }
    
    // For other errors, log as error and throw
    logger.error('Failed to delete Firebase user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      code: error?.code,
      firebaseUid,
    });
    throw error;
  }
}

// Don't initialize on module load - let server.ts call it after dotenv loads

export { getAuth, verifyIdToken, initializeFirebase, deleteFirebaseUser, firebaseUserExists };
export default admin;
