# Multi-stage build for production
# Node 24: geoip-lite@2.0.0 declares engines >=24.0.0 and throws on import
# under older runtimes. Node 18 also reached end-of-life in April 2025.
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist
# Copy SQL migrations so db:migrate:prod works inside the production image
COPY --chown=nodejs:nodejs src/migrations ./src/migrations

# Create logs and upload directories.
# public/ is not copied into the image, but several modules create or write
# subdirectories of public/uploads at import time. They must exist AND be owned
# by the non-root runtime user, or the require throws EACCES and the whole API
# fails to boot. This is also the mount point for the uploads volume.
RUN mkdir -p logs public/uploads/bug_screenshots && \
    chown -R nodejs:nodejs logs public

# Switch to nodejs user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]
