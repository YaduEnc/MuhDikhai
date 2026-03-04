# Frontend Setup Guide

## Firebase Configuration

1. **Get your Firebase config from Firebase Console:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings > General
   - Scroll down to "Your apps" section
   - Copy the config values

2. **Create `.env` file in the frontend directory:**
   ```bash
   cd frontend
   cp .env.example .env
   ```

3. **Update `.env` with your Firebase config:**
   ```env
   VITE_FIREBASE_API_KEY=your_actual_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id

   # API URL (defaults to localhost:3000)
   VITE_API_URL=http://localhost:3000/api/v1
   ```

4. **Enable Google Sign-In in Firebase:**
   - Go to Firebase Console > Authentication > Sign-in method
   - Enable "Google" provider
   - Add your domain to authorized domains if needed

## Running the Frontend

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

## Features

- ✅ Google Sign-In with Firebase
- ✅ Protected routes
- ✅ Dashboard with user profile
- ✅ Logout functionality
- ✅ Delete account functionality
- ✅ Token refresh handling
- ✅ Minimal white/black design

## Routes

- `/` - Landing page
- `/signin` - Sign in page
- `/dashboard` - User dashboard (protected)

## Testing

1. Make sure backend is running on `http://localhost:3000`
2. Start frontend: `npm run dev`
3. Navigate to `http://localhost:5173`
4. Click "Get Started" or "Sign in"
5. Sign in with Google
6. You'll be redirected to the dashboard
7. Test logout and delete account features
