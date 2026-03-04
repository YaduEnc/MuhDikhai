# Authentication API Testing Guide

## Prerequisites

1. **Server Running**: Make sure the server is running
   ```bash
   npm run dev
   ```

2. **Databases Running**: Ensure PostgreSQL and Redis are running
   ```bash
   docker-compose ps
   ```

3. **Firebase ID Token**: You need a real Firebase ID token from Google Sign-In

## Getting a Firebase ID Token

### Option 1: Using Firebase Web SDK (Recommended)

Create a simple HTML file to get the token:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Get Firebase Token</title>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
</head>
<body>
    <h1>Get Firebase ID Token</h1>
    <button onclick="signIn()">Sign In with Google</button>
    <div id="token"></div>

    <script>
        // Initialize Firebase (replace with your config)
        const firebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
            projectId: "YOUR_PROJECT_ID",
            // ... other config
        };
        
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();

        async function signIn() {
            const provider = new firebase.auth.GoogleAuthProvider();
            try {
                const result = await auth.signInWithPopup(provider);
                const idToken = await result.user.getIdToken();
                document.getElementById('token').innerHTML = 
                    '<h3>ID Token:</h3><textarea style="width:100%;height:200px">' + 
                    idToken + '</textarea>';
                console.log('ID Token:', idToken);
            } catch (error) {
                console.error('Error:', error);
            }
        }
    </script>
</body>
</html>
```

### Option 2: Using React Native / Mobile App

```javascript
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

async function getFirebaseToken() {
  try {
    // Sign in with Google
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    
    // Get Firebase credential
    const googleCredential = auth.GoogleAuthProvider.credential(
      userInfo.idToken
    );
    
    // Sign in to Firebase
    const firebaseUser = await auth().signInWithCredential(googleCredential);
    
    // Get ID token
    const idToken = await firebaseUser.user.getIdToken();
    console.log('Firebase ID Token:', idToken);
    return idToken;
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Option 3: Using Firebase CLI (For Testing)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Get auth token (this is different from ID token, but useful for testing)
firebase auth:export users.json
```

## Testing Endpoints

### Method 1: Using Test Scripts

#### Basic Tests (No Real Token Required)
```bash
chmod +x test-auth.sh
./test-auth.sh
```

#### Real Token Tests
```bash
chmod +x test-auth-real.sh
export FIREBASE_ID_TOKEN="your-firebase-id-token-here"
./test-auth-real.sh
```

### Method 2: Using cURL

#### 1. Google Sign-In
```bash
curl -X POST http://localhost:3000/api/v1/auth/google-signin \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "YOUR_FIREBASE_ID_TOKEN",
    "deviceInfo": {
      "deviceName": "My MacBook",
      "deviceType": "web"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "accessExpiresAt": "2026-01-09T09:15:00.000Z",
    "refreshExpiresAt": "2026-01-16T09:00:00.000Z",
    "user": {
      "id": "uuid",
      "firebaseUid": "firebase-uid",
      "email": "user@example.com",
      "name": "User Name",
      "isProfileComplete": false
    },
    "device": {
      "id": "device-uuid",
      "deviceName": "My MacBook",
      "deviceType": "web"
    }
  }
}
```

#### 2. Complete Profile
```bash
curl -X POST http://localhost:3000/api/v1/auth/complete-profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "username": "johndoe",
    "age": 25,
    "phoneNumber": "+1234567890"
  }'
```

#### 3. Refresh Token
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

#### 4. Get Sessions
```bash
curl -X GET http://localhost:3000/api/v1/auth/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 5. Logout
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 6. Revoke Session
```bash
curl -X DELETE http://localhost:3000/api/v1/auth/sessions/DEVICE_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Method 3: Using Postman

1. **Import Collection**: Create a new collection in Postman
2. **Set Base URL**: `http://localhost:3000/api/v1`
3. **Create Requests**:
   - POST `/auth/google-signin`
   - POST `/auth/complete-profile`
   - POST `/auth/refresh`
   - GET `/auth/sessions`
   - POST `/auth/logout`
   - DELETE `/auth/sessions/:deviceId`

4. **Set Environment Variables**:
   - `base_url`: `http://localhost:3000/api/v1`
   - `access_token`: (set after sign-in)
   - `refresh_token`: (set after sign-in)
   - `firebase_id_token`: (your Firebase ID token)

## Expected Responses

### Success Responses
- Status: `200 OK`
- Body: `{ "success": true, "data": {...} }`

### Error Responses
- Status: `400`, `401`, `404`, `409`, `500`
- Body: `{ "success": false, "error": { "message": "...", "code": "..." } }`

## Common Error Codes

- `AUTH_REQUIRED` - No token provided
- `AUTH_FAILED` - Token verification failed
- `TOKEN_EXPIRED` - Token has expired
- `SESSION_INVALID` - Session not found or inactive
- `USER_INVALID` - User not found or inactive
- `USERNAME_TAKEN` - Username already exists
- `PHONE_TAKEN` - Phone number already registered
- `VALIDATION_ERROR` - Request validation failed

## Testing Checklist

- [ ] Server starts without errors
- [ ] Firebase initializes correctly
- [ ] Health check returns OK
- [ ] Google Sign-In with valid token creates user
- [ ] Google Sign-In with invalid token returns error
- [ ] Complete profile updates user data
- [ ] Username uniqueness is enforced
- [ ] Phone number uniqueness is enforced
- [ ] Refresh token generates new access token
- [ ] Access token expires after 15 minutes
- [ ] Refresh token expires after 7 days
- [ ] Get sessions returns all active sessions
- [ ] Logout revokes current session
- [ ] Revoke session removes specific device
- [ ] Protected routes require authentication
- [ ] Invalid tokens are rejected

## Debugging

### Check Server Logs
```bash
# View application logs
tail -f logs/combined-*.log

# View error logs
tail -f logs/error-*.log
```

### Check Database
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d plasticworld_db

# Check users
SELECT id, firebase_uid, email, username FROM users;

# Check sessions
SELECT id, user_id, device_id, is_active, created_at FROM sessions;

# Check devices
SELECT id, user_id, device_name, device_type FROM devices;
```

### Check Redis
```bash
# Connect to Redis
docker-compose exec redis redis-cli

# List all keys
KEYS *

# Get session data
GET session:USER_ID:DEVICE_ID
```

## Troubleshooting

### Firebase Initialization Error
- Check `.env` file has correct Firebase credentials
- Verify `FIREBASE_PRIVATE_KEY` has proper newlines (`\n`)
- Ensure `FIREBASE_PROJECT_ID` matches your Firebase project

### Token Verification Fails
- Verify the ID token is from the correct Firebase project
- Check token hasn't expired
- Ensure Firebase Admin SDK is properly initialized

### Database Connection Error
- Verify PostgreSQL is running: `docker-compose ps`
- Check database credentials in `.env`
- Test connection: `docker-compose exec postgres psql -U postgres -d plasticworld_db`

### Redis Connection Error
- Verify Redis is running: `docker-compose ps`
- Check Redis credentials in `.env`
- Test connection: `docker-compose exec redis redis-cli ping`
