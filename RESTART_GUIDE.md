# MuhDikhai Local Restart Guide 🚀

Follow these steps to get your entire local environment up and running again.

## 1. Start the Backend Infrastructure (Docker)
First, make sure your PostgreSQL and Redis databases are running.

```bash
cd PlasticWorld
docker-compose up -d
```
*Wait for the containers to show as (healthy).*

## 2. Start the Backend Server
Open a **new terminal tab** to keep the server running.

```bash
cd PlasticWorld
npm run dev
```
*The API will be available at `http://localhost:3000`.*
npm
## 3. Start the Cloudflare Tunnel
This makes your local server accessible via `https://muhdikhai.yaduraj.me`. 
Open a **new terminal tab**.

```bash
# From the root directory
cloudflared tunnel run --url http://localhost:3000 muhdikhai-tunnel
```

## 4. Start the Frontend
Open a **new terminal tab**.

```bash
cd product-website
npm run dev
```
*The website will be available at `http://localhost:5173`.*

---

### Troubleshooting
- **Port Conflict**: If port 3000 is busy, run `lsof -i :3000` to find and kill the process.
- **Database Connection**: If the backend fails to connect, ensure Docker is running and the containers are "Up".
- **Tunnel issues**: Ensure you have `cloudflared` installed and authenticated if prompt.
