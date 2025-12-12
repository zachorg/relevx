FROM node:20-slim AS builder
WORKDIR /app

# Copy root workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy core package
COPY packages/core/package.json ./packages/core/
COPY packages/core/tsconfig.json ./packages/core/
COPY packages/core/src ./packages/core/src

# Copy backend app
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build backend
# We run build inside the apps/backend directory context if needed by scripts, 
# but pnpm -filter runs from root usually. 
# Using -filter from root is cleaner.
RUN pnpm --filter relevx build

FROM node:20-slim AS runtime
WORKDIR /app

RUN useradd --user-group --create-home --shell /bin/bash nodeuser

COPY package.json ./
# Install prod dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

# Copy core dist if needed (for runtime resolution if not bundled)
# Since we didn't build core explicitly, we assume backend build output is self-sufficient 
# OR it relies on what's in node_modules (which points to core).
# If core is main: ./dist/index.js, we should probably build core too or copy source if allowed.
# But let's stick to what compilation produced. 
# If type-only imports, we are fine.
# If value imports exist later, we might need core built.
# Let's verify if we need to build core. 
# "core" package.json has "main": "./dist/index.js".
# So meaningful imports will look for dist.
# So we SHOULD build core.
# Let's add core build step in builder.

# RUNtime ENV variables
ENV NODE_ENV=development
EXPOSE 8080
USER nodeuser
CMD ["node", "apps/backend/dist/index.js"]
