# Use an official Node.js runtime as a parent image.
FROM node:18-alpine

# Set the working directory.
WORKDIR /usr/src/app

# Copy package files and install dependencies.
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application.
COPY . .

# Build the application (if using TypeScript).
RUN npm run build

# Expose the port your app listens on.
EXPOSE 3000

# Set default environment variables (overridable by Heroku and docker-compose).
ENV NODE_ENV=production

# Start the application.
CMD [ "node", "dist/index.js" ]
