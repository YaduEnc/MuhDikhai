# PlasticWorld Backend Deployment: Render

Render deploys from GitHub. The blueprint lives at [`render.yaml`](../render.yaml) in the
repo root and provisions everything in one shot.

## 0. Rotate secrets first

Anything ever committed to this repo should be regenerated before the backend is
publicly reachable:

- `FIREBASE_PRIVATE_KEY`
- `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` / `CASHFREE_WEBHOOK_SECRET`

`JWT_SECRET` does not need rotating by hand — the blueprint uses `generateValue: true`,
so Render mints a fresh random value.

## 1. What the blueprint creates

| Resource | Type | Plan | Why this plan |
| :--- | :--- | :--- | :--- |
| `muhdikhai-api` | Docker web service | `starter` | Free instances sleep, which drops every WebSocket. |
| `muhdikhai-kv` | Key Value (Valkey 8) | `starter` | Free has no persistence; queues would vanish on restart. |
| `muhdikhai-db` | PostgreSQL | `basic-256mb` | Smallest paid tier; free expires after 30 days. |

All three are pinned to `singapore`, the closest Render region to India.

## 2. Deploy

1. Push this branch to GitHub.
2. Render Dashboard → **New** → **Blueprint** → select the repo.
3. Render reads `render.yaml` and prompts for every `sync: false` secret:
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   - `CORS_ORIGIN`
   - `CASHFREE_*`
   - `BACKEND_PUBLIC_URL` — leave blank unless you have a custom domain
4. Apply. First build takes ~5–8 minutes.

### On `FIREBASE_PRIVATE_KEY`

The key contains literal `\n` escapes. Paste it into Render's dashboard field
**exactly as it appears in the service-account JSON**, including the
`-----BEGIN PRIVATE KEY-----` header and surrounding quotes.

### On `CORS_ORIGIN`

Comma-separated, no trailing slashes, and it must match your deployed frontend
origin exactly — for example `https://muhdikhai.vercel.app`. Get this wrong and
both CORS and the Socket.io handshake fail, which presents as the app hanging on
"connecting" with no obvious error.

## 3. Migrations

`preDeployCommand: npm run db:migrate:prod` runs after each build and before
traffic shifts, so schema changes apply automatically. The Dockerfile copies
`src/migrations` into the image for exactly this reason.

To run them by hand, open the service **Shell** tab:

```bash
npm run db:migrate:prod
```

## 4. Point the frontend at it

In your Vercel project, set:

```
NEXT_PUBLIC_BACKEND_URL=https://muhdikhai-api.onrender.com
```

Then redeploy the frontend. Add that same origin to `CORS_ORIGIN` on Render if
you have not already.

## 5. Verify

```bash
curl https://muhdikhai-api.onrender.com/health
```

A healthy response reports `"status": "ok"` with both `database` and `redis`
showing `connected`. Anything else returns 503 — check the service logs.

## Notes and limits

**Uploads need the disk.** `multer` writes to `public/uploads` and Express serves
it back, so the blueprint mounts a 5 GB disk at `/app/public/uploads`. Without
it, every redeploy wipes user media. Disks can be grown later but never shrunk.

**Stay at one instance for now.** The client uses
`transports: ['websocket', 'polling']`, and the polling handshake breaks across
instances without sticky sessions. The Redis adapter is already wired up, so
when you scale, either enable sticky sessions or drop `'polling'` from the
transports array in `RealtimeClientApp.js`.

**A disk pins you to one instance anyway.** Render does not share disks between
instances. Moving uploads to S3 or R2 is the prerequisite for horizontal scaling.

**`maxmemoryPolicy` is `noeviction` deliberately.** Under memory pressure the
Key Value store must reject writes rather than silently evict matchmaking queues
or partner locks, which would corrupt in-flight matches.

**Valkey vs Redis.** Render Key Value runs Valkey 8, a fork of Redis 7.2.4. The
`EVAL` Lua scripts and pub/sub the matchmaker depends on are unchanged.
