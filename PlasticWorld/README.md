# PlasticWorld Backend API

A production-ready, open-source messaging backend API with end-to-end encryption support. Built with Node.js, TypeScript, Express, PostgreSQL, Redis, and Socket.io.

**Developed and Designed by [Yaduraj Singh](https://github.com/yadurajsingh)**

## ✨ Features

- 🔐 **End-to-End Encryption** - Signal Protocol implementation for secure messaging
- 💬 **Real-time Messaging** - WebSocket support with Socket.io
- 👥 **User Management** - Firebase authentication, user profiles, friend requests
- 🔒 **Security First** - JWT authentication, rate limiting, input validation, CORS
- ⚡ **High Performance** - Optimized queries, connection pooling, Redis caching
- 📊 **Production Ready** - Comprehensive logging, error handling, health checks
- 🚀 **RESTful API** - Clean, well-documented REST endpoints
- 🔌 **WebSocket Events** - Real-time notifications and updates

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker & Docker Compose (recommended) OR PostgreSQL 15+ and Redis 7+

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/plasticworld-backend.git
cd plasticworld-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [.env.example](./.env.example) for all options).

4. **Set up databases with Docker Compose** (recommended)
```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Verify containers are running
docker-compose ps
```

5. **Run database migrations**
```bash
npm run db:migrate
```

6. **Build TypeScript**
```bash
npm run build
```

7. **Start the server**
```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000`

## 🐳 Docker

### Development Setup

The project includes `docker-compose.yml` for easy local development with PostgreSQL and Redis.

#### Start Services
```bash
# Start PostgreSQL and Redis
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

#### Environment Variables for Docker
The `docker-compose.yml` uses environment variables from your `.env` file:
- `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL configuration
- `REDIS_PASSWORD` - Redis password (optional)

### Dockerfile

The project includes a production-ready `Dockerfile` with multi-stage build:

```bash
# Build the Docker image
docker build -t plasticworld-backend .

# Run the container
docker run -p 3000:3000 --env-file .env plasticworld-backend
```

#### Dockerfile Features
- Multi-stage build for optimized image size
- Non-root user for security
- Health check endpoint
- Proper signal handling with dumb-init
- Production dependencies only

### Docker Compose for Full Stack

You can extend `docker-compose.yml` to include the backend API:

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    networks:
      - plasticworld-network
```

Then run:
```bash
docker-compose up --build
```

## 📚 API Documentation

### Base URL
- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://your-domain.com/api/v1`

### WebSocket
- **Development**: `ws://localhost:3000`
- **Production**: `wss://your-domain.com`

### Endpoints

#### Authentication
- `POST /auth/google-signin` - Sign in with Google (Firebase)
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout and invalidate session
- `POST /auth/profile-complete` - Complete user profile after first sign-in

#### Users
- `GET /users/me` - Get current user profile
- `PUT /users/me` - Update current user profile
- `GET /users/search` - Search users by username/email
- `GET /users/:userId` - Get public user profile

#### Friends
- `GET /friends` - Get friends list
- `POST /friends/request` - Send friend request
- `POST /friends/:friendshipId/accept` - Accept friend request
- `POST /friends/:friendshipId/reject` - Reject friend request
- `DELETE /friends/:friendshipId` - Remove friend
- `POST /friends/:userId/block` - Block user
- `DELETE /friends/:userId/block` - Unblock user

#### Messages
- `POST /messages` - Send a message
- `GET /messages` - Get messages (with pagination)
- `GET /messages/:messageId` - Get specific message
- `PUT /messages/:messageId` - Edit message
- `DELETE /messages/:messageId` - Delete message
- `POST /messages/:messageId/delivered` - Mark message as delivered
- `POST /messages/:messageId/read` - Mark message as read
- `POST /messages/read` - Mark multiple messages as read

#### Encryption
- `GET /encryption/keys/prekey-bundle/:userId/:deviceId` - Get prekey bundle for key exchange
- `POST /encryption/session/establish` - Establish encryption session
- `GET /encryption/keys` - Get current user's encryption keys

#### Health
- `GET /health` - Health check endpoint

For detailed API documentation, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

## 🔌 WebSocket Events

### Client → Server
- `message:send` - Send a message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `status:update` - Update user status

### Server → Client
- `message:received` - New message received
- `message:delivered` - Message delivered to recipient
- `message:read` - Message read by recipient
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `user:online` - User came online
- `user:offline` - User went offline
- `friend:request:received` - New friend request
- `friend:request:accepted` - Friend request accepted

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Cache**: Redis
- **WebSocket**: Socket.io
- **Authentication**: Firebase Admin SDK + JWT
- **Encryption**: Signal Protocol (X3DH + Double Ratchet)
- **Logging**: Winston

### Project Structure
```
plasticworld-backend/
├── src/
│   ├── config/          # Configuration (database, redis, firebase, socket)
│   ├── middleware/       # Express middleware (auth, error handling)
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── migrations/      # Database migrations
│   ├── utils/           # Utilities (logger, validation)
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── dist/                # Compiled JavaScript (generated)
├── logs/                # Log files (generated)
├── docker-compose.yml   # Docker setup for local development
├── Dockerfile           # Production Docker image
└── package.json
```

## 📐 Architecture Diagrams

### System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        iOS[iOS App<br/>Swift/SwiftUI]
        Android[Android App<br/>Kotlin/Compose]
        Web[Web App<br/>React/Next.js]
    end
    
    subgraph "Network Layer"
        CF[Cloudflare Tunnel<br/>CDN & DDoS Protection]
        LB[Load Balancer<br/>PM2 Cluster]
    end
    
    subgraph "Application Layer"
        API[REST API<br/>Express.js + TypeScript]
        WS[WebSocket Server<br/>Socket.io]
    end
    
    subgraph "Business Logic Layer"
        Auth[Authentication Service<br/>Firebase + JWT]
        User[User Service<br/>Profile Management]
        Friend[Friendship Service<br/>Friend Requests]
        Message[Messaging Service<br/>Real-time Chat]
        Encrypt[Encryption Service<br/>Signal Protocol]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Primary Database)]
        Redis[(Redis<br/>Cache & Sessions)]
        Firebase[Firebase Auth<br/>OAuth Provider]
    end
    
    subgraph "Infrastructure"
        Docker[Docker Containers<br/>PostgreSQL & Redis]
        PM2[PM2 Process Manager<br/>Auto-restart & Clustering]
        Logs[Winston Logger<br/>Structured Logging]
    end
    
    iOS --> CF
    Android --> CF
    Web --> CF
    
    CF --> LB
    LB --> API
    LB --> WS
    
    API --> Auth
    API --> User
    API --> Friend
    API --> Message
    API --> Encrypt
    
    WS --> Message
    WS --> User
    
    Auth --> Firebase
    Auth --> Redis
    User --> PG
    Friend --> PG
    Message --> PG
    Encrypt --> PG
    Encrypt --> Redis
    
    API --> Redis
    WS --> Redis
    
    Docker --> PG
    Docker --> Redis
    PM2 --> API
    PM2 --> WS
    API --> Logs
    WS --> Logs
    
    style iOS fill:#007AFF
    style Android fill:#3DDC84
    style Web fill:#61DAFB
    style CF fill:#F38020
    style API fill:#339933
    style WS fill:#010101
    style PG fill:#336791
    style Redis fill:#DC382D
    style Firebase fill:#FFCA28
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant Firebase
    participant Backend
    participant PostgreSQL
    participant Redis
    
    Client->>Firebase: Sign in with Google
    Firebase-->>Client: Firebase ID Token
    
    Client->>Backend: POST /auth/google-signin<br/>{idToken, deviceInfo}
    Backend->>Firebase: Verify ID Token
    Firebase-->>Backend: User Info (email, name, photo)
    
    Backend->>PostgreSQL: Check if user exists<br/>(by Firebase UID or email)
    PostgreSQL-->>Backend: User data (or null)
    
    alt User doesn't exist
        Backend->>PostgreSQL: Create new user<br/>Generate username
        PostgreSQL-->>Backend: User created
    else User exists but inactive
        Backend->>PostgreSQL: Reactivate user<br/>Update Firebase UID
        PostgreSQL-->>Backend: User reactivated
    end
    
    Backend->>PostgreSQL: Create/update device record
    PostgreSQL-->>Backend: Device created
    
    Backend->>Backend: Generate JWT tokens<br/>(access + refresh)
    
    Backend->>Redis: Store session<br/>{userId, deviceId, refreshToken}
    Redis-->>Backend: Session stored
    
    Backend-->>Client: {accessToken, refreshToken, user, device}
    
    Client->>Client: Store tokens securely<br/>(Keychain/SecureStorage)
```

### Message Sending Flow

```mermaid
sequenceDiagram
    participant Sender
    participant Backend
    participant PostgreSQL
    participant Redis
    participant WebSocket
    participant Recipient
    
    Sender->>Sender: Encrypt message<br/>(Signal Protocol)
    
    Sender->>Backend: POST /messages<br/>{recipientId, encryptedContent, encryptedKey}
    
    Backend->>PostgreSQL: Check friendship<br/>& block status
    PostgreSQL-->>Backend: Friendship status
    
    alt Not friends or blocked
        Backend-->>Sender: 403 Forbidden<br/>{code: "NOT_FRIENDS"}
    else Valid
        Backend->>PostgreSQL: Insert message<br/>{senderId, recipientId, encryptedContent, status: "sent"}
        PostgreSQL-->>Backend: Message created
        
        Backend->>Redis: Check if recipient online
        Redis-->>Backend: Online status
        
        Backend-->>Sender: 201 Created<br/>{message}
        
        alt Recipient online
            Backend->>WebSocket: Emit to recipient<br/>"message:received"
            WebSocket->>Recipient: Real-time notification<br/>{message}
            Recipient->>Recipient: Show notification<br/>Update UI
        else Recipient offline
            Backend->>PostgreSQL: Queue for delivery<br/>(message status: "sent")
        end
        
        Sender->>Sender: Update UI<br/>Show "sent" status
    end
```

### End-to-End Encryption Flow (Signal Protocol)

```mermaid
sequenceDiagram
    participant Alice
    participant Backend
    participant PostgreSQL
    participant Redis
    participant Bob
    
    Note over Alice: First message to Bob
    
    Alice->>Backend: GET /encryption/keys/prekey-bundle/:bobId/:deviceId
    Backend->>PostgreSQL: Get Bob's keys<br/>{identityKey, signedPreKey, oneTimePreKey}
    PostgreSQL-->>Backend: Prekey bundle
    Backend-->>Alice: Prekey bundle
    
    Alice->>Alice: Perform X3DH key exchange<br/>Generate shared secret (root key)
    
    Alice->>Backend: POST /encryption/session/establish<br/>{recipientUserId, recipientDeviceId}
    Backend->>Backend: Perform X3DH<br/>(server-side validation)
    Backend->>Redis: Store session<br/>{sessionId, rootKey, chainKeys}
    Redis-->>Backend: Session stored
    Backend-->>Alice: Session established
    
    Alice->>Alice: Initialize Double Ratchet<br/>{rootKey, chainKeys}
    
    Note over Alice: Encrypt message
    
    Alice->>Alice: Encrypt with Double Ratchet<br/>{plaintext → ciphertext + nonce}
    
    Alice->>Backend: POST /messages<br/>{encryptedContent, encryptedKey}
    Backend->>PostgreSQL: Store encrypted message<br/>(server never sees plaintext)
    PostgreSQL-->>Backend: Message stored
    
    Backend->>Bob: Deliver via WebSocket<br/>{encryptedContent, encryptedKey}
    
    Bob->>Bob: Decrypt with Double Ratchet<br/>{ciphertext + nonce → plaintext}
    
    Note over Alice,Bob: Subsequent messages use<br/>Double Ratchet only<br/>(no X3DH needed)
```

### Database Schema Relationships

```mermaid
erDiagram
    USERS ||--o{ DEVICES : has
    USERS ||--o{ SESSIONS : has
    USERS ||--o{ FRIENDSHIPS : "requester/recipient"
    USERS ||--o{ BLOCKS : "blocker/blocked"
    USERS ||--o{ MESSAGES : "sender/recipient"
    USERS ||--o{ ENCRYPTION_KEYS : has
    
    DEVICES ||--o{ SESSIONS : has
    DEVICES ||--o{ ENCRYPTION_KEYS : has
    
    FRIENDSHIPS ||--o{ MESSAGES : enables
    
    MESSAGES ||--o{ MESSAGE_RECEIPTS : has
    MESSAGES ||--o{ MESSAGE_MEDIA : has
    MESSAGES ||--o{ MESSAGES : "replies to"
    
    USERS {
        uuid id PK
        varchar firebase_uid UK
        varchar username UK
        varchar email UK
        varchar name
        text profile_picture_url
        enum status
        timestamp last_seen
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    DEVICES {
        uuid id PK
        uuid user_id FK
        varchar device_name
        enum device_type
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        varchar refresh_token_hash
        timestamp expires_at
        boolean is_active
        timestamp created_at
    }
    
    FRIENDSHIPS {
        uuid id PK
        uuid requester_id FK
        uuid recipient_id FK
        enum status
        timestamp requested_at
        timestamp responded_at
    }
    
    MESSAGES {
        uuid id PK
        uuid sender_id FK
        uuid recipient_id FK
        text encrypted_content
        text encrypted_key
        enum message_type
        enum status
        timestamp sent_at
        timestamp delivered_at
        timestamp read_at
    }
    
    ENCRYPTION_KEYS {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        text identity_key_public
        text signed_prekey_public
        integer prekey_count
        boolean is_active
    }
```

### API Request/Response Flow

```mermaid
graph LR
    subgraph "Client"
        Request[API Request]
        Response[API Response]
    end
    
    subgraph "Middleware Layer"
        CORS[CORS Middleware]
        RateLimit[Rate Limiting]
        Auth[Auth Middleware]
        Validation[Validation Middleware]
        ErrorHandler[Error Handler]
    end
    
    subgraph "Route Handler"
        Controller[Route Controller]
    end
    
    subgraph "Service Layer"
        Service[Business Logic Service]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL)]
        Cache[(Redis)]
    end
    
    Request --> CORS
    CORS --> RateLimit
    RateLimit --> Auth
    Auth --> Validation
    Validation --> Controller
    Controller --> Service
    Service --> DB
    Service --> Cache
    DB --> Service
    Cache --> Service
    Service --> Controller
    Controller --> ErrorHandler
    ErrorHandler --> Response
    
    style Request fill:#4CAF50
    style Response fill:#2196F3
    style Auth fill:#FF9800
    style Service fill:#9C27B0
    style DB fill:#336791
    style Cache fill:#DC382D
```

### Token Refresh Flow

```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Redis
    participant PostgreSQL
    
    Client->>Backend: API Request<br/>Authorization: Bearer <expired-token>
    Backend->>Backend: Verify JWT token
    Backend-->>Client: 401 Unauthorized<br/>{code: "TOKEN_EXPIRED"}
    
    Client->>Backend: POST /auth/refresh<br/>{refreshToken}
    Backend->>Backend: Verify refresh token<br/>(JWT signature)
    
    Backend->>Redis: Get session<br/>{userId, deviceId}
    Redis-->>Backend: Session data
    
    alt Session valid
        Backend->>PostgreSQL: Verify device exists<br/>& user is active
        PostgreSQL-->>Backend: Device & user valid
        
        Backend->>Backend: Generate new token pair
        
        Backend->>Redis: Update session<br/>{newRefreshToken}
        Redis-->>Backend: Session updated
        
        Backend-->>Client: {newAccessToken, newRefreshToken}
        
        Client->>Client: Update stored tokens
        Client->>Backend: Retry original request<br/>with new access token
        Backend-->>Client: Original response
    else Session invalid
        Backend-->>Client: 401 Unauthorized<br/>{code: "SESSION_INVALID"}
        Client->>Client: Redirect to login
    end
```

### Message Delivery & Read Receipts

```mermaid
sequenceDiagram
    participant Sender
    participant Backend
    participant PostgreSQL
    participant WebSocket
    participant Recipient
    
    Note over Recipient: Message received<br/>(via WebSocket or polling)
    
    Recipient->>Backend: POST /messages/:id/delivered
    Backend->>PostgreSQL: Update message<br/>{deliveredAt, status: "delivered"}
    PostgreSQL-->>Backend: Updated
    
    Backend->>WebSocket: Emit to sender<br/>"message:delivered"
    WebSocket->>Sender: Delivery notification<br/>{messageId}
    Sender->>Sender: Update UI<br/>Show "delivered" status
    
    Note over Recipient: User opens message<br/>& reads content
    
    Recipient->>Backend: POST /messages/:id/read<br/>or POST /messages/read (bulk)
    Backend->>PostgreSQL: Update message(s)<br/>{readAt, status: "read"}
    PostgreSQL-->>Backend: Updated
    
    Backend->>PostgreSQL: Update unread count<br/>(decrement)
    PostgreSQL-->>Backend: Count updated
    
    Backend->>WebSocket: Emit to sender<br/>"message:read"
    WebSocket->>Sender: Read receipt<br/>{messageId}
    Sender->>Sender: Update UI<br/>Show "read" status
```

### Friendship Management Flow

```mermaid
sequenceDiagram
    participant UserA
    participant Backend
    participant PostgreSQL
    participant WebSocket
    participant UserB
    
    UserA->>Backend: POST /friends/request<br/>{userId: UserB}
    
    Backend->>PostgreSQL: Check if already friends<br/>or blocked
    PostgreSQL-->>Backend: Status check
    
    alt Already friends
        Backend-->>UserA: 409 Conflict<br/>{code: "ALREADY_FRIENDS"}
    else Blocked
        Backend-->>UserA: 403 Forbidden<br/>{code: "BLOCKED"}
    else Valid request
        Backend->>PostgreSQL: Create friendship<br/>{requesterId: UserA, status: "pending"}
        PostgreSQL-->>Backend: Friendship created
        
        Backend->>Redis: Check if UserB online
        Redis-->>Backend: Online status
        
        Backend-->>UserA: 201 Created<br/>{friendship}
        
        alt UserB online
            Backend->>WebSocket: Emit to UserB<br/>"friend:request:received"
            WebSocket->>UserB: Notification<br/>{friendship, requester}
            UserB->>UserB: Show notification<br/>"New friend request"
        end
    end
    
    Note over UserB: UserB sees request<br/>& decides to accept
    
    UserB->>Backend: POST /friends/:friendshipId/accept
    
    Backend->>PostgreSQL: Update friendship<br/>{status: "accepted", respondedAt}
    PostgreSQL-->>Backend: Updated
    
    Backend->>WebSocket: Emit to UserA<br/>"friend:request:accepted"
    WebSocket->>UserA: Notification<br/>{friendship}
    
    Backend-->>UserB: 200 OK<br/>{friendship}
    
    UserA->>UserA: Update UI<br/>Show UserB as friend
    UserB->>UserB: Update UI<br/>Show UserA as friend
```

### WebSocket Connection & Events

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    
    Disconnected --> Connecting: Client connects with access token
    
    Connecting --> Authenticating: Socket.io connection established
    
    Authenticating --> Authenticated: Token validated, User & device verified
    
    Authenticating --> Disconnected: Authentication failed (invalid token)
    
    Authenticated --> Connected: Join user room, Set online status
    
    Connected --> ReceivingEvents: Listen for events
    
    ReceivingEvents --> ReceivingEvents: message:received, typing:start/stop, user:online/offline, status:update
    
    Connected --> SendingEvents: Emit events
    
    SendingEvents --> SendingEvents: message:send, typing:start/stop, status:update, message:read
    
    ReceivingEvents --> Connected
    SendingEvents --> Connected
    
    Connected --> Disconnected: Client disconnects<br/>or error
    
    Disconnected --> [*]
```

### Real-Time Typing Indicators

```mermaid
sequenceDiagram
    participant UserA
    participant WebSocket
    participant Backend
    participant Redis
    participant UserB
    
    UserA->>UserA: User starts typing
    
    UserA->>WebSocket: Emit "typing:start"<br/>{recipientId: UserB}
    WebSocket->>Backend: Handle typing event
    
    Backend->>Redis: Store typing indicator<br/>{userId: UserA, recipientId: UserB, timestamp}
    Redis-->>Backend: Stored
    
    Backend->>Redis: Check if UserB online
    Redis-->>Backend: Online status
    
    alt UserB online
        Backend->>WebSocket: Emit to UserB<br/>"typing:start"
        WebSocket->>UserB: Real-time event<br/>{userId: UserA, name: "User A"}
        UserB->>UserB: Show typing indicator<br/>"User A is typing..."
    end
    
    Note over UserA: User stops typing<br/>(after 3 seconds timeout)
    
    UserA->>WebSocket: Emit "typing:stop"<br/>{recipientId: UserB}
    WebSocket->>Backend: Handle stop event
    
    Backend->>Redis: Remove typing indicator
    Redis-->>Backend: Removed
    
    Backend->>WebSocket: Emit to UserB<br/>"typing:stop"
    WebSocket->>UserB: Real-time event<br/>{userId: UserA}
    UserB->>UserB: Hide typing indicator
```

### Complete Message Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: User composes message
    
    Draft --> Encrypting: User sends message
    
    Encrypting --> Encrypted: Signal Protocol encryption (client-side)
    
    Encrypted --> Sending: POST /messages API call
    
    Sending --> Sent: Message stored in database
    
    Sent --> Delivering: Recipient device receives
    
    Delivering --> Delivered: Message delivered
    
    Delivered --> Reading: Recipient opens message
    
    Reading --> Read: Message read
    
    Read --> [*]: Message lifecycle complete
    
    Sent --> Editing: User edits message (within 15 minutes)
    Editing --> Sent: PUT /messages/:id
    
    Sent --> Deleting: User deletes message
    Deleting --> Deleted: DELETE /messages/:id, soft delete (deleted_at)
    Deleted --> [*]
    
    note right of Encrypting
        Client-side encryption
        Server never sees plaintext
    end note
    
    note right of Sent
        Real-time delivery
        via WebSocket if online
    end note
```

### Multi-Device Support

```mermaid
sequenceDiagram
    participant Device1
    participant Backend
    participant PostgreSQL
    participant Redis
    participant Device2
    
    Note over Device1: User signs in on Device 1
    
    Device1->>Backend: POST /auth/google-signin<br/>{deviceInfo: Device1}
    Backend->>PostgreSQL: Create device record<br/>{deviceId: D1, deviceType: "ios"}
    PostgreSQL-->>Backend: Device created
    Backend-->>Device1: {accessToken, device: D1}
    
    Note over Device2: User signs in on Device 2
    
    Device2->>Backend: POST /auth/google-signin<br/>{deviceInfo: Device2}
    Backend->>PostgreSQL: Create device record<br/>{deviceId: D2, deviceType: "android"}
    PostgreSQL-->>Backend: Device created
    Backend-->>Device2: {accessToken, device: D2}
    
    Note over Device1: User sends message from Device 1
    
    Device1->>Backend: POST /messages<br/>{recipientId, encryptedContent}
    Backend->>PostgreSQL: Store message
    Backend->>Redis: Check recipient online devices
    Redis-->>Backend: [Device3, Device4]
    
    Backend->>Backend: Broadcast to all recipient devices<br/>(via WebSocket)
    Backend->>Device2: Message notification<br/>(if Device2 is recipient)
    
    Note over Device2: User reads message on Device 2
    
    Device2->>Backend: POST /messages/:id/read
    Backend->>PostgreSQL: Update message status
    Backend->>Redis: Update unread count
    
    Backend->>Backend: Broadcast read receipt<br/>to all sender devices
    Backend->>Device1: Read receipt notification<br/>{messageId, readAt}
    
    Device1->>Device1: Update UI<br/>Show "read" status
```

### Performance Optimization

```mermaid
graph TB
    subgraph "Caching Strategy"
        RedisCache[Redis Cache<br/>User Profiles, Sessions]
        QueryCache[Query Result Cache<br/>Friends Lists, Conversations]
        SessionCache[Session Cache<br/>Active Sessions]
    end
    
    subgraph "Database Optimization"
        Indexes[Database Indexes<br/>User Lookups, Message Queries]
        ConnectionPool[Connection Pooling<br/>PostgreSQL Pool]
        QueryOptimization[Query Optimization<br/>Efficient Joins]
    end
    
    subgraph "API Optimization"
        Pagination[Pagination<br/>Limit/Offset]
        LazyLoading[Lazy Loading<br/>On-Demand Data]
        Compression[Response Compression<br/>Gzip]
    end
    
    subgraph "Real-Time Optimization"
        WebSocketPool[WebSocket Connection Pool<br/>Reuse Connections]
        EventBatching[Event Batching<br/>Group Updates]
        Debouncing[Debouncing<br/>Typing Indicators]
    end
    
    RedisCache --> Indexes
    QueryCache --> ConnectionPool
    SessionCache --> QueryOptimization
    Indexes --> Pagination
    ConnectionPool --> LazyLoading
    QueryOptimization --> Compression
    Pagination --> WebSocketPool
    LazyLoading --> EventBatching
    Compression --> Debouncing
    
    style RedisCache fill:#DC382D
    style Indexes fill:#336791
    style Pagination fill:#4CAF50
    style WebSocketPool fill:#010101
```

### Security Architecture

```mermaid
graph TB
    subgraph "Client Security"
        SecureStorage[Secure Token Storage<br/>Keychain/SecureStorage]
        ClientEncrypt[Client-Side Encryption<br/>Signal Protocol]
    end
    
    subgraph "Network Security"
        HTTPS[HTTPS/TLS<br/>Encrypted Transport]
        CFProtection[Cloudflare Protection<br/>DDoS, WAF, Rate Limiting]
    end
    
    subgraph "Application Security"
        JWTAuth[JWT Authentication<br/>Signed & Verified]
        RateLimit[Rate Limiting<br/>100 req/15min]
        CORS[CORS Policy<br/>Whitelisted Origins]
        Helmet[Security Headers<br/>Helmet.js]
        Validation[Input Validation<br/>Zod Schemas]
    end
    
    subgraph "Data Security"
        E2EEncrypt[End-to-End Encryption<br/>Signal Protocol]
        DBEncrypt[Database Encryption<br/>Encrypted Fields]
        SessionSecure[Secure Sessions<br/>Redis with TTL]
    end
    
    subgraph "Infrastructure Security"
        Firewall[Firewall Rules<br/>Port Restrictions]
        Secrets[Secret Management<br/>Environment Variables]
        Logging[Audit Logging<br/>Winston Logger]
    end
    
    SecureStorage --> HTTPS
    ClientEncrypt --> HTTPS
    HTTPS --> CFProtection
    CFProtection --> JWTAuth
    JWTAuth --> RateLimit
    RateLimit --> CORS
    CORS --> Helmet
    Helmet --> Validation
    Validation --> E2EEncrypt
    E2EEncrypt --> DBEncrypt
    DBEncrypt --> SessionSecure
    SessionSecure --> Firewall
    Firewall --> Secrets
    Secrets --> Logging
    
    style SecureStorage fill:#4CAF50
    style ClientEncrypt fill:#4CAF50
    style HTTPS fill:#2196F3
    style CFProtection fill:#F38020
    style JWTAuth fill:#FF9800
    style E2EEncrypt fill:#9C27B0
    style DBEncrypt fill:#336791
```

For more detailed architecture diagrams, see [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)

## 🔐 Security

- **Authentication**: Firebase OAuth + JWT tokens
- **Authorization**: Role-based access control
- **Encryption**: End-to-end encryption with Signal Protocol
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Configurable origin whitelist
- **Input Validation**: Zod schema validation
- **SQL Injection Prevention**: Parameterized queries
- **Security Headers**: Helmet.js

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📝 Development

### Code Quality
```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck
```

### Database Migrations
```bash
# Run migrations
npm run db:migrate

# Create new migration (manual)
# Create file in src/migrations/XXX_description.sql
```

## 📊 Monitoring

- **Logging**: Winston with daily rotation
- **Health Checks**: `/health` endpoint
- **Error Tracking**: Structured error logging

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new features
- Update documentation
- Follow the existing code style
- Add JSDoc comments for public APIs

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Signal Protocol for encryption algorithms
- Firebase for authentication
- Express.js community
- All contributors

## 👨‍💻 Author

**Yaduraj Singh**

- Email: yadurajsingham@gmail.com
- GitHub: [@yadurajsingh](https://github.com/yadurajsingh)
- Project: [PlasticWorld Backend](https://github.com/YaduEnc/PlasticWorld)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/plasticworld-backend/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/plasticworld-backend/discussions)

---

**Made with ❤️ for secure, real-time messaging**

**Developed and Designed by Yaduraj Singh**
