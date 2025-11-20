# Multi-stage build for smaller final image

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace and package files
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy core package
COPY packages/core/package.json ./packages/core/
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/core/src ./packages/core/src

# Copy scheduler package
COPY services/scheduler/package.json ./services/scheduler/
COPY services/scheduler/tsconfig.json ./services/scheduler/
COPY services/scheduler/src ./services/scheduler/src

# Install dependencies for both packages
RUN pnpm install --frozen-lockfile

# Build TypeScript (from scheduler directory)
WORKDIR /app/services/scheduler
RUN pnpm run build

# Stage 2: Production stage
FROM node:20-alpine

# Install pnpm and dumb-init
RUN npm install -g pnpm && \
    apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Copy workspace and package files
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy core package (only package.json for dependency resolution)
COPY packages/core/package.json ./packages/core/

# Copy scheduler package files
COPY services/scheduler/package.json ./services/scheduler/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Copy built JavaScript from builder stage
COPY --from=builder /app/services/scheduler/dist ./services/scheduler/dist
COPY --from=builder /app/packages/core/src ./packages/core/src

# Set working directory to scheduler
WORKDIR /app/services/scheduler

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app /app/services/scheduler /app/packages/core

# Switch to non-root user
USER nodejs

# Expose port for health checks (if needed)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Health check (optional - pings the process to ensure it's alive)
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the scheduler
CMD ["node", "dist/index.js"]

