# Bun-optimized Dockerfile for Oya Protocol Node
# Runs TypeScript directly without compilation for faster startup

FROM oven/bun:1-alpine

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package.json bun.lockb* ./
RUN bun install --production

# Copy source code (no build step needed - Bun runs TS directly)
COPY src ./src

# Expose the port
EXPOSE 3000
ENV NODE_ENV=production

# Run TypeScript directly with Bun
CMD ["bun", "run", "src/index.ts"]
