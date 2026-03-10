import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

// Firebase web configuration for the suttafund project
const firebaseConfig = {
  apiKey: 'AIzaSyCIVT5GkkXrBfEvorY4gtTJchNdoAZzWnY',
  authDomain: 'suttafund.firebaseapp.com',
  projectId: 'suttafund',
  storageBucket: 'suttafund.firebasestorage.app',
  messagingSenderId: '399253120722',
  appId: '1:399253120722:web:d81fdcb0216662da9f6f0b',
  measurementId: 'G-KYYE8REWT3',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

// Set persistence to LOCAL so the browser remembers the user even after tab is closed
setPersistence(auth, browserLocalPersistence)
  .catch((err) => console.error("Firebase persistence error:", err));

export { auth }

