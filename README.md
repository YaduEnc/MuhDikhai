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

## 🏗 System Architecture

MushDikhai utilizes a hybrid architecture for speed and security.

```mermaid
graph TD
    UserA([User Client A])
    UserB([User Client B])
    
    subgraph Cloud [Cloud Infrastructure]
        LB[Nginx / Proxy]
        API[Express API Cluster]
        SIO[Socket.io Server]
        
        subgraph Data [Persistence]
            DB[(PostgreSQL)]
            RD[(Redis)]
            FB[Firebase Auth]
        end
    end

    UserA <--> LB
    UserB <--> LB
    LB <--> API
    LB <--> SIO
    API <--> DB
    SIO <--> RD
    UserA -. P2P Video .- UserB
```

---

## 🛠 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React (Vite), Vanilla CSS (Glassmorphism), Framer Motion |
| **Backend** | Node.js, TypeScript, Express |
| **Real-time** | Socket.io with Redis Adapter |
| **Database** | PostgreSQL v14+ |
| **P2P Video** | WebRTC (Signaling via Sockets) |
| **Auth** | Firebase Admin SDK |
| **Storage** | Multer (Ephemeral) + Local Persistent |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+
- **PostgreSQL**: Running instance
- **Redis**: Running instance
- **Firebase**: Project credentials

### Step 1: Clone & Install
```bash
git clone https://github.com/your-repo/muhdikhai.git
cd muhdikhai

# Install Backend
cd PlasticWorld && npm install

# Install Frontend
cd ../product-website && npm install
```

### Step 2: Environment Setup
Create a `.env` file in `PlasticWorld/`:
```env
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/muhdikhai
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_here
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

Create a `.env` file in `product-website/`:
```env
VITE_BACKEND_URL=http://localhost:3000
VITE_GIPHY_API_KEY=your_key
```

### Step 3: Run the Engine
```bash
# Terminal 1: Backend
cd PlasticWorld
npm run dev

# Terminal 2: Frontend
cd product-website
npm run dev
```

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
