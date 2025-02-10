# OYA-API

OYA-API is a Node.js–based full node for a natural language blockchain. It allows nodes to both propose new blocks (containing signed, natural language intentions) and verify blocks from other proposers. In addition, the API exposes endpoints for querying the blockchain’s current state—including blocks, CIDs, balances, and vault nonces.

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Block Proposing Workflow](#block-proposing-workflow)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Natural Language Blockchain Node:** Accepts signed intentions in natural language.
- **Block Proposer:** Caches incoming intentions and periodically bundles them into a block.
- **Blockchain Contract Integration:** Interacts with a blockchain smart contract via ethers.js.
- **IPFS Storage:** Uses Helia to upload block data to IPFS.
- **Robust API Endpoints:** Exposes endpoints for blocks, CIDs, balances, and nonces.
- **PostgreSQL Backend:** Uses PostgreSQL for persisting blockchain state, including blocks, balances, and nonces.
- **Automated Balance & Reward Updates:** Processes transfers or swaps and mints rewards automatically.

## Architecture Overview

- **Express Server:** The main entry point (`index.ts`) sets up the Express server, JSON parsing, and routes.
- **Routing & Controllers:** API endpoints are defined in `routes.ts` and implemented in `controllers.ts`. These endpoints manage database operations for blocks, CIDs, balances, and vault nonces.
- **Block Proposer Logic:** Implemented in `blockProposer.ts`, this module:
  - Processes incoming intentions from the `/intention` endpoint.
  - Caches intentions and bundles them into a block every 10 seconds.
  - Signs the block, uploads it to IPFS via Helia, interacts with the blockchain contract, and updates the database accordingly.
- **Database:** PostgreSQL is used for persistent storage. Migration scripts (e.g., `migrations/1_createTable.sh`) set up the required tables.

## Prerequisites

- **Node.js:** Version supporting ES2020 (or later)
- **npm:** Package manager for installing dependencies
- **PostgreSQL Database:** Either local or hosted (e.g., via Heroku)
- **Alchemy API Key:** For interacting with Ethereum networks
- **Blockchain Contract:** A deployed BlockTracker contract (its address must be provided)
- **IPFS (Helia):** Used internally to store block data

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/oya-api.git
   cd oya-api
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
# The port on which the server will run
PORT=3000

# PostgreSQL database connection string
DATABASE_URL=postgres://username:password@host:port/database

# Alchemy API Key for Ethereum network access
ALCHEMY_API_KEY=your_alchemy_api_key

# Deployed BlockTracker contract address
BLOCK_TRACKER_ADDRESS=your_block_tracker_contract_address

# Private key used by the block proposer for signing blocks (ensure this is kept secure)
TEST_PRIVATE_KEY=your_private_key
```

(For testing purposes, you might also use a .env.test file.)

## Database Setup

The database schema is managed via SQL migration scripts. For example, the `migrations/1_createTable.sh` script drops (if needed) and creates the following tables:

- **blocks:** Stores block data and nonce.
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

After setting up your environment and database, you can start the server:

1. **Start the server locally:**

   ```bash
   npm run start
   ```

   The server listens on the port specified in your `.env` file (default is `3000`).

2. **Process Flow:**
   - The server mounts routes (e.g., `/block`, `/cid`, `/balance`, `/nonce`) and exposes an additional `/intention` endpoint.
   - Every 10 seconds, the application attempts to publish a new block if there are cached intentions.

## API Endpoints

Below is a summary of the main API endpoints:

- **Blocks**
  - `GET /block` — Retrieve all blocks.
  - `GET /block/:nonce` — Retrieve a block by its nonce.
  - `POST /block` — Save a block (typically called internally after publishing).

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

    This endpoint passes the intention to the block proposer logic after verifying the signature.

## Block Proposing Workflow

1. **Receiving Intentions:**  
   When a client posts to `/intention`, the application verifies the signature (using ethers’ `verifyMessage`) and caches the intention.

2. **Creating a Block:**  
   Every 10 seconds, the application checks if there are cached intentions. If so, it:
   - Retrieves the latest nonce from the database.
   - Bundles all cached intentions into a block.
   - Signs the block using the block proposer’s private key.
   - Uploads the block data to IPFS via Helia.
   - Calls the `proposeBlock` function on the blockchain contract using ethers.js.
   - Persists the block and associated CID to the database.
   - Updates balances based on the transactions in the block.
   - Mints rewards to the relevant addresses.

3. **Error Handling:**  
   The block proposer logic includes error handling for signature verification, IPFS uploads, blockchain transactions, and database operations.

## Testing

To run the test suite, use:

```bash
npm run test
```

Tests are written using Mocha, Chai, and ts-mocha, and are located in the `test` directory.

## Deployment

For deploying on Heroku:

1. Ensure that your environment variables are set correctly on the platform.
2. The included `Procfile` specifies the start command:

   ```Procfile
   web: npm run start
   ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request with your changes. When contributing, please ensure your code adheres to the project's style guidelines and passes all tests.