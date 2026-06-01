# PlasticWorld Backend Deployment: Linux + Docker + Nginx + Cloudflare

This guide assumes:

- Ubuntu 22.04 or 24.04 VPS
- Docker-based deployment
- Backend domain like `api.example.com`
- Cloudflare manages DNS for your domain

## 0. Critical security note

Before public deployment, rotate any real secrets that were ever committed to the repository.

At minimum rotate:

- `FIREBASE_PRIVATE_KEY`
- `JWT_SECRET`
- `CASHFREE_CLIENT_ID`
- `CASHFREE_CLIENT_SECRET`
- `CASHFREE_WEBHOOK_SECRET`

Do not upload the tracked `.env.production` file to the server if it contains live credentials. Create a new untracked file named `.env.production.local` on the server.

## 1. Open the server

Use a small VPS to start:

- 2 vCPU
- 4 GB RAM
- 60+ GB SSD
- Ubuntu 22.04 LTS

Open firewall ports:

- `22` for SSH
- `80` for HTTP
- `443` for HTTPS

Do not expose PostgreSQL or Redis publicly.

## 2. Install base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw nginx
```

Enable firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 3. Install Docker and Compose plugin

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 4. Upload the backend code

```bash
cd /opt
sudo mkdir -p /opt/muhdikhai
sudo chown -R $USER:$USER /opt/muhdikhai
cd /opt/muhdikhai
git clone <your-repo-url> .
cd PlasticWorld
```

## 5. Create the production env file

Create:

```bash
nano .env.production.local
```

Start from `.env.example` and fill production values.

Minimum required:

- `PORT=3000`
- `NODE_ENV=production`
- `API_VERSION=v1`
- `DB_HOST=postgres`
- `DB_PORT=5432`
- `DB_NAME=plasticworld_db`
- `DB_USER=postgres`
- `DB_PASSWORD=<strong-password>`
- `DB_SSL=false`
- `REDIS_HOST=redis`
- `REDIS_PORT=6379`
- `REDIS_PASSWORD=<strong-password-or-empty>`
- `REDIS_DB=0`
- `REDIS_KEY_PREFIX=plasticworld:`
- `FIREBASE_PROJECT_ID=<firebase-project-id>`
- `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
- `FIREBASE_CLIENT_EMAIL=<service-account-email>`
- `JWT_SECRET=<64-byte-random-secret>`
- `JWT_ACCESS_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=7d`
- `JWT_ISSUER=plasticworld-api`
- `CORS_ORIGIN=https://your-frontend-domain.com,https://www.your-frontend-domain.com`
- `APP_BASE_URL=https://api.example.com`
- `BACKEND_PUBLIC_URL=https://api.example.com`
- `PUBLIC_API_ORIGIN=https://api.example.com`
- `PUBLIC_BASE_URL=https://api.example.com`

Generate a JWT secret:

```bash
openssl rand -base64 64
```

## 6. Build and start containers

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

## 7. Run database migrations

Because the production image now includes SQL migration files, you can run:

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:migrate:prod
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

## 8. Configure Nginx reverse proxy

Copy the example config:

```bash
sudo cp deploy/nginx/plasticworld-api.conf.example /etc/nginx/sites-available/plasticworld-api
```

Edit:

```bash
sudo nano /etc/nginx/sites-available/plasticworld-api
```

Replace:

- `api.example.com` with your real backend domain

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/plasticworld-api /etc/nginx/sites-enabled/plasticworld-api
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Point Cloudflare DNS

In Cloudflare DNS:

- Create `A` record
- Name: `api`
- Value: `<your-server-ip>`
- Proxy status: `Proxied`

Recommended Cloudflare SSL/TLS:

- Mode: `Full (strict)` if you install a valid origin cert
- If you are not ready for origin TLS yet, temporarily use `Full`, then move to `Full (strict)`

For Socket.io / WebRTC signaling:

- Cloudflare proxy works fine for WebSockets
- Keep WebSockets enabled in Cloudflare

## 10. Add HTTPS on the origin

Best option:

- Cloudflare Origin Certificate on Nginx, or
- Let’s Encrypt on the origin

If using Let’s Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

Then verify:

```bash
curl https://api.example.com/health
```

## 11. Update frontend env

Your frontend should point to:

- `NEXT_PUBLIC_BACKEND_URL=https://api.example.com`
- `NEXT_PUBLIC_SOCKET_URL=https://api.example.com`

If your frontend is on another domain, make sure that domain is included in backend `CORS_ORIGIN`.

## 12. Operational commands

Rebuild after code changes:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Run migrations after schema changes:

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:migrate:prod
```

View logs:

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml logs -f redis
```

Restart app only:

```bash
docker compose -f docker-compose.prod.yml restart app
```

## 13. Production checklist

- `health` endpoint returns `200`
- frontend can call REST API over HTTPS
- Socket.io connects over HTTPS/WSS
- Google sign-in works with production domain
- uploads persist after container restart
- PostgreSQL and Redis are not exposed publicly
- secrets are rotated and not committed
- Cloudflare DNS is proxied

## 14. Recommended next hardening

- Move PostgreSQL backups to object storage
- Add fail2ban for SSH
- Add Cloudflare WAF/rate limit rules for `/api`
- Add log rotation monitoring
- Add a second staging server before production rollout
