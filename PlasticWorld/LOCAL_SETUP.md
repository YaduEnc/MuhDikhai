# Local Development Setup Guide

This guide will help you run the PlasticWorld backend locally on your Mac.

## Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js >= 18.0.0
- ✅ npm >= 9.0.0
- ✅ Docker & Docker Compose (for PostgreSQL and Redis)

## Step-by-Step Setup

### 1. Check Prerequisites

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check npm version
npm --version   # Should be >= 9.0.0

# Check Docker
docker --version
docker-compose --version
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install
```

### 3. Set Up Environment Variables

You should already have a `.env` file. If not, copy from example:

```bash
cp .env.example .env
```

**Required Environment Variables:**
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name (default: plasticworld_db)
- `DB_USER` - PostgreSQL user (default: postgres)
- `DB_PASSWORD` - PostgreSQL password (default: postgres)
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- `FIREBASE_PRIVATE_KEY` - Firebase private key
- `FIREBASE_CLIENT_EMAIL` - Firebase client email
- `JWT_SECRET` - Secret for JWT tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens

### 4. Start PostgreSQL and Redis with Docker

```bash
# Start PostgreSQL and Redis containers
docker-compose up -d

# Check if containers are running
docker-compose ps

# View logs (optional)
docker-compose logs -f
```

**Expected Output:**
```
✅ plasticworld-postgres  Up (healthy)
✅ plasticworld-redis    Up (healthy)
```

### 5. Run Database Migrations

```bash
# Run migrations to create tables
npm run db:migrate
```

This will create all necessary database tables.

### 6. Build TypeScript

```bash
# Compile TypeScript to JavaScript
npm run build
```

### 7. Start the Backend Server

**Development Mode (with hot reload):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

### 8. Verify Everything is Running

Open a new terminal and check:

```bash
# Check server health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","database":"connected","redis":"connected","timestamp":"..."}
```

## Quick Start Script

You can also use this one-liner to start everything:

```bash
# Start databases, run migrations, and start server
docker-compose up -d && npm run db:migrate && npm run build && npm run dev
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process or change PORT in .env
```

### Docker Containers Not Starting

```bash
# Check Docker status
docker ps -a

# Restart containers
docker-compose restart

# If issues persist, remove and recreate
docker-compose down -v
docker-compose up -d
```

### Database Connection Errors

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection manually
docker exec -it plasticworld-postgres psql -U postgres -d plasticworld_db
```

### Redis Connection Errors

```bash
# Check if Redis is running
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Test Redis connection
docker exec -it plasticworld-redis redis-cli ping
```

### Firebase Errors

Ensure your `.env` file has correct Firebase credentials:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY` (with `\n` replaced as actual newlines)
- `FIREBASE_CLIENT_EMAIL`

### TypeScript Build Errors

```bash
# Clean and rebuild
rm -rf dist
npm run build
```

## Stopping Services

```bash
# Stop the backend server
# Press Ctrl+C in the terminal running npm run dev

# Stop Docker containers
docker-compose down

# Stop and remove all data (clean slate)
docker-compose down -v
```

## Development Workflow

1. **Start databases**: `docker-compose up -d`
2. **Run migrations**: `npm run db:migrate` (only needed once or after schema changes)
3. **Start dev server**: `npm run dev` (auto-reloads on file changes)
4. **Make changes**: Edit files in `src/`
5. **Test**: API available at `http://localhost:3000`

## API Endpoints

Once running, your API will be available at:
- **Base URL**: `http://localhost:3000/api/v1`
- **WebSocket**: `ws://localhost:3000`
- **Health Check**: `http://localhost:3000/health`

## Next Steps

- Read [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for API details
- Check [TESTING_GUIDE.md](./TESTING_GUIDE.md) for testing instructions
- Review [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) for architecture details

---

**Happy Coding! 🚀**
