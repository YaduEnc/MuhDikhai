# 📱 MuhDikhai iOS App – Complete API & WebSocket Documentation

**Version:** 1.0.0
**Status:** Production Ready
**Base REST URL:** `https://muhdikhai.yaduraj.me/api/v1` (or `http://localhost:3000/api/v1` for dev)
**Base WebSocket URL:** `wss://muhdikhai.yaduraj.me` (or `ws://localhost:3000` for dev)

This document is specifically crafted for the **iOS Development Team**. It provides every necessary endpoint, real-time WebSocket event, WebRTC flow, and JSON schema to build the full MuhDikhai application effortlessly.

---

## 📑 Table of Contents
1. [General Concepts](#1-general-concepts)
2. [Authentication](#2-authentication-rest)
3. [User Profiles & Settings](#3-user-profiles--settings-rest)
4. [Friendships & Block Management](#4-friendships--block-management-rest)
5. [End-to-End Encryption (E2EE) Setup](#5-end-to-end-encryption-e2ee-setup-rest)
6. [Messaging (REST)](#6-messaging-rest)
7. [Reports & Admin](#7-reports--admin-rest)
8. [Socket.io Real-Time Events](#8-socketio-real-time-events)
9. [Random Matchmaking & WebRTC](#9-random-matchmaking--webrtc-socketio)
10. [Error Codes & Rate Limiting](#10-error-codes--rate-limiting)

---

## 1. General Concepts

### Headers
Every protected REST endpoint requires the access token:
```
Authorization: Bearer <jwt-access-token>
```

### Response Format
All standard REST responses follow this wrapper format:
```json
{
  "success": true, // or false
  "data": { ... }, // Payload on success
  "error": {       // Only present if success: false
    "message": "Error details",
    "code": "ERROR_CODE"
  }
}
```

### Rate Limiting
- **Window:** 15 minutes
- **Limit:** 100 requests per IP
- Handled via `X-RateLimit-*` headers. Receives a HTTP `429 Too Many Requests` status code if exceeded.

---

## 2. Authentication (REST)

### `POST /auth/google-signin`
*Sign in using Google via Firebase ID Token.*

**Request Body:**
```json
{
  "idToken": "firebase-id-token",
  "deviceInfo": {
    "deviceName": "iPhone 15 Pro",
    "deviceType": "ios",
    "deviceToken": "apns-push-token"
  }
}
```

**Response (200 OK):**
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
      "email": "user@gmail.com",
      "username": "user123",
      "name": "User Name",
      "profilePictureUrl": "https://...",
      "status": "online",
      "isProfileComplete": false
    },
    "device": { "id": "device-uuid", "deviceName": "iPhone 15 Pro", "deviceType": "ios" }
  }
}
```

### `POST /auth/complete-profile`
*To be called if `isProfileComplete` is false after signup.*

**Request Body:**
```json
{
  "username": "cool_kid_99",
  "phoneNumber": "+1234567890",
  "age": 25
}
```

### `POST /auth/refresh`
*Refresh session tokens when access token expires.* (Returns new tokens similar to login).

**Request Body:**
```json
{ "refreshToken": "jwt-refresh-token" }
```

### `POST /auth/logout`
*Ends the current device session.*

---

## 3. User Profiles & Settings (REST)

### `GET /users/me`
*Fetch current user's profile and aura points.*

### `PUT /users/me`
*Update current user fields.*

**Request Body (Any combination):**
```json
{
  "username": "new_username",
  "phoneNumber": "+1098765432",
  "name": "New Name",
  "bio": "iOS Developer 🚀",
  "profilePictureUrl": "https://...",
  "gender": "male" // 'male' | 'female' | 'non-binary' | 'other' | 'prefer_not_to_say'
}
```

### `POST /users/me/avatar`
*Upload profile picture.*
- Send as `multipart/form-data` with key `avatar`.
- Returns `{ "data": { "url": "https://..." } }`.

### `PUT /users/me/status`
*Update manual presence status.*
```json
{ "status": "online" } // "online" | "away" | "offline"
```

### `GET /users/search?q=apple&type=all&limit=20&offset=0`
*Search users by username, email, or phone. `type` can be `username`, `email`, `phone`, or `all`.*

### `GET /users/:userId`
*Fetch public profile details of another user.*

### `GET /users/matches/recent`
*Get recent random chat matches.* Returns an array of matches.

### `POST /users/aura/vote`
*Submit a vibe check / aura points for a user after a random match.*
```json
{
  "targetId": "uuid",
  "roomId": "random:...",
  "vibe": "good" // or "bad"
}
```

### `DELETE /users/me`
*Permanently delete account and all associated data, including Firebase auth record.*

---

## 4. Friendships & Block Management (REST)

### `GET /friends?status=accepted&limit=50&offset=0`
*List friendships. Status can be: `accepted`, `pending`, `denied`, `blocked`.*

### `POST /friends/request`
*Send a friend request.*
```json
{ "userId": "target-uuid" }
```

### `GET /friends/requests/pending`
*Returns `{ "sent": [...], "received": [...] }`*

### `POST /friends/:friendshipId/accept`
### `POST /friends/:friendshipId/deny`
### `DELETE /friends/:friendshipId` (Unfriend / Cancel)

### `POST /friends/:userId/block`
```json
{ "reason": "Optional reason text" }
```

### `DELETE /friends/:userId/unblock`

---

## 5. End-to-End Encryption (E2EE) Setup (REST)

*(Implemented via Signal Protocol / X3DH & Double Ratchet concepts by the iOS team).*

### `POST /encryption/keys/initialize`
*Upload your device's identity keys and prekeys.*
```json
{ "identityKeyPublic": "...", "signedPreKeyPublic": "...", "signedPreKeySignature": "...", "prekeyCount": 100 }
```

### `GET /encryption/keys/prekey-bundle/:userId/:deviceId`
*Fetch another user's prekeys to initiate X3DH.*

### `POST /encryption/session/establish`
*Mark session established on the backend.*
```json
{ "recipientUserId": "...", "recipientDeviceId": "..." }
```

### `POST /encryption/keys/rotate`
*Rotate current device encryption keys.*

### `GET /encryption/keys`
*List all active encryption keys for the current user.*

### `DELETE /encryption/keys/:deviceId`
*Deactivate encryption keys for an old or compromised device.*

---

## 6. Messaging (REST)

*(Note: Sending messages is usually done via WebSockets for speed, but REST supports message retrieval).*

### `GET /messages/conversations`
*Fetch list of active chats, last message, and unread counts.*

### `GET /messages/:userId?limit=50&offset=0&beforeMessageId=uuid`
*Fetch conversation history with a specific user.*

### `POST /messages`
*Fallback to send a message via REST.*
```json
{
  "recipientId": "uuid",
  "encryptedContent": "base64...",
  "encryptedKey": "base64...",
  "messageType": "text", // "text" | "image" | "video" | "audio" | "file" | "system"
  "mediaUrl": "https://...",
  "mediaSizeBytes": 1024,
  "replyToMessageId": "uuid",
  "isVanish": false
}
```

### `PUT /messages/:messageId`
*Edit message content.*
```json
{ "encryptedContent": "base64...", "encryptedKey": "base64..." }
```

### `DELETE /messages/:messageId`
*Soft-delete message.*

### `POST /messages/:messageId/read` (or `.../delivered`)
### `POST /messages/read`
*Bulk mark reads.*
```json
{ "messageIds": ["uuid1", "uuid2"], "senderId": "uuid" }
```

---

## 7. Reports & Admin (REST)

### `POST /reports`
*Report a user for bad behavior.*
```json
{
  "reportedId": "uuid",
  "reason": "Inappropriate Content",
  "details": "They sent me rude messages in random chat."
}
```

### Admin Endpoints (Require Admin role)
- `GET /admin/stats/live`
- `GET /admin/stats/growth`
- `GET /admin/reports`
- `PATCH /admin/reports/:id`
- `POST /admin/users/:id/ban`

---

## 8. Socket.io Real-Time Events

### Connection Setup
```swift
// iOS Socket.IO Client Configuration
let manager = SocketManager(socketURL: URL(string: "wss://muhdikhai.yaduraj.me")!, config: [
    .log(true),
    .compress,
    .connectParams(["auth": ["token": "your-jwt-access-token"]])
])
let socket = manager.defaultSocket
```

### User State & Presence
- **Listen:** `user:online` (`{ userId, name }`)
- **Listen:** `user:offline` (`{ userId, name }`)
- **Listen:** `presence:count` (`{ count }` - total active users in app)
- **Emit:** `status:update` (`{ status: "online" | "away" | "offline" }`)
- **Listen:** `user:status` (`{ userId, status }`)

### Friend Chat (Direct Messages via Socket)
- **Emit:** `message:send`
  ```json
  {
    "recipientId": "uuid",
    "encryptedContent": "base64...",
    "encryptedKey": "base64...",
    "messageType": "text",
    "replyToMessageId": "uuid_optional",
    "isVanish": false,
    "mediaUrl": "url_optional",
    "mediaSizeBytes": 0
  }
  ```
- **Listen:** `message:sent` (Confirm to sender)
- **Listen:** `message:received` (Incoming for recipient)
- **Listen:** `message:delivered`
- **Listen:** `message:read`
- **Emit:** `message:read` (`{ messageId: "uuid" }`)
- **Emit:** `messages:read` (`{ messageIds: ["uuid1"], senderId: "uuid" }`)
- **Emit:** `message:delete` (`{ messageId: "uuid", recipientId: "uuid" }`)
  - **Listen:** `message:deleted` (`{ messageId, userId }`)
- **Emit:** `message:edit` (`{ messageId: "uuid", content: "new...", recipientId: "uuid" }`)
  - **Listen:** `message:edited` (`{ messageId, content, userId }`)

### Typing Indicators
- **Emit:** `typing:start` (`{ recipientId: "uuid" }`) -> **Listen:** `typing:start` (`{ userId, name }`)
- **Emit:** `typing:stop` (`{ recipientId: "uuid" }`) -> **Listen:** `typing:stop` (`{ userId }`)

### Friend Interactive Doodle Board
- **Emit:** `friend:doodle:draw` (`{ recipientId, x1, y1, x2, y2, color, width }`) -> **Listen:** `friend:doodle:draw`
- **Emit:** `friend:doodle:clear` (`{ recipientId }`) -> **Listen:** `friend:doodle:clear`

---

## 9. Random Matchmaking & WebRTC (Socket.io)

MuhDikhai's flagship feature incorporates a highly scalable queue system for random text & video matching.

### 1. Queuing & Matching Flow
1. **User Emits:** `random:join`
   ```json
   {
     "topics": ["Anime", "Coding"],
     "preference": "everyone" // or "male" / "female"
   }
   ```
2. **Server Emits to User:** `random:waiting`
   *(User is successfully in queue)*
   Server also globally emits `random:stats` (`{ online, inQueue, matched }`) to update UI.
3. **Server Emits to User (when match found):** `random:matched`
   ```json
   {
     "roomId": "random:uuid1:uuid2:1234567",
     "partner": { "id": "uuid", "name": "...", "profilePictureUrl": "...", "gender": "..." },
     "topic": "Anime" // The topic matched on, or empty
   }
   ```

### 2. Random Room Interactions
Once in a `roomId`, you use these lightweight event names to interact specifically with your match:

- **Chatting:**
  - **Emit:** `random:message` (`{ roomId, content, replyToMessageId, isVanish }`)
  - **Listen:** `random:message` (`{ id, roomId, fromUserId, fromName, content, type, sentAt, replyToMessageId, isVanish }`)
- **Reactions:**
  - **Emit:** `random:reaction` (`{ roomId, messageId, emoji }`)
  - **Listen:** `random:reaction`
- **Editing/Deleting:**
  - **Emit:** `random:edit` (`{ roomId, messageId, content }`) -> **Listen:** `random:edited`
  - **Emit:** `random:delete` (`{ roomId, messageId }`) -> **Listen:** `random:deleted`
- **Doodle Board:**
  - **Emit:** `random:doodle:draw` (`{ roomId, x1, y1, x2, y2, color, width }`) -> **Listen:** `random:doodle:draw`
  - **Emit:** `random:doodle:clear` (`{ roomId }`) -> **Listen:** `random:doodle:clear`

### 3. Exiting the Random Chat
- **Emit:** `random:leave`
- **Server Emits to Partner:** `random:left` (`{ roomId, userId }`)
- **Server Emits to Both:** `random:ended` (`{ roomId }`)
*Note: Always emit `random:leave` when user taps "Next" or closes the app.*

### 4. WebRTC Video/Audio Signaling
WebRTC works for **both** Random Matchmaking rooms and Direct Friend Calls.
If `roomId` is provided, it relays inside the room. If `recipientId` is provided, it relays direct to friend.

- **1. Call Request:**
  - **Emit:** `webrtc:call-request` (`{ roomId?, recipientId? }`)
  - **Listen:** `webrtc:call-request` (`{ fromUserId, roomId?, recipientId?, caller: { id, name } }`)
- **2. Call Response:**
  - **Emit:** `webrtc:call-response` (`{ roomId?, recipientId?, status: 'accepted' | 'declined' }`)
  - **Listen:** `webrtc:call-response` (`{ fromUserId, status }`)
- **3. ICE / SDP Signaling:**
  - **Emit:** `webrtc:signal` (`{ roomId?, recipientId?, signal: { ... } }`)
  - **Listen:** `webrtc:signal` (`{ fromUserId, signal }`)

*(Use Apple's WebRTC framework in iOS. Exchange SDP Offer/Answer and ICE candidates strictly over `webrtc:signal` messages).*

---

## 10. Error Codes & Rate Limiting

### Error Payloads
```json
{
  "success": false,
  "error": {
    "message": "Authentication token required",
    "code": "AUTH_REQUIRED",
    "details": []
  },
  "timestamp": "2026-03-10T12:00:00.000Z"
}
```

### Common App Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Missing Token |
| `TOKEN_EXPIRED` | 401 | Refresh token needed |
| `SESSION_INVALID` | 401 | Session revoked |
| `USER_NOT_FOUND` | 404 | User no longer exists |
| `USERNAME_TAKEN` | 409 | Profile conflict |
| `PHONE_TAKEN` | 409 | Profile conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Wait for limit to reset |

### General iOS Architecture Advice
- Use `URLSession` for REST API endpoints.
- Store JWT tokens safely in the **iOS Keychain**.
- Automatically retry on `401 TOKEN_EXPIRED` by calling `/auth/refresh` and queueing failed requests.
- Start Socket.IO Manager immediately after successful initial app load & token fetch.
- Run X3DH Cryptographic Initialization on first-ever launch (`/encryption/keys/initialize`). Keep Private Identity Keys strictly local on the iPhone using Secure Enclave if possible.
