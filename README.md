# Oya Node

`node` is a Node.js–based full node for the Oya natural language protocol. It allows nodes to both propose new bundles (containing signed, natural language intentions) and in the near future will be able to verify and dispute bundles from other proposers. In addition, the API exposes endpoints for querying the protocol’s current state—including bundles, CIDs, balances, and vault nonces.

**WARNING: This software is early-stage and experimental and under active development. It should not be used in production. The underlying Oya Protocol has not been deployed to mainnet, and is itself experimental. The current node implementation supports bundle proposals and processing for a single bundle proposer only. Functionality to view and verify bundles from other proposers is not yet implemented. Users and developers should expect many breaking changes as the codebase evolves. Contributions and feedback are very welcome!**

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Bundle Proposing Workflow](#bundle-proposing-workflow)
- [Testing](#testing)
- [Deployment](#deployment)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)
  
## Features

- **Natural Language protocol Node:** Accepts signed intentions in natural language.
- **Proposer:** Caches incoming intentions and periodically bundles them into a bundle.
- **Protocol Contract Integration:** Interacts with the [BundleTracker](https://github.com/oyaprotocol/contracts?tab=readme-ov-file#blocktracker) smart contract via ethers.js.
- **IPFS Storage:** Uses Helia to upload bundle data to IPFS.
- **Robust API Endpoints:** Exposes endpoints for bundles, CIDs, balances, and nonces.
- **PostgreSQL Backend:** Uses PostgreSQL for persisting protocol state, including bundles, balances, and nonces.
- **Automated Balance & Reward Updates:** Processes transfers or swaps and mints rewards automatically.

## Architecture Overview

- **Express Server:** The main entry point (`index.ts`) sets up the Express server, JSON parsing, and routes.
- **Routing & Controllers:** API endpoints are defined in `routes.ts` and implemented in `controllers.ts`. These endpoints manage database operations for bundles, CIDs, balances, and vault nonces.
- **Proposer Logic:** Implemented in `proposer.ts`, this module:
  - Processes incoming intentions from the `/intention` endpoint.
  - Caches intentions and bundles them into a bundle every 10 seconds.
  - Signs the bundle, uploads it to IPFS via Helia, interacts with the BundleTracker contract, and updates the database accordingly.
- **Database:** PostgreSQL is used for persistent storage. Migration scripts (e.g., `migrations/1_createTable.sh`) set up the required tables.

## Prerequisites

- **Node.js:** Version supporting ES2020 (or later)
- **npm:** Package manager for installing dependencies
- **PostgreSQL Database:** Either local or hosted (e.g., via Heroku)
- **Alchemy API Key:** For interacting with Ethereum networks
- **BlockTracker Contract:** A deployed BlockTracker contract (its address must be provided)
- **IPFS (Helia):** Used internally to store block data
- **Docker:** Installed and configured for building and running containers

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/oyaprotocol/node.git
   cd node
   ```

2. **Install dependencies:**

  ```bash
  npm install
  ```

3. **Build the project (TypeScript → JavaScript):**

  ```bash
  npm run build
  ```

## Environment Variables

Create a `.env` file (or use your preferred configuration method) in the project root with the following variables:

```ini
# Bearer token for securing write endpoints
API_BEARER_TOKEN=your_secure_token_here
# PostgreSQL database connection string
DATABASE_URL=postgres://username:password@host:port/database

# Alchemy API Key for Ethereum network access
ALCHEMY_API_KEY=your_alchemy_api_key

# Deployed BundleTracker contract address
BUNDLE_TRACKER_ADDRESS=your_block_tracker_contract_address
(This will be 0xd4af8d53a8fccacd1dc8abe8ddf7dfbc4b81546c on Sepolia.)

# Private key used by the block proposer for signing blocks (ensure this is kept secure)
TEST_PRIVATE_KEY=your_private_key
```

(For testing purposes, you might also use a .env.test file.)

## Database Setup

The database schema is managed via SQL migration scripts. For example, the `migrations/1_createTable.sh` script drops (if needed) and creates the following tables:

- **bundles:** Stores bundle data and nonce.
- **cids:** Stores IPFS CIDs corresponding to blocks.
- **balances:** Tracks token balances per vault.
- **nonces:** Tracks the latest nonce for each vault.

If deploying to Heroku, run the migration script as follows:

```bash
chmod +x migrations/1_createTable.sh
./migrations/1_createTable.sh --app-name your-heroku-app-name
```

Alternatively, execute the SQL commands manually in your PostgreSQL instance.

## Running the Application

### Using Node Directly

After setting up your environment and database, you can start the server locally with:

```bash
npm run start
```

The server listens on the port specified in your `.env` file (default is `3000`).

### Using Docker Locally

A sample **multi-stage Dockerfile** is provided to build the application for production:

```
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

# Copy package files and install production dependencies only
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && ln -sf python3 /usr/bin/python
RUN npm install --production

# Copy the compiled output from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Expose the port and set environment variable
EXPOSE 3000
ENV NODE_ENV=production

CMD [ "node", "dist/index.js" ]
```

To build and run the container locally:

1. **Build the image:**

```
docker buildx build --platform linux/amd64 --no-cache -t node .
```

2. **Run the container:**

```
docker buildx build --platform linux/amd64 --no-cache -t node .
```

Your application will now be accessible on `http://localhost:3000`.

## API Endpoints

Below is a summary of the main API endpoints:

- **Bundles**
  - `GET /bundle` — Retrieve all bundles.
  - `GET /bundle/:nonce` — Retrieve a bundle by its nonce.
  - `POST /bundle` — Save a bundle (typically called internally after publishing).

- **CIDs**
  - `POST /cid` — Save a CID (internal use).
  - `GET /cid/:nonce` — Retrieve CIDs for a given nonce.

- **Balances**
  - `GET /balance/:vault` — Get balances for all tokens for a given vault.
  - `GET /balance/:vault/:token` — Get the balance for a specific token for a vault.
  - `POST /balance` — Update the balance for a token (insert if not already present).

- **Vault Nonces**
  - `GET /nonce/:vault` — Get the nonce for a given vault.
  - `POST /nonce/:vault` — Set/update the nonce for a vault.

- **Intentions**
  - `POST /intention` — Accepts a JSON payload with the following structure:

    ```json
    {
      "intention": { /* intention object */ },
      "signature": "signature_string",
      "from": "vault_address"
    }
    ```

    This endpoint passes the intention to the bundle proposer logic after verifying the signature.

## Bundle Proposing Workflow

1. **Receiving Intentions:**  
   When a client posts to `/intention`, the application verifies the signature (using ethers’ `verifyMessage`) and caches the intention.

2. **Creating a Bundle:**  
   Every 10 seconds, the application checks if there are cached intentions. If so, it:
   - Retrieves the latest nonce from the database.
   - Bundles all cached intentions into a bundle.
   - Signs the bundle using the bundle proposer’s private key.
   - Uploads the bundle data to IPFS via Helia.
   - Calls the `proposeBundle` function on the BundleTracker contract using ethers.js.
   - Persists the bundle and associated CID to the database.
   - Updates balances based on the transactions in the bundle.
   - Mints rewards to the relevant addresses.

3. **Error Handling:**  
   The bundle proposer logic includes error handling for signature verification, IPFS uploads, protocol transactions, and database operations.

## Testing

To run the test suite, use:

```bash
npm run test
```

Tests are written using Mocha, Chai, and ts-mocha, and are located in the `test` directory.

## Deployment

The application is fully containerized using Docker, which allows you to deploy it anywhere that supports Docker (e.g., Heroku, AWS, Google Cloud, or on your local server). Below are instructions for deploying the application on Heroku using Docker as an example.

### Deploying on Heroku (Example)

1. **Log in to the Heroku Container Registry:**

   ```bash
   heroku container:login
   ```

2. **Build and Push the Docker Image:**

Use Docker Buildx to build your image for the `linux/amd64` architecture, disable provenance attestation to ensure a single‑architecture manifest, and push the image directly to Heroku's registry:

```
docker buildx build --platform linux/amd64 --provenance=false --push -t registry.heroku.com/your-heroku-app/web:latest .
```

Alternatively, you can disable provenance by setting an environment variable before building:

```
export BUILDX_NO_DEFAULT_ATTESTATIONS=1
docker buildx build --platform linux/amd64 --push -t registry.heroku.com/your-heroku-app/web:latest .
```

3. **Release the Container on Heroku:***

```
heroku container:release web --app your-heroku-app
```

4. **Verify the Deployment:**

* Check Running Dynos:

```
heroku ps --app your-heroku-app
```

* View Logs:

```
heroku logs --tail --app your-heroku-app
```

### Other Deployment Options

Since the application is containerized, you can also deploy it to any hosting provider that supports Docker. For example:

* **Local Deployment with Docker Compose:** Create a docker-compose.yml file to bring up your application along with its dependencies (such as PostgreSQL).

* **Cloud Platforms (AWS, Google Cloud, DigitalOcean, etc.):** Use orchestration tools (e.g., Kubernetes or Docker Swarm) or managed container services (such as AWS Fargate or Google Cloud Run) to deploy your Docker image.

## Future Enhancements

Planned improvements for future releases include (but are not limited to):

- **Multi-Proposer Support:**  
  Extend the system to fetch, display, and verify blocks from multiple proposers by parsing onchain event logs. This will allow nodes to cross-check and validate proposals from different sources.

- **Enhanced Block Verification:**  
  Develop robust mechanisms for verifying the correctness of blocks proposed by various nodes, improving overall network security and consensus.

- **Expanded API Functionality:**  
  Add new API endpoints to query detailed block and proposer information.

- **Robust Error Handling and Logging:**  
  Improve error handling in the block proposer logic and enhance logging to facilitate debugging and monitoring.

- **Performance Optimization:**  
  Optimize the node for scalability and higher throughput as the network and transaction volumes grow.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request with your changes. When contributing, please ensure your code adheres to the project's style guidelines and passes all tests.
