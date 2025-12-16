# Base stage
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install build dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copy package files first
COPY package.json pnpm-lock.yaml* ./

# Production dependencies stage
FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Build stage
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Final stage
FROM node:20-alpine AS final

# Install runtime dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files and install production dependencies fresh
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Rebuild native modules for the target platform from source to ensure musl-compatible binaries
ENV npm_config_build_from_source=true
RUN pnpm rebuild bcrypt

# Copy built application
COPY --from=build /app/dist /app/dist

# Expose port (default 5000, but can be overridden by PORT env)
EXPOSE 5000

CMD [ "node", "dist/main.js" ]