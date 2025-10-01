# Oya Node

`node` is a Bun-based full node for the Oya natural language protocol. It allows nodes to both propose new bundles (containing signed, natural language intentions) and in the near future will be able to verify and dispute bundles from other proposers. In addition, the API exposes endpoints for querying the protocol's current state—including bundles, CIDs, balances, and vault nonces.

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
- **Protocol Contract Integration:** Interacts with the [BundleTracker](https://github.com/oyaprotocol/contracts?tab=readme-ov-file#bundletracker) smart contract via ethers.js.
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

- **Bun:** Version 1.0 or later ([install from bun.sh](https://bun.sh))
- **PostgreSQL Database:** Either local or hosted (e.g., via Heroku)
- **Alchemy API Key:** For interacting with Ethereum networks
- **BundleTracker Contract:** A deployed BundleTracker contract (its address must be provided)
- **IPFS (Helia):** Used internally to store bundle data
- **Docker:** (Optional) For containerized deployment

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/oyaprotocol/node.git
   cd node
   ```

2. **Run setup (installs dependencies and links the `oya` command):**

   ```bash
   bun setup
   ```

   This will install dependencies and make the `oya` command available globally.

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
BUNDLE_TRACKER_ADDRESS=your_bundle_tracker_contract_address
(This will be 0xd4af8d53a8fccacd1dc8abe8ddf7dfbc4b81546c on Sepolia.)

# Public/Private key used by the bundle proposer for signing bundles (ensure this is kept secure)
PROPOSER_ADDRESS=your_public_key
PROPOSER_KEY=your_private_key
```

(For testing purposes, you might also use a .env.test file.)

## Database Setup

The database can be created and set up using the `oya` CLI or `bun` commands:

```bash
# Create the oya_db database (if it doesn't exist)
oya db:create

# Set up database tables (safe to run multiple times)
oya db:setup

# Drop and recreate all tables (WARNING: deletes all data!)
oya db:reset

# Or use bun directly
bun run db:create
bun run db:setup
bun run db:reset

# Or run directly with custom DATABASE_URL
DATABASE_URL=postgresql://user:pass@localhost:5432/oya_db bun run scripts/setup-db.js
```

The setup script creates the following tables:

- **bundles:** Stores bundle data and nonce.
- **cids:** Stores IPFS CIDs corresponding to bundles.
- **balances:** Tracks token balances per vault.
- **nonces:** Tracks the latest nonce for each vault.

If deploying to Heroku, run the migration script as follows:

```bash
chmod +x migrations/1_createTable.sh
./migrations/1_createTable.sh --app-name your-heroku-app-name
```

Alternatively, execute the SQL commands manually in your PostgreSQL instance.

## Running the Application

### Using Bun or Oya CLI

After setting up your environment and database, you can start the server locally with:

```bash
# Using the oya command
oya start

# Or with debug logging
oya start:debug

# Or using bun directly
bun start
```

The server listens on the port specified in your `.env` file (default is `3000`).

### Using Docker Locally

The Dockerfile uses Bun for a streamlined, single-stage build:

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --production

# Copy source code (no build step needed - Bun runs TypeScript directly)
COPY src ./src

# Expose port and set environment
EXPOSE 3000
ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
```

To build and run the container locally:

1. **Build the image:**

   ```bash
   docker build -t oya-node .
   ```

2. **Run the container:**

   ```bash
   docker run -p 3000:3000 --env-file .env oya-node
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
bun test
```

Tests are written using Bun's built-in test runner and are located in the `test` directory.

## Deployment

The application is fully containerized using Docker, which allows you to deploy it anywhere that supports Docker (e.g., Heroku, AWS, Google Cloud, or on your local server). Below are instructions for deploying the application on Heroku using Docker as an example.

### Deploying on Heroku (Example)

1. **Log in to the Heroku Container Registry:**

   ```bash
   heroku container:login
   ```

2. **Build and Push the Docker Image:**

   Build your Bun-based image for the `linux/amd64` architecture and push directly to Heroku's registry:

   ```bash
   docker buildx build --platform linux/amd64 --provenance=false --push -t registry.heroku.com/your-heroku-app/web:latest .
   ```

   Alternatively, you can disable provenance by setting an environment variable before building:

   ```bash
   export BUILDX_NO_DEFAULT_ATTESTATIONS=1
   docker buildx build --platform linux/amd64 --push -t registry.heroku.com/your-heroku-app/web:latest .
   ```

3. **Release the Container on Heroku:**

   ```bash
   heroku container:release web --app your-heroku-app
   ```

4. **Verify the Deployment:**

   Check running dynos:

   ```bash
   heroku ps --app your-heroku-app
   ```

   View logs:

   ```bash
   heroku logs --tail --app your-heroku-app
   ```

### Other Deployment Options

Since the application is containerized, you can also deploy it to any hosting provider that supports Docker. For example:

* **Local Deployment with Docker Compose:** Create a docker-compose.yml file to bring up your application along with its dependencies (such as PostgreSQL).

* **Cloud Platforms (AWS, Google Cloud, DigitalOcean, etc.):** Use orchestration tools (e.g., Kubernetes or Docker Swarm) or managed container services (such as AWS Fargate or Google Cloud Run) to deploy your Docker image.

## Future Enhancements

Planned improvements for future releases include (but are not limited to):

- **Multi-Proposer Support:**  
  Extend the system to fetch, display, and verify bundles from multiple proposers by parsing onchain event logs. This will allow nodes to cross-check and validate proposals from different sources.

- **Enhanced Bundle Verification:**  
  Develop robust mechanisms for verifying the correctness of bundles proposed by various nodes, improving overall network security and consensus.

- **Expanded API Functionality:**  
  Add new API endpoints to query detailed bundle and proposer information.

- **Robust Error Handling and Logging:**  
  Improve error handling in the bundle proposer logic and enhance logging to facilitate debugging and monitoring.

- **Performance Optimization:**  
  Optimize the node for scalability and higher throughput as the network and transaction volumes grow.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request with your changes. When contributing, please ensure your code adheres to the project's style guidelines and passes all tests.
