# ==========================================
# Stage 1: Build
# ==========================================
FROM oven/bun:1.4.4-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun prepare
RUN bun node_modules/vite/bin/vite.js build

# Keep only production dependencies
RUN rm -rf node_modules \
    && bun install --production --frozen-lockfile

# ==========================================
# Stage 2: Production Runner
# ==========================================
FROM oven/bun:1.4.4-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Production dependencies
COPY --from=builder /app/node_modules ./node_modules

# Application metadata
COPY --from=builder /app/package.json ./

# Built output from adapter-node
COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["bun", "run", "./build/index.js"]