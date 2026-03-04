# PlasticWorld Backend - Architecture & API Design Diagrams

This document contains detailed Mermaid diagrams for visualizing the PlasticWorld backend architecture, API design, data flow, and system components.

## 📖 How to View These Diagrams

**Important:** Each diagram below is a separate Mermaid code block. To view them:

1. **GitHub/GitLab:** Diagrams render automatically when viewing this file on GitHub
2. **VS Code:** Install the "Markdown Preview Mermaid Support" extension
3. **Mermaid Live Editor:** Copy each diagram's code block (between ` ```mermaid ` and ` ``` `) and paste into https://mermaid.live
4. **Other Markdown Viewers:** Ensure your viewer supports Mermaid diagrams

**⚠️ Do NOT copy the entire file** - each diagram must be viewed separately!

---

## 📐 System Architecture Overview

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

---

## 🔄 Authentication Flow

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

---

## 🔄 Token Refresh Flow

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

---

## 💬 Message Sending Flow

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

---

## 📨 Message Delivery & Read Receipts

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

---

## 🔐 End-to-End Encryption Flow (Signal Protocol)

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

---

## 👥 Friendship Management Flow

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

---

## 🔌 WebSocket Connection & Events

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    
    Disconnected --> Connecting: Client connects<br/>with access token
    
    Connecting --> Authenticating: Socket.io connection<br/>established
    
    Authenticating --> Authenticated: Token validated<br/>User & device verified
    
    Authenticating --> Disconnected: Authentication failed<br/>(invalid token)
    
    Authenticated --> Connected: Join user room<br/>Set online status
    
    Connected --> ReceivingEvents: Listen for events
    
    ReceivingEvents --> ReceivingEvents: message:received<br/>typing:start/stop<br/>user:online/offline<br/>status:update
    
    Connected --> SendingEvents: Emit events
    
    SendingEvents --> SendingEvents: message:send<br/>typing:start/stop<br/>status:update<br/>message:read
    
    ReceivingEvents --> Connected
    SendingEvents --> Connected
    
    Connected --> Disconnected: Client disconnects<br/>or error
    
    Disconnected --> [*]
```

---

## 🗄️ Database Schema Relationships

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
        varchar phone_number UK
        varchar name
        integer age
        text profile_picture_url
        varchar bio
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
        varchar device_token
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
    
    BLOCKS {
        uuid id PK
        uuid blocker_id FK
        uuid blocked_id FK
        text reason
        timestamp created_at
    }
    
    MESSAGES {
        uuid id PK
        uuid sender_id FK
        uuid recipient_id FK
        text encrypted_content
        text encrypted_key
        enum message_type
        text media_url
        bigint media_size_bytes
        enum status
        uuid reply_to_message_id FK
        boolean is_edited
        timestamp edited_at
        timestamp deleted_at
        timestamp sent_at
        timestamp delivered_at
        timestamp read_at
    }
    
    MESSAGE_RECEIPTS {
        uuid id PK
        uuid message_id FK
        uuid recipient_id FK
        enum receipt_type
        timestamp received_at
    }
    
    MESSAGE_MEDIA {
        uuid id PK
        uuid message_id FK
        text media_url
        bigint file_size_bytes
        varchar mime_type
        timestamp created_at
    }
    
    ENCRYPTION_KEYS {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        text identity_key_public
        text signed_prekey_public
        text signed_prekey_signature
        integer prekey_count
        timestamp key_created_at
        timestamp key_expires_at
        boolean is_active
    }
```

---

## 🔄 Real-Time Typing Indicators

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

---

## 📊 API Request/Response Flow

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

---

## 🚀 Deployment Architecture

```mermaid
graph TB
    subgraph "Internet"
        Users[End Users]
    end
    
    subgraph "Cloudflare"
        DNS[DNS<br/>plasticworld.yaduraj.me]
        Tunnel[Cloudflare Tunnel<br/>Secure Proxy]
    end
    
    subgraph "Server"
        subgraph "PM2 Process Manager"
            API1[API Instance 1<br/>Port 3000]
            API2[API Instance 2<br/>Port 3001]
            WS[WebSocket Server<br/>Port 3000]
        end
        
        subgraph "Docker Containers"
            PG[(PostgreSQL<br/>Port 5432)]
            Redis[(Redis<br/>Port 6379)]
        end
        
        Logs[Log Files<br/>/app/logs]
    end
    
    Users --> DNS
    DNS --> Tunnel
    Tunnel --> API1
    Tunnel --> API2
    Tunnel --> WS
    
    API1 --> PG
    API1 --> Redis
    API2 --> PG
    API2 --> Redis
    WS --> Redis
    WS --> PG
    
    API1 --> Logs
    API2 --> Logs
    WS --> Logs
    
    style Users fill:#4CAF50
    style DNS fill:#F38020
    style Tunnel fill:#F38020
    style API1 fill:#339933
    style API2 fill:#339933
    style WS fill:#010101
    style PG fill:#336791
    style Redis fill:#DC382D
```

---

## 🔐 Security Architecture

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

---

## 📈 Performance Optimization

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

---

## 🔄 Complete Message Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: User composes message
    
    Draft --> Encrypting: User sends message
    
    Encrypting --> Encrypted: Signal Protocol encryption<br/>(client-side)
    
    Encrypted --> Sending: POST /messages API call
    
    Sending --> Sent: Message stored in database<br/>status: "sent"
    
    Sent --> Delivering: Recipient device receives<br/>(WebSocket or polling)
    
    Delivering --> Delivered: POST /messages/:id/delivered<br/>status: "delivered"
    
    Delivered --> Reading: Recipient opens message
    
    Reading --> Read: POST /messages/:id/read<br/>status: "read"
    
    Read --> [*]: Message lifecycle complete
    
    Sent --> Editing: User edits message<br/>(within 15 minutes)
    Editing --> Sent: PUT /messages/:id
    
    Sent --> Deleting: User deletes message
    Deleting --> Deleted: DELETE /messages/:id<br/>soft delete (deleted_at)
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

---

## 📱 Multi-Device Support

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

---

**Last Updated:** January 9, 2026  
**Diagram Format:** Mermaid  
**View Instructions:** Use Mermaid-compatible viewers (GitHub, VS Code with Mermaid extension, Mermaid Live Editor)
