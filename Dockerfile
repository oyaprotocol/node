# Use an official Node.js runtime as a parent image.
FROM --platform=linux/amd64 node:18-alpine

# Set the working directory.
WORKDIR /usr/src/app

# Copy package files.
COPY package*.json ./

# Install build dependencies required for native modules.
RUN apk add --no-cache python3 make g++ && ln -sf python3 /usr/bin/python

# Install production dependencies.
RUN npm install --production

# Copy the rest of the application.
COPY . .

# Build the application (assuming you're using TypeScript).
RUN npm run build

# Expose the port that the app listens on.
EXPOSE 3000

# Set environment variables.
ENV NODE_ENV=production

# Start the application.
CMD [ "node", "dist/index.js" ]
