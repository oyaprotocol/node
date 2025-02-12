# Stage 1: Build Stage
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package files and install all dependencies (including devDependencies)
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && ln -sf python3 /usr/bin/python
RUN npm install   # Install both production and devDependencies

# Copy source code and build the application
COPY . .
RUN npm run build

# Stage 2: Production Stage
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy only production package files
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && ln -sf python3 /usr/bin/python
RUN npm install --production

# Copy the compiled output from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Expose the port and set environment variable
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
