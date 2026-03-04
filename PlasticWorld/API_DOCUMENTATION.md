# PlasticWorld Backend API Documentation

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000/api/v1` (Development)  
**WebSocket URL:** `ws://localhost:3000` (Development)

## 📋 Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Friendship Management](#friendship-management)
4. [Messaging](#messaging)
5. [Encryption](#encryption)
6. [WebSocket Events](#websocket-events)
7. [Error Codes](#error-codes)
8. [Rate Limiting](#rate-limiting)

---

## 🔐 Authentication

### POST /auth/google-signin

Sign in with Google OAuth (Firebase ID Token).

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "deviceInfo": {
    "deviceName": "iPhone 15 Pro",
    "deviceType": "ios",
    "deviceToken": "apns-token-optional"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "accessExpiresAt": "2026-01-09T12:00:00.000Z",
    "refreshExpiresAt": "2026-01-16T12:00:00.000Z",
    "user": {
      "id": "uuid",
      "firebaseUid": "firebase-uid",
      "email": "user@example.com",
      "username": "username",
      "name": "User Name",
      "profilePictureUrl": "https://...",
      "bio": null,
      "status": "offline",
      "isProfileComplete": true
    },
    "device": {
      "id": "device-uuid",
      "deviceName": "iPhone 15 Pro",
      "deviceType": "ios"
    }
  }
}
```

### POST /auth/complete-profile

Complete user profile after first login.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "username": "johndoe",
  "phoneNumber": "+1234567890",
  "age": 25
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "johndoe",
      "phoneNumber": "+1234567890",
      "age": 25,
      ...
    }
  }
}
```

### POST /auth/refresh

Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-access-token",
    "refreshToken": "new-jwt-refresh-token",
    "accessExpiresAt": "2026-01-09T12:15:00.000Z",
    "refreshExpiresAt": "2026-01-16T12:00:00.000Z"
  }
}
```

### POST /auth/logout

Logout current session.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 👤 User Management

### GET /users/me

Get current user's profile.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "firebaseUid": "firebase-uid",
      "username": "johndoe",
      "email": "user@example.com",
      "phoneNumber": "+1234567890",
      "name": "John Doe",
      "age": 25,
      "profilePictureUrl": "https://...",
      "bio": "Bio text",
      "status": "online",
      "lastSeen": "2026-01-09T12:00:00.000Z",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-09T12:00:00.000Z"
    }
  }
}
```

### PUT /users/me

Update current user's profile.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "name": "John Doe Updated",
  "bio": "Updated bio",
  "profilePictureUrl": "https://...",
  "username": "newusername",
  "phoneNumber": "+1234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "John Doe Updated",
      ...
    }
  }
}
```

### GET /users/:userId

Get public profile of another user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "johndoe",
      "name": "John Doe",
      "profilePictureUrl": "https://...",
      "bio": "Bio text",
      "status": "online",
      "lastSeen": "2026-01-09T12:00:00.000Z"
    }
  }
}
```

### GET /users/search

Search users by username, email, or phone.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Query Parameters:**
- `q` (required): Search query
- `type` (optional): `username` | `email` | `phone` | `all` (default: `all`)
- `limit` (optional): Number of results (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "johndoe",
        "name": "John Doe",
        "profilePictureUrl": "https://...",
        "bio": "Bio text",
        "status": "online"
      }
    ],
    "pagination": {
      "total": 50,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### PUT /users/me/status

Update user's online status.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "status": "online" | "away" | "offline"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "online",
    "lastSeen": "2026-01-09T12:00:00.000Z"
  }
}
```

### DELETE /users/me

Delete user account (soft delete).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

## 👥 Friendship Management

### GET /friends

List all friends/friend requests.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Query Parameters:**
- `status` (optional): `accepted` | `pending` | `denied` | `blocked`
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "friendships": [
      {
        "id": "friendship-uuid",
        "status": "accepted",
        "requestedAt": "2026-01-01T00:00:00.000Z",
        "respondedAt": "2026-01-01T00:05:00.000Z",
        "isRequester": true,
        "user": {
          "id": "uuid",
          "username": "johndoe",
          "name": "John Doe",
          "profilePictureUrl": "https://...",
          "bio": "Bio text",
          "status": "online"
        }
      }
    ],
    "pagination": {
      "total": 10,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

### POST /friends/request

Send friend request.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "userId": "recipient-user-uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "friendship": {
      "id": "friendship-uuid",
      "status": "pending",
      "requestedAt": "2026-01-09T12:00:00.000Z"
    }
  }
}
```

### GET /friends/requests/pending

Get pending friend requests (sent and received).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sent": [
      {
        "id": "friendship-uuid",
        "status": "pending",
        "requestedAt": "2026-01-09T12:00:00.000Z",
        "user": { ... }
      }
    ],
    "received": [
      {
        "id": "friendship-uuid",
        "status": "pending",
        "requestedAt": "2026-01-09T12:00:00.000Z",
        "user": { ... }
      }
    ]
  }
}
```

### POST /friends/:friendshipId/accept

Accept a friend request.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "friendship": {
      "id": "friendship-uuid",
      "status": "accepted",
      "respondedAt": "2026-01-09T12:05:00.000Z"
    }
  }
}
```

### POST /friends/:friendshipId/deny

Deny a friend request.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "friendship": {
      "id": "friendship-uuid",
      "status": "denied",
      "respondedAt": "2026-01-09T12:05:00.000Z"
    }
  }
}
```

### DELETE /friends/:friendshipId

Unfriend or cancel friend request.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Friendship deleted successfully"
}
```

### POST /friends/:userId/block

Block a user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "reason": "Optional reason for blocking"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "block": {
      "id": "block-uuid",
      "blockerId": "your-uuid",
      "blockedId": "blocked-user-uuid",
      "reason": "Optional reason",
      "createdAt": "2026-01-09T12:00:00.000Z"
    }
  }
}
```

### DELETE /friends/:userId/unblock

Unblock a user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

---

## 💬 Messaging

### POST /messages

Send a message.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "recipientId": "recipient-uuid",
  "encryptedContent": "base64-encoded-encrypted-content",
  "encryptedKey": "base64-encoded-encryption-key",
  "messageType": "text" | "image" | "video" | "audio" | "file" | "system",
  "mediaUrl": "https://...",
  "mediaSizeBytes": 1024000,
  "replyToMessageId": "message-uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "message-uuid",
      "senderId": "your-uuid",
      "recipientId": "recipient-uuid",
      "messageType": "text",
      "status": "sent",
      "sentAt": "2026-01-09T12:00:00.000Z",
      "replyToMessageId": null
    }
  }
}
```

### GET /messages/conversations

Get all conversations for current user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "userId": "other-user-uuid",
        "username": "johndoe",
        "name": "John Doe",
        "profilePictureUrl": "https://...",
        "lastMessage": {
          "id": "message-uuid",
          "messageType": "text",
          "sentAt": "2026-01-09T12:00:00.000Z",
          "status": "read"
        },
        "unreadCount": 5
      }
    ]
  }
}
```

### GET /messages/:userId

Get conversation between current user and another user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Query Parameters:**
- `limit` (optional): Number of messages (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `beforeMessageId` (optional): Get messages before this message ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "message-uuid",
        "senderId": "sender-uuid",
        "recipientId": "recipient-uuid",
        "messageType": "text",
        "mediaUrl": null,
        "mediaSizeBytes": null,
        "status": "read",
        "sentAt": "2026-01-09T12:00:00.000Z",
        "deliveredAt": "2026-01-09T12:00:01.000Z",
        "readAt": "2026-01-09T12:00:05.000Z",
        "replyToMessageId": null,
        "isEdited": false,
        "editedAt": null,
        "sender": {
          "id": "sender-uuid",
          "username": "johndoe",
          "name": "John Doe",
          "profilePictureUrl": "https://..."
        },
        "recipient": { ... }
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### PUT /messages/:messageId

Edit a message (within 15 minutes).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "encryptedContent": "base64-encoded-new-encrypted-content",
  "encryptedKey": "base64-encoded-new-encryption-key"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "message-uuid",
      "isEdited": true,
      "editedAt": "2026-01-09T12:10:00.000Z",
      ...
    }
  }
}
```

### DELETE /messages/:messageId

Delete a message (soft delete).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

### POST /messages/:messageId/delivered

Mark message as delivered.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Message marked as delivered"
}
```

### POST /messages/:messageId/read

Mark message as read.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Message marked as read"
}
```

### POST /messages/read

Mark multiple messages as read.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "messageIds": ["message-uuid-1", "message-uuid-2"],
  "senderId": "sender-uuid"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Messages marked as read"
}
```

### GET /messages/unread/count

Get unread message count.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 15,
    "perConversation": {
      "user-uuid-1": 5,
      "user-uuid-2": 10
    }
  }
}
```

---

## 🔐 Encryption

### POST /encryption/keys/initialize

Initialize encryption keys for current device.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "keys": {
      "identityKeyPublic": "base64-encoded-key",
      "signedPreKeyPublic": "base64-encoded-key",
      "signedPreKeySignature": "base64-encoded-signature",
      "prekeyCount": 100
    }
  }
}
```

### GET /encryption/keys/prekey-bundle/:userId/:deviceId

Get prekey bundle for X3DH key exchange.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "bundle": {
      "identityKey": "base64-encoded-key",
      "signedPreKey": {
        "keyId": 1234567890,
        "publicKey": "base64-encoded-key",
        "signature": "base64-encoded-signature"
      },
      "oneTimePreKey": {
        "keyId": 1234567891,
        "publicKey": "base64-encoded-key"
      }
    }
  }
}
```

### POST /encryption/session/establish

Establish encryption session with another user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request:**
```json
{
  "recipientUserId": "recipient-uuid",
  "recipientDeviceId": "recipient-device-uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "session": {
      "sessionId": "session-id",
      "rootKey": "base64-encoded-key",
      "sendingChainKey": "base64-encoded-key",
      "receivingChainKey": "base64-encoded-key"
    }
  }
}
```

### POST /encryption/keys/rotate

Rotate encryption keys for current device.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "keys": {
      "identityKeyPublic": "base64-encoded-key",
      "signedPreKeyPublic": "base64-encoded-key",
      "signedPreKeySignature": "base64-encoded-signature",
      "prekeyCount": 100
    }
  }
}
```

### GET /encryption/keys

Get all encryption keys for current user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "keys": [
      {
        "id": "key-uuid",
        "deviceId": "device-uuid",
        "prekeyCount": 100,
        "keyCreatedAt": "2026-01-09T12:00:00.000Z",
        "keyExpiresAt": null,
        "isActive": true
      }
    ]
  }
}
```

### DELETE /encryption/keys/:deviceId

Deactivate encryption keys for a device.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Encryption keys deactivated successfully"
}
```

---

## 🔌 WebSocket Events

### Connection

Connect to WebSocket server:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-access-token'
  }
});
```

### Events Emitted by Client

#### `message:send`
Send a message via WebSocket.

```javascript
socket.emit('message:send', {
  recipientId: 'recipient-uuid',
  encryptedContent: 'base64-encoded-content',
  encryptedKey: 'base64-encoded-key',
  messageType: 'text',
  mediaUrl: 'https://...',
  mediaSizeBytes: 1024000,
  replyToMessageId: 'message-uuid'
});
```

#### `typing:start`
Indicate user started typing.

```javascript
socket.emit('typing:start', {
  recipientId: 'recipient-uuid'
});
```

#### `typing:stop`
Indicate user stopped typing.

```javascript
socket.emit('typing:stop', {
  recipientId: 'recipient-uuid'
});
```

#### `message:read`
Mark message as read.

```javascript
socket.emit('message:read', {
  messageId: 'message-uuid'
});
```

#### `messages:read`
Mark multiple messages as read.

```javascript
socket.emit('messages:read', {
  messageIds: ['message-uuid-1', 'message-uuid-2'],
  senderId: 'sender-uuid'
});
```

#### `status:update`
Update user status.

```javascript
socket.emit('status:update', {
  status: 'online' | 'away' | 'offline'
});
```

### Events Received from Server

#### `message:sent`
Confirmation that message was sent.

```javascript
socket.on('message:sent', (data) => {
  console.log('Message sent:', data.message);
});
```

#### `message:received`
New message received.

```javascript
socket.on('message:received', (data) => {
  console.log('New message:', data.message);
});
```

#### `message:delivered`
Message was delivered to recipient.

```javascript
socket.on('message:delivered', (data) => {
  console.log('Message delivered:', data.messageId);
});
```

#### `message:read`
Message was read by recipient.

```javascript
socket.on('message:read', (data) => {
  console.log('Message read:', data.messageId);
});
```

#### `message:error`
Error sending message.

```javascript
socket.on('message:error', (data) => {
  console.error('Message error:', data.error);
});
```

#### `typing:start`
User started typing.

```javascript
socket.on('typing:start', (data) => {
  console.log(`${data.name} is typing...`);
});
```

#### `typing:stop`
User stopped typing.

```javascript
socket.on('typing:stop', (data) => {
  console.log(`${data.userId} stopped typing`);
});
```

#### `user:online`
User came online.

```javascript
socket.on('user:online', (data) => {
  console.log(`${data.name} is now online`);
});
```

#### `user:offline`
User went offline.

```javascript
socket.on('user:offline', (data) => {
  console.log(`${data.name} is now offline`);
});
```

#### `user:status`
User status changed.

```javascript
socket.on('user:status', (data) => {
  console.log(`User ${data.userId} status: ${data.status}`);
});
```

---

## ❌ Error Codes

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "details": []
  },
  "timestamp": "2026-01-09T12:00:00.000Z"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication token required |
| `AUTH_FAILED` | 401 | Authentication failed |
| `TOKEN_EXPIRED` | 401 | Access token expired |
| `SESSION_INVALID` | 401 | Session not found or inactive |
| `USER_INVALID` | 401 | User not found or inactive |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `USER_NOT_FOUND` | 404 | User not found |
| `MESSAGE_NOT_FOUND` | 404 | Message not found |
| `FRIENDSHIP_NOT_FOUND` | 404 | Friendship not found |
| `USERNAME_TAKEN` | 409 | Username already taken |
| `PHONE_TAKEN` | 409 | Phone number already registered |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## 🚦 Rate Limiting

- **Window:** 15 minutes
- **Limit:** 100 requests per window per IP
- **Headers:** Rate limit info included in response headers:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset time (Unix timestamp)

---

## 📝 Notes for Frontend Developers

1. **Authentication:**
   - All protected endpoints require `Authorization: Bearer <access-token>` header
   - Access tokens expire in 15 minutes
   - Use refresh token to get new access token
   - Store tokens securely (Keychain on iOS)

2. **WebSocket:**
   - Connect with access token in `auth.token`
   - Reconnect automatically on disconnect
   - Handle connection errors gracefully

3. **Encryption:**
   - Initialize keys on first app launch
   - Store private keys securely (never send to server)
   - Perform X3DH key exchange before first message
   - Implement Double Ratchet on client side

4. **Pagination:**
   - Use `limit` and `offset` for pagination
   - Check `hasMore` in pagination object
   - Use `beforeMessageId` for message pagination

5. **Error Handling:**
   - Always check `success` field in response
   - Handle `401` errors by refreshing token
   - Show user-friendly error messages
   - Log errors for debugging

6. **Real-time Updates:**
   - Use WebSocket for real-time features
   - Fallback to polling if WebSocket fails
   - Handle offline/online state changes

---

**Last Updated:** January 9, 2026  
**API Version:** v1
