# Bun-optimized Dockerfile for Oya Protocol Node
# Runs TypeScript directly without compilation for faster startup

FROM oven/bun:1-alpine

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package.json bun.lockb* ./

# Download prebuilt native module for Alpine (avoids needing npm/build tools)
# We manually download and extract the prebuilt native module of @ipshipyard/node-datachannel
# We do this because it would normally be compiled but takes too long to build on Alpine
RUN bun install --production && \
    wget -q https://github.com/ipshipyard/js-node-datachannel/releases/download/v0.26.6/node-datachannel-v0.26.6-napi-v8-linuxmusl-x64.tar.gz && \
    tar -xzf node-datachannel-v0.26.6-napi-v8-linuxmusl-x64.tar.gz -C node_modules/@ipshipyard/node-datachannel && \
    rm node-datachannel-v0.26.6-napi-v8-linuxmusl-x64.tar.gz

# Copy source code and CLI binary (no build step needed - Bun runs TS directly)
COPY src ./src
COPY bin ./bin

# Link CLI globally
RUN bun link

# Expose the port
EXPOSE 3000
ENV NODE_ENV=production

# Run TypeScript directly with Bun
CMD ["bun", "run", "src/index.ts"]
