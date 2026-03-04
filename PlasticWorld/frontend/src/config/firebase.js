import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEgFOzM8VaKURBTWAerFwgSfmMoDOYISQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "platicworld-f671a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "platicworld-f671a",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "platicworld-f671a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "869365225242",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:869365225242:web:57a24b1f69c39248193ea3",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-HLZTGK7Z22"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

export default app;
