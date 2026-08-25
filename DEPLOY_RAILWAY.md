# MuhDikhai on Railway — Full Deploy (No GitHub)

Deploys **backend + frontend + Postgres + Redis** into one Railway project,
pushing code straight from this laptop with the Railway CLI. GitHub is never
involved.

You will end up with one project containing four services:

| Service | What it is | Source |
| :--- | :--- | :--- |
| `postgres` | PostgreSQL 16 | Railway Database menu |
| `redis` | Redis | Railway Database menu |
| `backend` | Node + Socket.io API | `railway up` from `PlasticWorld/` |
| `frontend` | Next.js app | `railway up` from `web-next/` |

**Cost:** Hobby plan is $5/month and includes $5 of usage credit. Four services
of this size land around **$15–25/month** in practice.

---

## Step 0 — Rotate your secrets

Do this before anything is publicly reachable. These have been in the repo:

- `FIREBASE_PRIVATE_KEY` — Firebase Console → Project Settings → Service Accounts → **Generate new private key**
- `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` / `CASHFREE_WEBHOOK_SECRET` — Cashfree Dashboard → Developers → API Keys → rotate

You do not need to rotate `JWT_SECRET` by hand — Step 4 generates a fresh one.

---

## Step 1 — Install the CLI and log in

```bash
npm install -g @railway/cli
```

```bash
railway login
```

That opens a browser. Confirm you are signed in:

```bash
railway whoami
```

---

## Step 2 — Create the empty project

From the repo root:

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai && railway init --name muhdikhai
```

This is the **Empty Project** option from the menu in your screenshot — it makes
a project with no services yet.

Open it in the browser to watch things appear as you go:

```bash
railway open
```

---

## Step 3 — Add Postgres and Redis

In the Railway dashboard for the project:

1. Click **+ New** → **Database** → **Add PostgreSQL**
2. Click **+ New** → **Database** → **Add Redis**

Wait for both to show green. Railway names them `Postgres` and `Redis` — the
capitalisation matters in Step 4, so if yours differ, adjust accordingly.

---

## Step 4 — Create and configure the backend service

Link this directory to the project, then create the service from the CLI:

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/PlasticWorld && railway link
```

Pick the `muhdikhai` project and the `production` environment. When it asks
**"Select a service (optional)"**, press **Esc** — the service does not exist
yet, which is why only `Postgres` and `Redis` are listed.

Now create it and link to it:

```bash
railway add --service backend
```

```bash
railway link --service backend
```

### 4a. Set the environment variables

The `${{...}}` references are resolved by Railway at deploy time over the private
network — you are not copying any credentials by hand.

> **Use single quotes.** In zsh, `${{` inside double quotes is a parse error
> (`bad substitution`) even with a backslash. Single quotes pass the reference
> through to Railway untouched.

```bash
railway variables --set 'NODE_ENV=production' --set 'PORT=3000' --set 'API_VERSION=v1' --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --set 'REDIS_URL=${{Redis.REDIS_URL}}' --set 'DB_SSL=false' --set 'REDIS_KEY_PREFIX=plasticworld:' --set 'LOG_LEVEL=info'
```

Confirm the references resolved rather than being stored literally:

```bash
railway variables
```

`DATABASE_URL` should show a real `postgres://...` value. If it still reads
`${{Postgres.DATABASE_URL}}`, your database service is named something other
than `Postgres` — check the dashboard and re-set with the correct name.

Generate a strong JWT secret and set it:

```bash
railway variables --set "JWT_SECRET=$(openssl rand -hex 32)"
```

Then your own secrets. Replace the placeholders with the values you rotated in
Step 0:

```bash
railway variables \
  --set "FIREBASE_PROJECT_ID=suttafund" \
  --set "FIREBASE_CLIENT_EMAIL=PASTE_HERE" \
  --set "CASHFREE_ENV=production" \
  --set "CASHFREE_CLIENT_ID=PASTE_HERE" \
  --set "CASHFREE_CLIENT_SECRET=PASTE_HERE" \
  --set "CASHFREE_WEBHOOK_SECRET=PASTE_HERE"
```

**`FIREBASE_PRIVATE_KEY` must be set in the dashboard, not the CLI.** It is
multi-line and the shell will mangle it. Go to the `backend` service →
**Variables** → **New Variable**, name it `FIREBASE_PRIVATE_KEY`, and paste the
whole key from the service-account JSON including the
`-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines.

### 4b. Add the uploads volume

Uploaded media is written to disk by `multer` and served back by Express. Without
a volume, **every redeploy deletes all user uploads**.

In the dashboard: `backend` service → **Settings** → **Volumes** → **+ New Volume**

- Mount path: `/app/public/uploads`
- Size: 5 GB

Volumes cannot be configured from `railway.json` — this step is dashboard-only.

### 4c. Deploy

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/PlasticWorld && railway up -s backend
```

This uploads the folder (respecting `.gitignore`, so `node_modules` and `dist`
are skipped) and builds using the existing `Dockerfile`. First build takes
5–8 minutes.

> **`railway up` uploads the linked `projectPath`, not your current directory.**
> The CLI walks *up* parent directories to find a link in
> `~/.railway/config.json`, then uploads that entry's `projectPath`. So if the
> repo **root** is linked, running `railway up` from `PlasticWorld/` still
> uploads the whole monorepo — Railway finds no `Dockerfile` at that level and
> fails with *"Railpack could not determine how to build the app"*. `cd` alone
> does not fix it. Each deployable directory needs its own link entry:
>
> ```bash
> cd /Users/sujeetkumarsingh/Desktop/MuhDikhai && railway unlink
> ```
>
> ```bash
> cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/PlasticWorld && railway link -p muhdikhai -e production -s backend
> ```
>
> Verify with:
> ```bash
> python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.railway/config.json')))['projects'];[print(k,'->',v['projectPath']) for k,v in d.items() if 'MuhDikhai' in k]"
> ```

### 4d. Give it a public URL

Dashboard → `backend` → **Settings** → **Networking** → **Generate Domain**.
Set the port to **3000** when asked.

You get something like `backend-production-a1b2.up.railway.app`. **Write it down** —
Step 5 needs it.

### 4e. Database migrations

These run automatically. `PlasticWorld/railway.json` declares:

```json
"preDeployCommand": ["npm run db:migrate:prod"]
```

Railway executes that **inside the container** after each build and before
traffic shifts, so schema changes apply on every deploy.

> **Do not try to run migrations with `railway run`.** That command executes on
> your laptop with Railway's variables injected — but `DATABASE_URL` points at
> `postgres.railway.internal`, which only resolves inside Railway's private
> network. It fails with `getaddrinfo ENOTFOUND`. The private network is also
> IPv6-only, which is why `src/config/redis.ts` sets `family: 0`.

### 4f. Check it is alive

```bash
curl https://YOUR-BACKEND-DOMAIN.up.railway.app/health
```

You want `"status": "ok"` with `database` and `redis` both `connected`. Anything
else returns 503 — see Troubleshooting.

---

## Step 5 — Create and deploy the frontend

Create another empty service, name it `frontend`, then:

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/web-next && railway link
```

Pick `muhdikhai` → `frontend`.

### 5a. Set the frontend variables

`NEXT_PUBLIC_*` values are **baked into the JavaScript bundle at build time**, so
these must be set *before* you deploy.

> **Do not skip the TURN and Giphy values.** `web-next/.env.local` is gitignored,
> so `railway up` will not upload it. Anything you have working locally but do
> not re-declare here is silently missing in production — video calls would
> quietly fall back to STUN-only and GIF search would break. Open
> `web-next/.env.local` and copy those four values across.

Substitute your real backend domain, and paste the TURN/Giphy values from
`web-next/.env.local`:

```bash
railway variables \
  --set "NEXT_PUBLIC_BACKEND_URL=https://YOUR-BACKEND-DOMAIN.up.railway.app" \
  --set "NEXT_PUBLIC_SOCKET_URL=https://YOUR-BACKEND-DOMAIN.up.railway.app" \
  --set "NEXT_PUBLIC_CASHFREE_MODE=production" \
  --set "NODE_ENV=production" \
  --set "NEXT_PUBLIC_GIPHY_API_KEY=FROM_ENV_LOCAL" \
  --set "NEXT_PUBLIC_TURN_URL=FROM_ENV_LOCAL" \
  --set "NEXT_PUBLIC_TURN_USERNAME=FROM_ENV_LOCAL" \
  --set "NEXT_PUBLIC_TURN_PASSWORD=FROM_ENV_LOCAL"
```

Confirm nothing was missed before deploying:

```bash
railway variables | grep NEXT_PUBLIC
```

### 5b. Deploy

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/web-next && railway up -s frontend
```

Railway's builder auto-detects Next.js from `package.json` — no Dockerfile
needed. As with the backend, the `cd` matters: run this from the repo root and
the build fails before it starts.

### 5c. Give it a domain

Dashboard → `frontend` → **Settings** → **Networking** → **Generate Domain**, port **3000**.

Write this one down too.

---

## Step 6 — Close the loop on CORS

The backend still does not know the frontend exists. Point it back:

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/PlasticWorld && railway variables --set "CORS_ORIGIN=https://YOUR-FRONTEND-DOMAIN.up.railway.app"
```

Changing a variable triggers an automatic redeploy. Wait for it to go green.

No trailing slash, and the scheme must be `https://`. If this does not match the
frontend origin **exactly**, CORS and the Socket.io handshake both fail — which
shows up as the app hanging forever on "connecting" with nothing obvious in the
UI.

---

## Step 7 — Authorise the domain in Firebase

Google sign-in will be rejected until you do this.

Firebase Console → **Authentication** → **Settings** → **Authorized domains** →
**Add domain** → paste your frontend domain (hostname only, no `https://`).

---

## Step 8 — Verify end to end

1. Open your frontend domain.
2. Sign in with Google — if it fails, revisit Step 7.
3. Complete onboarding, then start a match.
4. Open the same URL in a second browser (or a phone on mobile data) and match
   the two against each other.

Watch backend logs live while you test:

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/PlasticWorld && railway logs
```

---

## Redeploying later

There is no git push step. Just re-run `railway up` from the folder you changed:

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/PlasticWorld && railway up -s backend
```

```bash
cd /Users/sujeetkumarsingh/Desktop/MuhDikhai/web-next && railway up -s frontend
```

Changing any `NEXT_PUBLIC_*` variable requires a **full `railway up` of the
frontend**, not just a restart — those values are compiled into the bundle.

---

## Troubleshooting

**`/health` returns 503 with `redis: disconnected`.**
Confirm `REDIS_URL` resolved: `railway variables | grep REDIS`. It should show a
`redis://...railway.internal:6379` value, not a literal `${{Redis.REDIS_URL}}`.
If literal, the service name is not `Redis` — check its real name and re-set.

**`/health` returns 503 with `database: disconnected`.**
Same check for `DATABASE_URL`. Also confirm `DB_SSL=false` — Railway's private
network is unencrypted-by-design and forcing TLS will fail the handshake.

**App loads but never connects.**
Almost always `CORS_ORIGIN` (Step 6). Open the browser console and look for a
CORS error naming the exact origin it wanted, then set that verbatim.

**Google sign-in popup closes instantly.** Step 7.

**Uploaded images 404 after a redeploy.** The volume in Step 4b is missing or
mounted at the wrong path. It must be exactly `/app/public/uploads`.

---

## Two things to know before real users arrive

**Carry your TURN credentials over, and watch their quota.** You already have a
TURN server configured in `web-next/.env.local`, and Step 5a copies it to
Railway — good, because without it WebRTC falls back to Google's public STUN
alone, which cannot traverse the CGNAT most Indian mobile carriers run. Calls
would signal successfully, report "connected", and then never deliver frames.
The code reads these at `useWebRTC.js:14` and degrades silently when they are
absent, so this failure mode produces no error anywhere. Once real traffic
arrives, keep an eye on your TURN plan's bandwidth allowance — relayed video is
billed per GB and video-first matching will consume far more than text chat did.

**Stay at one backend replica.** `numReplicas` is pinned to 1 in
`PlasticWorld/railway.json`. Two reasons: the Socket.io client uses
`transports: ['websocket', 'polling']` and the polling handshake breaks across
instances without sticky sessions, and Railway volumes cannot be shared between
replicas. Moving uploads to S3/R2 is the prerequisite for scaling out.
