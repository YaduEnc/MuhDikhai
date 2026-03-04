# PlasticWorld Backend - Deep Technical Overview

## 🎯 What We Built

**PlasticWorld Backend** is a production-ready, enterprise-grade messaging platform backend API that provides secure, real-time communication capabilities with end-to-end encryption. It's a complete backend solution designed to power messaging applications across web, iOS, and Android platforms.

## 🏗️ System Architecture

### Core Components

1. **REST API Server** (Express.js + TypeScript)
   - Handles HTTP requests for all API endpoints
   - Implements authentication, authorization, and business logic
   - Provides RESTful interface for client applications

2. **WebSocket Server** (Socket.io)
   - Real-time bidirectional communication
   - Handles live messaging, typing indicators, online status
   - Event-driven architecture for instant updates

3. **PostgreSQL Database**
   - Primary data store for all persistent data
   - Stores users, messages, friendships, encryption keys
   - ACID-compliant transactions for data integrity

4. **Redis Cache**
   - Session management and token storage
   - Real-time presence tracking (online/offline status)
   - Typing indicators and temporary data
   - High-performance caching layer

5. **Firebase Integration**
   - Google OAuth authentication
   - User identity verification
   - Secure token-based authentication

## 🔐 Security Architecture

### Authentication Flow

1. **User Signs In with Google**
   - Client authenticates with Firebase
   - Receives Firebase ID token
   - Sends token to backend

2. **Backend Verification**
   - Verifies Firebase ID token
   - Checks if user exists in database
   - Creates new user if first-time sign-in
   - Generates device record

3. **Token Generation**
   - Creates JWT access token (15 min expiry)
   - Creates JWT refresh token (7 days expiry)
   - Stores session in Redis
   - Returns tokens to client

4. **Subsequent Requests**
   - Client sends access token in Authorization header
   - Backend validates token
   - If expired, client uses refresh token to get new access token

### End-to-End Encryption

**Signal Protocol Implementation:**

1. **Key Exchange (X3DH)**
   - Each user has identity key, signed prekey, and one-time prekeys
   - First message initiates X3DH key exchange
   - Generates shared secret (root key) between users
   - Server never sees plaintext messages

2. **Double Ratchet**
   - Continuous key rotation for forward secrecy
   - Each message uses new encryption key
   - Prevents decryption of past messages if keys are compromised

3. **Message Encryption**
   - Client-side encryption before sending
   - Server stores only encrypted content
   - Recipient decrypts on client-side
   - Server cannot read message content

## 💬 Messaging System

### Message Flow

1. **Sending a Message**
   ```
   Client → Encrypts message (Signal Protocol)
   Client → POST /messages (encrypted content)
   Backend → Validates friendship status
   Backend → Stores encrypted message in PostgreSQL
   Backend → Checks if recipient is online (Redis)
   Backend → Emits WebSocket event if online
   Backend → Returns success to sender
   ```

2. **Receiving a Message**
   ```
   If Online: WebSocket delivers instantly
   If Offline: Message queued in database
   Client → Fetches messages on reconnect
   Client → Decrypts message locally
   ```

3. **Message States**
   - **Sent**: Message stored in database
   - **Delivered**: Recipient device received message
   - **Read**: Recipient opened and read message

### Real-Time Features

- **Typing Indicators**: Real-time typing status via WebSocket
- **Online Status**: Tracks user presence in Redis
- **Read Receipts**: Instant notification when message is read
- **Delivery Status**: Confirmation when message is delivered

## 👥 User Management

### User Profile System

- **Profile Fields**: Name, username, email, bio, profile picture, age
- **Search Functionality**: Search users by username or email
- **Public Profiles**: View other users' public information
- **Profile Updates**: Secure profile modification with validation

### Friendship System

1. **Friend Request Flow**
   ```
   User A → Sends friend request to User B
   Backend → Validates (not already friends, not blocked)
   Backend → Creates friendship record (status: "pending")
   Backend → Notifies User B via WebSocket (if online)
   ```

2. **Accept/Reject**
   ```
   User B → Accepts or rejects request
   Backend → Updates friendship status
   Backend → Notifies User A of decision
   ```

3. **Blocking System**
   - Users can block other users
   - Blocked users cannot send messages or friend requests
   - Blocked status is checked before all interactions

## 🔧 Technical Implementation

### Technology Stack

**Backend:**
- **Node.js 18+**: Runtime environment
- **TypeScript**: Type-safe development
- **Express.js**: Web framework
- **Socket.io**: WebSocket server
- **PostgreSQL**: Relational database
- **Redis**: In-memory cache
- **Firebase Admin SDK**: Authentication
- **JWT**: Token-based authentication
- **Winston**: Structured logging

**Security:**
- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: DDoS protection
- **Input Validation**: Zod schemas
- **SQL Injection Prevention**: Parameterized queries

### Database Schema

**Core Tables:**
- `users`: User profiles and authentication
- `devices`: Multi-device support
- `sessions`: Active user sessions
- `friendships`: Friend relationships
- `blocks`: User blocking
- `messages`: Encrypted messages
- `encryption_keys`: Signal Protocol keys

**Relationships:**
- Users have multiple devices
- Users have multiple sessions (one per device)
- Users can have multiple friendships
- Messages link sender and recipient
- Encryption keys per user-device pair

### API Design

**RESTful Endpoints:**
- `/api/v1/auth/*` - Authentication
- `/api/v1/users/*` - User management
- `/api/v1/friends/*` - Friendship management
- `/api/v1/messages/*` - Messaging
- `/api/v1/encryption/*` - Encryption keys

**WebSocket Events:**
- `message:received` - New message
- `message:delivered` - Delivery confirmation
- `message:read` - Read receipt
- `typing:start/stop` - Typing indicators
- `user:online/offline` - Presence updates
- `friend:request:received` - Friend request notification

## 🚀 Performance Optimizations

### Database Optimization

1. **Connection Pooling**
   - PostgreSQL connection pool (2-10 connections)
   - Reuses connections for better performance
   - Prevents connection exhaustion

2. **Query Optimization**
   - Indexed columns for fast lookups
   - Efficient JOINs for related data
   - Pagination for large result sets

3. **Caching Strategy**
   - Redis caches frequently accessed data
   - User profiles cached for quick access
   - Session data stored in Redis (fast lookups)

### Real-Time Optimization

1. **WebSocket Connection Management**
   - Efficient connection pooling
   - Room-based message delivery
   - Automatic reconnection handling

2. **Event Batching**
   - Groups multiple updates together
   - Reduces network overhead
   - Improves client performance

3. **Debouncing**
   - Typing indicators debounced (3 seconds)
   - Prevents excessive WebSocket events
   - Reduces server load

## 📊 Scalability Features

### Horizontal Scaling Ready

- **Stateless API**: Can run multiple instances
- **Redis for State**: Shared state across instances
- **Database Connection Pooling**: Handles concurrent connections
- **Load Balancer Compatible**: Works behind reverse proxy

### Multi-Device Support

- Each device has separate session
- Messages synced across all user devices
- Read receipts broadcast to all sender devices
- Encryption keys per device

## 🔍 Monitoring & Logging

### Logging System

- **Winston Logger**: Structured JSON logging
- **Daily Rotation**: Log files rotated daily
- **Error Tracking**: Comprehensive error logging
- **Request Logging**: HTTP request/response logging

### Health Checks

- `/health` endpoint for monitoring
- Database connection status
- Redis connection status
- Service availability

## 🐳 Deployment

### Docker Support

- **Dockerfile**: Production-ready multi-stage build
- **docker-compose.yml**: Local development setup
- **Optimized Images**: Minimal Alpine-based images
- **Health Checks**: Built-in container health monitoring

### Production Features

- **Environment Variables**: Secure configuration
- **Process Management**: PM2 compatible
- **Graceful Shutdown**: Proper cleanup on termination
- **Error Handling**: Comprehensive error recovery

## 📈 What Makes This Special

### 1. **End-to-End Encryption**
- True E2E encryption using Signal Protocol
- Server cannot read messages
- Forward secrecy with key rotation
- Industry-standard security

### 2. **Real-Time Performance**
- Sub-100ms latency for real-time features
- WebSocket for instant delivery
- Optimized database queries
- Efficient caching strategy

### 3. **Production Ready**
- Comprehensive error handling
- Structured logging
- Health monitoring
- Security best practices
- Scalable architecture

### 4. **Developer Friendly**
- TypeScript for type safety
- Well-documented API
- Clean code structure
- Easy to extend and maintain

### 5. **Multi-Platform Support**
- REST API for any client
- WebSocket for real-time features
- Works with web, iOS, Android
- Platform-agnostic design

## 🎓 Key Learnings & Design Decisions

### Why PostgreSQL?
- ACID compliance for data integrity
- Complex queries for relationships
- Reliable for critical data
- Excellent performance with proper indexing

### Why Redis?
- Sub-millisecond latency
- Perfect for session management
- Real-time presence tracking
- High-performance caching

### Why Signal Protocol?
- Industry-proven encryption
- Forward secrecy
- Perfect for messaging apps
- Open-source and audited

### Why TypeScript?
- Type safety prevents bugs
- Better IDE support
- Self-documenting code
- Easier refactoring

## 🔮 Future Enhancements

Potential additions:
- Media file handling (images, videos)
- Group messaging
- Voice/video calling signaling
- Push notifications
- Message reactions
- Message forwarding
- Advanced search
- Message backup/restore

## 📝 Summary

**PlasticWorld Backend** is a complete, production-ready messaging backend that provides:

✅ Secure authentication with Firebase  
✅ End-to-end encryption with Signal Protocol  
✅ Real-time messaging with WebSocket  
✅ Scalable architecture  
✅ Multi-device support  
✅ Comprehensive API  
✅ Production-ready deployment  

It's designed to be the foundation for building secure, real-time messaging applications that can scale from small projects to enterprise-level deployments.

---

**Built with ❤️ by Yaduraj Singh**
