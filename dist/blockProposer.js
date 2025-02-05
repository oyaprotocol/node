"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndPublishBlock = exports.handleIntention = void 0;
const ethers_1 = require("ethers");
const alchemy_sdk_1 = require("alchemy-sdk");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Instead of axios calls to OYA_API_BASE_URL, we import the shared DB pool
const index_1 = require("./index");
dotenv_1.default.config();
// Constants (from your original oya-node code)
const BUNDLER_ADDRESS = '0x42fA5d9E5b0B1c039b08853cF62f8E869e8E5bAf'; // For testing
const OYA_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000001";
const OYA_REWARD_AMOUNT = (0, ethers_1.parseUnits)('1', 18); // 1 Oya token (BigNumber)
// Global variables
let cachedIntentions = [];
let mainnetAlchemy;
let sepoliaAlchemy;
let wallet;
let blockTrackerContract; // now typed as our custom interface
// Variables for Helia/IPFS – will be initialized in setupHelia()
let s; // helper for adding data to IPFS
// Initialize wallet and contract on module load.
initializeWalletAndContract()
    .then(() => {
    console.log("Block proposer initialization complete. Ready to handle proposals.");
})
    .catch((error) => {
    console.error("Initialization failed:", error);
});
/**
 * Creates an instance of the BlockTracker contract.
 */
async function buildBlockTrackerContract() {
    const abiPath = path_1.default.join(__dirname, 'abi', 'BlockTracker.json');
    const contractABI = JSON.parse(fs_1.default.readFileSync(abiPath, 'utf8'));
    // Await and cast the provider from sepoliaAlchemy.
    const provider = (await sepoliaAlchemy.config.getProvider());
    const contract = new ethers_1.ethers.Contract(process.env.BLOCK_TRACKER_ADDRESS, contractABI, provider);
    // Connect the wallet (casting to ContractRunner) and then cast to our custom interface.
    return contract.connect(wallet);
}
/**
 * Creates and returns Alchemy instances (mainnet and Sepolia) and an Alchemy Wallet.
 */
async function buildAlchemyInstances() {
    // Create Alchemy instance for Ethereum mainnet using the Network enum.
    const mainnet = new alchemy_sdk_1.Alchemy({
        apiKey: process.env.ALCHEMY_API_KEY,
        network: alchemy_sdk_1.Network.ETH_MAINNET,
    });
    // Create Alchemy instance for the Sepolia network using the Network enum.
    const sepolia = new alchemy_sdk_1.Alchemy({
        apiKey: process.env.ALCHEMY_API_KEY,
        network: alchemy_sdk_1.Network.ETH_SEPOLIA,
    });
    // Ensure that the mainnet instance is fully initialized.
    await mainnet.core.getTokenMetadata("0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828");
    // Create a wallet using the Sepolia Alchemy instance.
    const walletInstance = new alchemy_sdk_1.Wallet(process.env.TEST_PRIVATE_KEY, sepolia);
    return { mainnetAlchemy: mainnet, sepoliaAlchemy: sepolia, wallet: walletInstance };
}
/**
 * INTERNAL HELPER FUNCTIONS (replacing HTTP calls)
 *
 * These functions directly query/update the database via the shared pool.
 */
/**
 * Retrieves the latest nonce from the blocks table.
 */
async function getLatestNonce() {
    const result = await index_1.pool.query('SELECT nonce FROM blocks ORDER BY timestamp DESC LIMIT 1');
    if (result.rows.length === 0)
        return 0;
    return result.rows[0].nonce + 1;
}
/**
 * Retrieves the token decimals using mainnetAlchemy.
 */
async function getTokenDecimals(tokenAddress) {
    try {
        if (tokenAddress === "0x0000000000000000000000000000000000000000") {
            return 18n;
        }
        const tokenMetadata = await mainnetAlchemy.core.getTokenMetadata(tokenAddress);
        if (tokenMetadata.decimals === null || tokenMetadata.decimals === undefined) {
            console.error("Token metadata decimals is missing for token:", tokenAddress);
            throw new Error("Token decimals missing");
        }
        return BigInt(tokenMetadata.decimals);
    }
    catch (error) {
        console.error(`Failed to get token metadata for ${tokenAddress}:`, error);
        throw new Error("Failed to retrieve token decimals");
    }
}
/**
 * Retrieves the balance (as a bigint) for a given vault and token.
 */
async function getBalance(vault, token) {
    const result = await index_1.pool.query('SELECT balance FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2) ORDER BY timestamp DESC LIMIT 1', [vault, token]);
    return result.rows.length ? BigInt(result.rows[0].balance) : 0n;
}
/**
 * Updates (or inserts) a balance record for a given vault and token.
 */
async function updateBalance(vault, token, newBalance) {
    const result = await index_1.pool.query('SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2)', [vault, token]);
    if (result.rows.length === 0) {
        await index_1.pool.query('INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)', [vault, token, newBalance.toString()]);
    }
    else {
        await index_1.pool.query('UPDATE balances SET balance = $1, timestamp = CURRENT_TIMESTAMP WHERE LOWER(vault) = LOWER($2) AND LOWER(token) = LOWER($3)', [newBalance.toString(), vault, token]);
    }
}
/**
 * Checks whether a vault is initialized (i.e. has any balance record).
 */
async function vaultExists(vault) {
    const result = await index_1.pool.query('SELECT 1 FROM balances WHERE LOWER(vault)=LOWER($1) LIMIT 1', [vault]);
    return result.rows.length > 0;
}
/**
 * Ensures that a vault (by address) is initialized in the database.
 */
async function initializeVault(vault) {
    if (!(await vaultExists(vault))) {
        await initializeBalancesForVault(vault);
    }
}
/**
 * Initializes the balances for a given vault.
 */
async function initializeBalancesForVault(vault) {
    const initialBalance18 = (0, ethers_1.parseUnits)('10000', 18);
    const initialBalance6 = (0, ethers_1.parseUnits)('1000000', 6);
    const initialOyaBalance = (0, ethers_1.parseUnits)('111', 18);
    const supportedTokens18 = ["0x0000000000000000000000000000000000000000"];
    const supportedTokens6 = ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"];
    const oyaTokens = ["0x0000000000000000000000000000000000000001"];
    for (const token of supportedTokens18) {
        await index_1.pool.query('INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)', [vault, token, initialBalance18.toString()]);
    }
    for (const token of supportedTokens6) {
        await index_1.pool.query('INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)', [vault, token, initialBalance6.toString()]);
    }
    for (const token of oyaTokens) {
        await index_1.pool.query('INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)', [vault, token, initialOyaBalance.toString()]);
    }
    console.log(`Vault ${vault} initialized with test tokens`);
}
/**
 * Mints rewards (1 Oya token) to the specified addresses.
 */
async function mintRewards(addresses) {
    for (const address of addresses) {
        await initializeVault(address);
        const currentBalance = await getBalance(address, OYA_TOKEN_ADDRESS);
        const newBalance = currentBalance + BigInt(OYA_REWARD_AMOUNT.toString());
        await updateBalance(address, OYA_TOKEN_ADDRESS, newBalance);
    }
}
/**
 * Saves block data and the corresponding CID into the database and updates vault nonces.
 */
async function saveBlockData(blockData, cidToString) {
    // Save block data
    await index_1.pool.query('INSERT INTO blocks (block, nonce) VALUES ($1::jsonb, $2)', [JSON.stringify(blockData.block), blockData.nonce]);
    console.log('Block data saved to DB');
    // Save the CID
    await index_1.pool.query('INSERT INTO cids (cid, nonce) VALUES ($1, $2)', [cidToString, blockData.nonce]);
    console.log('CID saved to DB');
    // Update nonce for each vault in the block
    for (const execution of blockData.block) {
        const vaultNonce = execution.intention.nonce;
        const vault = execution.intention.from;
        await index_1.pool.query(`INSERT INTO nonces (vault, nonce) 
       VALUES (LOWER($1), $2) 
       ON CONFLICT (vault) 
       DO UPDATE SET nonce = EXCLUDED.nonce`, [vault, vaultNonce]);
    }
}
/**
 * Publishes a block. This function:
 *  1. Ensures Helia/IPFS is set up.
 *  2. Signs and verifies the block.
 *  3. Uploads block data to IPFS.
 *  4. Calls the blockchain contract.
 *  5. Saves the block data, updates balances, mints rewards, and updates vault nonces.
 */
async function publishBlock(data, signature, from) {
    await ensureHeliaSetup();
    if (from !== BUNDLER_ADDRESS) {
        throw new Error("Unauthorized: Only the blockProposer can publish new blocks.");
    }
    const signerAddress = (0, ethers_1.verifyMessage)(data, signature);
    if (signerAddress !== from) {
        throw new Error("Signature verification failed");
    }
    const cid = await s.add(data);
    const cidToString = cid.toString();
    console.log('Block published to IPFS, CID:', cidToString);
    try {
        const tx = await blockTrackerContract.proposeBlock(cidToString);
        await sepoliaAlchemy.transact.waitForTransaction(tx.hash);
        console.log('Blockchain transaction successful');
    }
    catch (error) {
        console.error("Failed to propose block:", error);
        throw new Error("Blockchain transaction failed");
    }
    let blockData;
    try {
        blockData = JSON.parse(data);
    }
    catch (error) {
        console.error("Failed to parse block data:", error);
        throw new Error("Invalid block data");
    }
    if (!Array.isArray(blockData.block)) {
        console.error("Invalid block data structure:", blockData);
        throw new Error("Invalid block data structure");
    }
    // Save the block and CID data directly via DB queries.
    try {
        await saveBlockData(blockData, cidToString);
    }
    catch (error) {
        console.error("Failed to save block/CID data:", error);
        throw new Error("Database operation failed");
    }
    // Update balances based on the proofs contained in the block.
    try {
        for (const execution of blockData.block) {
            if (!Array.isArray(execution.proof)) {
                console.error("Invalid proof structure in execution:", execution);
                throw new Error("Invalid proof structure");
            }
            for (const proof of execution.proof) {
                await updateBalances(proof.from, proof.to, proof.token, proof.amount);
            }
        }
        console.log('Balances updated successfully');
    }
    catch (error) {
        console.error("Failed to update balances:", error);
        throw new Error("Balance update failed");
    }
    // Mint rewards to all reward addresses.
    try {
        await mintRewards(blockData.rewards.map((reward) => reward.vault));
        console.log('Rewards minted successfully');
    }
    catch (error) {
        console.error("Failed to mint rewards:", error);
        throw new Error("Minting rewards failed");
    }
    return cid;
}
/**
 * Sets up Helia/IPFS if it has not been initialized already.
 */
async function ensureHeliaSetup() {
    if (!s) {
        await setupHelia();
    }
}
/**
 * Dynamically imports and initializes Helia and the strings helper.
 */
async function setupHelia() {
    const heliaModule = await Promise.resolve().then(() => __importStar(require('helia')));
    const { createHelia } = heliaModule;
    const stringsModule = await Promise.resolve().then(() => __importStar(require('@helia/strings')));
    const { strings } = stringsModule;
    const heliaNode = await createHelia();
    s = strings(heliaNode);
}
/**
 * Updates balances for a given transfer.
 */
async function updateBalances(from, to, token, amount) {
    await initializeVault(from);
    await initializeVault(to);
    const amountBigInt = BigInt(amount);
    // If the "from" address is the block proposer, update its balance to a large value.
    if (from.toLowerCase() === BUNDLER_ADDRESS.toLowerCase()) {
        const largeBalance = (0, ethers_1.parseUnits)('1000000000000', 18);
        await updateBalance(from, token, largeBalance);
        console.log(`Block proposer balance updated to a large amount for token ${token}`);
    }
    const fromBalance = await getBalance(from, token);
    const toBalance = await getBalance(to, token);
    const newFromBalance = fromBalance - amountBigInt;
    const newToBalance = toBalance + amountBigInt;
    if (newFromBalance < 0n) {
        throw new Error('Insufficient balance in from vault');
    }
    console.log(`New balance for from vault (${from}): ${newFromBalance.toString()}`);
    console.log(`New balance for to vault (${to}): ${newToBalance.toString()}`);
    await updateBalance(from, token, newFromBalance);
    await updateBalance(to, token, newToBalance);
    console.log(`Balances updated: from ${from} to ${to} for token ${token} amount ${amount}`);
}
/**
 * Processes an incoming intention.
 */
async function handleIntention(intention, signature, from) {
    await initializeVault(from);
    const signerAddress = (0, ethers_1.verifyMessage)(JSON.stringify(intention), signature);
    if (signerAddress !== from) {
        console.log("Signature verification failed");
        throw new Error("Signature verification failed");
    }
    const proof = [];
    if (intention.action_type === "transfer" || intention.action_type === "swap") {
        const tokenAddress = intention.from_token_address;
        const sentTokenDecimals = await getTokenDecimals(tokenAddress);
        const amountSent = (0, ethers_1.parseUnits)(intention.amount_sent, Number(sentTokenDecimals));
        let amountReceived;
        if (intention.amount_received) {
            const receivedTokenDecimals = await getTokenDecimals(intention.to_token_address);
            amountReceived = (0, ethers_1.parseUnits)(intention.amount_received, Number(receivedTokenDecimals));
        }
        const amountSentBigInt = BigInt(amountSent.toString());
        // Instead of an external API call, we retrieve the current balance directly.
        const currentBalance = await getBalance(from, tokenAddress);
        if (currentBalance < amountSentBigInt) {
            console.error(`Insufficient balance. Current: ${currentBalance.toString()}, Required: ${amountSent.toString()}`);
            throw new Error('Insufficient balance');
        }
        if (intention.action_type === "swap") {
            if (amountReceived === undefined) {
                throw new Error("Missing amountReceived for swap");
            }
            const swapInput = {
                token: intention.from_token_address,
                chainId: intention.from_token_chainid,
                from: intention.from,
                to: BUNDLER_ADDRESS,
                amount: amountSent.toString(),
                tokenId: 0,
            };
            proof.push(swapInput);
            const swapOutput = {
                token: intention.to_token_address,
                chainId: intention.to_token_chainid,
                from: BUNDLER_ADDRESS,
                to: intention.from,
                amount: amountReceived.toString(),
                tokenId: 0,
            };
            proof.push(swapOutput);
        }
        else {
            const transfer = {
                token: intention.from_token_address,
                chainId: intention.from_token_chainid,
                from: intention.from,
                to: intention.to,
                amount: amountSent.toString(),
                tokenId: 0,
            };
            proof.push(transfer);
        }
    }
    else {
        console.error("Unexpected action_type:", intention.action_type);
    }
    const executionObject = {
        execution: [
            {
                intention: intention,
                proof: proof,
            },
        ],
    };
    cachedIntentions.push(executionObject);
    return executionObject;
}
exports.handleIntention = handleIntention;
/**
 * Called periodically to publish a block if any intentions have been cached.
 */
async function createAndPublishBlock() {
    if (cachedIntentions.length === 0) {
        console.log("No intentions to propose.");
        return;
    }
    let nonce;
    try {
        nonce = await getLatestNonce();
    }
    catch (error) {
        console.error("Failed to get latest nonce:", error);
        return;
    }
    // Flatten cached intentions into a block array.
    const block = cachedIntentions.map(({ execution }) => execution).flat();
    // Collect all unique reward addresses from proofs.
    const rewardAddresses = [
        ...new Set(block.flatMap((execution) => execution.proof.map((proof) => proof.from)))
    ];
    const blockObject = {
        block: block,
        nonce: nonce,
        rewards: rewardAddresses.map((address) => ({
            vault: address,
            token: OYA_TOKEN_ADDRESS,
            amount: BigInt(OYA_REWARD_AMOUNT.toString()).toString(),
        })),
    };
    // Sign the block object.
    const blockProposerSignature = await wallet.signMessage(JSON.stringify(blockObject));
    try {
        await publishBlock(JSON.stringify(blockObject), blockProposerSignature, BUNDLER_ADDRESS);
    }
    catch (error) {
        console.error("Failed to publish block:", error);
        cachedIntentions = [];
        return;
    }
    // Clear the cached intentions after publishing.
    cachedIntentions = [];
}
exports.createAndPublishBlock = createAndPublishBlock;
/**
 * Initializes the wallet and blockchain contract.
 */
async function initializeWalletAndContract() {
    const { mainnetAlchemy: mainAlchemy, sepoliaAlchemy: sepAlchemy, wallet: walletInstance } = await buildAlchemyInstances();
    mainnetAlchemy = mainAlchemy;
    sepoliaAlchemy = sepAlchemy;
    wallet = walletInstance;
    blockTrackerContract = await buildBlockTrackerContract();
}
module.exports = {
    handleIntention,
    createAndPublishBlock,
    _getCachedIntentions: () => cachedIntentions,
    _clearCachedIntentions: () => {
        cachedIntentions = [];
    },
};
