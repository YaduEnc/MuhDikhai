# <p align="center"> <img src="./documentation/header.png" alt="Muhdikhai Header" width="800"> </p>

<h1 align="center">MUHDIKHAI</h1>
<p align="center">
  <strong>Real People. Pure Chaos. Total Privacy.</strong><br>
  <i>A premium, Indian-Maximalist random chat experience built for the bold.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Security-E2EE-ff0055?style=for-the-badge" alt="Security E2EE">
  <img src="https://img.shields.io/badge/Tech-Node.js-green?style=for-the-badge" alt="Tech Node">
  <img src="https://img.shields.io/badge/Real--time-Socket.io-blue?style=for-the-badge" alt="Real-time Sockets">
  <img src="https://img.shields.io/badge/UI-Vibrant%20Chaos-orange?style=for-the-badge" alt="UI Chaos">
</p>

---

## 🎭 The Philosophy: "Gayi Bhains Paani Mein"
Muhdikhai (unveiling) is designed with the philosophy that once a conversation is over, it should be truly *gone*. No long-term logs for strangers, no snooping, just raw interaction. We combine the thrill of random encounters with the security of high-end encryption.

### 🌟 Core Highlights
- **💨 Ephemeral Random Chat:** Zero storage for stranger interactions. Shredded on room exit.
- **🔐 Friend Crypt:** End-to-End Encrypted (E2EE) messaging for your close circle.
- **✨ Vanish Mode:** Messages that self-destruct in 10 seconds.
- **🧿 Aura System:** Community-driven reputation (Vibe Checks) to isolate toxicity.
- **🎥 WebRTC Video:** Crystal clear P2P video calls without server-side recording.
- **🎨 Scratch Pad:** Collaborative doodle boards to let the chaos flow.

---

# <p align="center"> <img src="./documentation/header.png" alt="Muhdikhai Header" width="800"> </p>

<h1 align="center">MUHDIKHAI</h1>
<p align="center">
  <strong>Real People. Pure Chaos. Total Privacy.</strong><br>
  <i>A premium, Indian-Maximalist random chat experience built for the bold.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Security-E2EE-ff0055?style=for-the-badge" alt="Security E2EE">
  <img src="https://img.shields.io/badge/Tech-Node.js-green?style=for-the-badge" alt="Tech Node">
  <img src="https://img.shields.io/badge/Real--time-Socket.io-blue?style=for-the-badge" alt="Real-time Sockets">
  <img src="https://img.shields.io/badge/Status-Proprietary-red?style=for-the-badge" alt="Status Proprietary">
</p>

> [!IMPORTANT]
> **PROPRIETARY SOFTWARE:** This project is private property. It is NOT open-source. Unauthorized access, cloning, distribution, or reverse-engineering is strictly prohibited.

---

## 🎭 The Philosophy: "Gayi Bhains Paani Mein"
Muhdikhai (unveiling) is designed with the philosophy that once a conversation is over, it should be truly *gone*. No long-term logs for strangers, no snooping, just raw interaction. We combine the thrill of random encounters with the security of high-end encryption.

### 🌟 Core Highlights
- **💨 Ephemeral Random Chat:** Zero storage for stranger interactions. Shredded on room exit.
- **🔐 Friend Crypt:** End-to-End Encrypted (E2EE) messaging for your close circle.
- **✨ Vanish Mode:** Messages that self-destruct in 10 seconds.
- **🧿 Aura System:** Community-driven reputation (Vibe Checks) to isolate toxicity.
- **🎥 WebRTC Video:** Crystal clear P2P video calls without server-side recording.
- **🎨 Scratch Pad:** Collaborative doodle boards to let the chaos flow.

---

## 🏛 System Architecture Overview

The system is split into a high-performance Node.js backend (`PlasticWorld`) and a modern React frontend (`product-website`). Communication is handled via REST APIs for persistent data and Socket.io for all real-time interactions.

### High-Level Network Topology
```mermaid
graph TD
    UserA([User Client A])
    UserB([User Client B])
    
    subgraph Cloud [Cloud Infrastructure]
        LB[Nginx Reverse Proxy]
        API[Node.js / Express API Cluster]
        SIO[Socket.io Real-time Server]
        
        subgraph DataLayer [Persistence & Cache]
            DB[(PostgreSQL)]
            RD[(Redis Cluster)]
            FB[Firebase Auth Engine]
        end
    end

    UserA <--> LB
    UserB <--> LB
    LB <--> API
    LB <--> SIO
    API <--> DB
    API <--> FB
    SIO <--> DB
    SIO <--> RD
    UserA -. P2P Video/Audio .- UserB
```

---

## � User Lifecycle & State Machine

Every user session follows a strict state transition to ensure data integrity and a smooth onboarding experience.

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated: Open App
    Unauthenticated --> Authenticated: Firebase Auth Login
    Authenticated --> Onboarding: No Profile Found
    Onboarding --> Home: Profile Completed (Gender/Avatar)
    
    state Home {
        [*] --> Idle: Enter Home
        Idle --> Queued: Join Random Chat
        Queued --> Transitioning: Match Found
        Transitioning --> Chatting: Room Joined
        Chatting --> Idle: Leave Room
    }
    
    Home --> FriendChat: Open Friend Conversation
    FriendChat --> Home: Close Chat
    Home --> [*]: Logout/Disconnect
```

---

## 🚀 Key Modules & Functions

### 1. Robust Matching Intelligence
The matching system uses a "Mutual Satisfaction" handshake. It scans a global queue of waiting users and only connects them if **both** participants' gender preferences and topic interests align.

#### Matching Sequence & Race-Condition Protection
```mermaid
sequenceDiagram
    participant A as User A (Client)
    participant S as Socket Server (Memory)
    participant B as User B (Queued)
    participant DB as Postgres

    A->>S: random:join(topics, preference)
    Note over S: Scan Queue for Compatibility
    
    alt Match Found (w/ User B)
        S->>S: 1. Atomic Lock (Mark A & B Busy)
        S->>DB: 2. Fetch Public Profiles
        DB-->>S: Profiles Found
        
        alt Liveness Check Passed
            S->>S: 3. Create Ephemeral Room
            S-->>A: random:matched (Partner: B)
            S-->>B: random:matched (Partner: A)
            S->>DB: 4. Record Analytics
        else Partner Disconnected during DB Fetch
            S->>S: 5. Abort & Release Busy Lock
        end
    else No Match Found
        S->>S: 6. Add A to Queue
        S-->>A: random:waiting
    end
```

---

## � Database Schema (Entity Relationship)

The PostgreSQL schema is optimized for social connections and message history tracking.

```mermaid
erDiagram
    USERS ||--o{ FRIENDSHIPS : "has"
    USERS ||--o{ MESSAGES : "sends"
    USERS ||--o{ RANDOM_MATCHES : "participates"
    MESSAGES ||--o{ MESSAGE_RECEIPTS : "tracks"
    MESSAGES ||--o{ MESSAGE_MEDIA : "contains"
    MESSAGES ||--o{ MESSAGE_REACTIONS : "receives"

    USERS {
        uuid id PK
        string firebase_uid
        string name
        enum gender
        int age
        string profile_picture_url
        int rooms_entered
        boolean is_active
    }

    FRIENDSHIPS {
        uuid id PK
        uuid user_id_a FK
        uuid user_id_b FK
        enum status
        timestamp created_at
    }

    MESSAGES {
        uuid id PK
        uuid sender_id FK
        uuid recipient_id FK
        bytea encrypted_content
        bytea encrypted_key
        boolean is_vanish
        timestamp sent_at
    }
```

---

## 🔐 Security & Real-time Delivery

### End-to-End Encryption (E2EE) Pipeline
Messages between friends never exist in plain text on the server. MushDikhai utilizes a client-side encryption layer.

```mermaid
flowchart TD
    subgraph Sender [Client A]
        K[Get B's Public Key] --> PL[Plaintext Msg]
        PL --> ENC[Encrypt Content]
        ENC --> SIGN[Sign Message]
    end
    
    subgraph Relay [Socket.io Server]
        RB[Store Encrypted Blob] --> NOT[Notify Recipient]
    end
    
    subgraph Receiver [Client B]
        DEC[Decrypt with Private Key] --> PL2[Plaintext Msg]
        PL2 --> DISP[Display to User]
    end

    Sender -- "Secure Socket (TLS)" --> Relay
    Relay -- "Secure Socket (TLS)" --> Receiver
```

### WebRTC Signaling (P2P Connectivity)
For direct calling, the socket server acts as a signaling broker to establish the P2P connection.

```mermaid
sequenceDiagram
    participant A as Caller
    participant S as Socket Broker
    participant B as Callee

    A->>S: webrtc:call-request
    S-->>B: webrtc:call-request (Incoming!)
    B->>S: webrtc:call-response (Accept)
    S-->>A: webrtc:call-response (Accepted)
    
    Note over A,B: SDP Handshake (Signaling)
    A->>S: webrtc:signal (Offer/ICE)
    S-->>B: webrtc:signal (Offer/ICE)
    B->>S: webrtc:signal (Answer/ICE)
    S-->>A: webrtc:signal (Answer/ICE)
    
    Note over A,B: P2P Tunnel Established
    A->>B: Media Stream (Video/Audio)
```

### File Upload & Media Handling
MushDikhai handles media uploads through a secure multi-stage process, distinguishing between ephemeral random chat media and persistent friend chat media.

```mermaid
graph LR
    User[User Client] --> Check{Type of Chat?}
    Check -->|Random| Ephemeral[Multer Upload to /tmp]
    Check -->|Friend| Persistent[S3/Local Persistent Storage]
    
    Ephemeral --> Match[Shared via Socket]
    Persistent --> DBRecord[Save to message_media Table]
    
    subgraph Cleanup [Cleanup Service]
        Match --> Expire[Delete on Room Close]
    end
```

---

## 📱 Frontend Ecosystem Structure

The frontend is a visual-first React application focusing on "Rich Aesthetics" and "Dynamic Transitions."

```mermaid
graph LR
    subgraph AppContainer [App.jsx]
        H[Home.jsx]
        C[Chat.jsx]
        F[FriendChat.jsx]
        O[Onboarding.jsx]
    end

    subgraph Hooks [Custom Logic]
        W[useWebRTC]
        SC[useSocket]
        AF[useAuth]
    end

    O --> H
    H --> C
    H --> F
    SC <--> H
    SC <--> C
    SC <--> F
    W <--> F
    W <--> C
```

---

## 📂 Project Directory Map

```bash
├── PlasticWorld/              # Backend Services (Node/TS)
│   ├── src/
│   │   ├── config/           # Database, Socket, Redis, Firebase
│   │   ├── migrations/       # SQL Schema (001-018)
│   │   ├── routes/           # REST Endpoints (Auth, User, Friend)
│   │   ├── services/         # Logic (E2EE, Matching, Sessions)
│   │   └── utils/            # Shared Logging & Error Handling
├── product-website/           # Frontend Application (React)
│   ├── src/
│   │   ├── components/       # UI (Reactions, Bubbles, Profiles)
│   │   ├── hooks/            # Signaling & Real-time listeners
│   │   └── assets/           # Premium Theme CSS & Icons
└── README.md                  # System Documentation
```

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, Vanilla CSS (Glassmorphism) |
| **Backend** | Node.js, TypeScript, Express |
| **Real-time** | Socket.io (WebSockets) |
| **Database** | PostgreSQL v14+ |
| **Auth** | Firebase Admin SDK |
| **P2P Video/Audio** | WebRTC (Signaling) |
| **Encryption** | Crypto-JS / Web Crypto API |

---

## 🧿 Reputation & Safety (Aura)
We don't believe in simple "bans." We believe in the **Aura**.
Users can vote on your vibe at the end of every chat:
- **Positive Vibes:** Boosts Aura, matches you with other "Pure Vibes" users.
- **Toxic Vibes:** Drops Aura, adds visual badges to your profile, and eventually restricts matchmaking.

---

## ⚖️ Legal & Privacy
Our code is designed to respect the **Right to be Forgotten**.
- **STRANGER CHATS:** Content is held in server RAM only. Never written to disk.
- **FRIEND CHATS:** Encrypted at the edge. The server stores only ciphertext.
- **REPORTS:** Handled manually through the Admin Terminal for human-first moderation.

---

## 📜 Copyright & Licensing

**Designed & Developed by [Yaduraj Singh](https://yaduraj.me)**

Copyright © 2026 **MUHDIKHAI**. All rights reserved.

The software and its associated documentation files are proprietary. Unauthorized copying, distribution, or modification of any part of this project via any medium is strictly prohibited. For licensing inquiries, please contact the author.

---

<p align="center">
  <i>Stay Safe. Stay Loud. Stay Pure.</i><br>
  Built with ❤️ in India.
</p>
