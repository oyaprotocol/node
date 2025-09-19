import { ethers, parseUnits, verifyMessage } from 'ethers';
import { Alchemy, Wallet, Network } from 'alchemy-sdk';
import { createHelia } from 'helia';
import { strings } from '@helia/strings';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pool } from './index.js';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

function safeBigInt(value: string): bigint {
  const integerPart = value.split('.')[0];
  return BigInt(integerPart);
}

export interface BundleTrackerContract extends ethers.BaseContract {
  proposeBundle(
    _bundleData: string,
    overrides?: ethers.Overrides
  ): Promise<ethers.ContractTransaction>;
}

const PROPOSER_ADDRESS = '0x42fA5d9E5b0B1c039b08853cF62f8E869e8E5bAf'; // For testing

let cachedIntentions: any[] = [];

let mainnetAlchemy: Alchemy;
let sepoliaAlchemy: Alchemy;
let wallet: Wallet;
let bundleTrackerContract: BundleTrackerContract;

let s: any;

initializeWalletAndContract()
  .then(() => {
    console.log("Bundle proposer initialization complete. Ready to handle proposals.");
  })
  .catch((error) => {
    console.error("Initialization failed:", error);
  });

async function buildBundleTrackerContract(): Promise<BundleTrackerContract> {
  const abiPath = path.join(__dirname, 'abi', 'BundleTracker.json');
  const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const provider = (await sepoliaAlchemy.config.getProvider()) as unknown as ethers.Provider;
  const contract = new ethers.Contract(
    process.env.BUNDLE_TRACKER_ADDRESS as string,
    contractABI,
    provider
  );
  return contract.connect(wallet as unknown as ethers.ContractRunner) as BundleTrackerContract;
}

async function buildAlchemyInstances() {
  const mainnet = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY as string,
    network: Network.ETH_MAINNET,
  });
  const sepolia = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY as string,
    network: Network.ETH_SEPOLIA,
  });
  await mainnet.core.getTokenMetadata("0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828");
  const walletInstance = new Wallet(process.env.TEST_PRIVATE_KEY as string, sepolia);
  return { mainnetAlchemy: mainnet, sepoliaAlchemy: sepolia, wallet: walletInstance };
}

async function getLatestNonce(): Promise<number> {
  const result = await pool.query(
    'SELECT nonce FROM bundles ORDER BY timestamp DESC LIMIT 1'
  );
  if (result.rows.length === 0) return 0;
  return result.rows[0].nonce + 1;
}

async function getTokenDecimals(tokenAddress: string): Promise<bigint> {
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
  } catch (error) {
    console.error(`Failed to get token metadata for ${tokenAddress}:`, error);
    throw new Error("Failed to retrieve token decimals");
  }
}

async function getBalance(vault: string, token: string): Promise<bigint> {
  const result = await pool.query(
    'SELECT balance FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2) ORDER BY timestamp DESC LIMIT 1',
    [vault, token]
  );
  if (result.rows.length === 0) return 0n;
  return safeBigInt(result.rows[0].balance.toString());
}

async function updateBalance(vault: string, token: string, newBalance: bigint): Promise<void> {
  const result = await pool.query(
    'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2)',
    [vault, token]
  );
  if (result.rows.length === 0) {
    await pool.query(
      'INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)',
      [vault, token, newBalance.toString()]
    );
  } else {
    await pool.query(
      'UPDATE balances SET balance = $1, timestamp = CURRENT_TIMESTAMP WHERE LOWER(vault) = LOWER($2) AND LOWER(token) = LOWER($3)',
      [newBalance.toString(), vault, token]
    );
  }
}

async function vaultExists(vault: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM balances WHERE LOWER(vault)=LOWER($1) LIMIT 1',
    [vault]
  );
  return result.rows.length > 0;
}

async function initializeVault(vault: string) {
  if (!(await vaultExists(vault))) {
    await initializeBalancesForVault(vault);
  }
}

async function initializeBalancesForVault(vault: string) {
  const initialBalance18 = parseUnits('10000', 18);
  const initialBalance6 = parseUnits('1000000', 6);
  const supportedTokens18: string[] = ["0x0000000000000000000000000000000000000000"];
  const supportedTokens6: string[] = ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"];
  const oyaTokens: string[] = ["0x0000000000000000000000000000000000000001"];
  for (const token of supportedTokens18) {
    await pool.query(
      'INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)',
      [vault, token, initialBalance18.toString()]
    );
  }
  for (const token of supportedTokens6) {
    await pool.query(
      'INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)',
      [vault, token, initialBalance6.toString()]
    );
  }
  for (const token of oyaTokens) {
    await pool.query(
      'INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3)',
      [vault, token, /* Note: Removed initialOyaBalance since rewards are not minted */ "0"]
    );
  }
  console.log(`Vault ${vault} initialized with test tokens`);
}

async function saveProposerData(proposer: string): Promise<void> {
  await pool.query(
    `INSERT INTO proposers (proposer, last_seen)
     VALUES (LOWER($1), CURRENT_TIMESTAMP)
     ON CONFLICT (proposer)
     DO UPDATE SET last_seen = EXCLUDED.last_seen`,
    [proposer]
  );
  console.log(`Proposer data saved/updated for ${proposer}`);
}

async function saveBundleData(blockData: any, cidToString: string, proposerSignature: string) {
  // Convert the block (JSON) to a Buffer for the BYTEA column
  const blockBuffer = Buffer.from(JSON.stringify(blockData.block), 'utf8');
  await pool.query(
    `INSERT INTO bundles (bundle, nonce, proposer, signature, ipfs_cid)
     VALUES ($1, $2, $3, $4, $5)`,
    [blockBuffer, blockData.nonce, PROPOSER_ADDRESS, proposerSignature, cidToString]
  );
  console.log('Bundle data saved to DB');

  // Also insert into the cids table, now including the proposer
  await pool.query(
    'INSERT INTO cids (cid, nonce, proposer) VALUES ($1, $2, $3)',
    [cidToString, blockData.nonce, PROPOSER_ADDRESS]
  );
  console.log('CID saved to DB');

  for (const execution of blockData.block) {
    const vaultNonce = execution.intention.nonce;
    const vault = execution.intention.from;
    await pool.query(
      `INSERT INTO nonces (vault, nonce) 
       VALUES (LOWER($1), $2) 
       ON CONFLICT (vault) 
       DO UPDATE SET nonce = EXCLUDED.nonce`,
      [vault, vaultNonce]
    );
  }
}

async function publishBundle(data: string, signature: string, from: string) {
  await ensureHeliaSetup();

  console.log("Publishing bundle. Data length (before compression):", data.length);

  if (from !== PROPOSER_ADDRESS) {
    throw new Error("Unauthorized: Only the proposer can publish new bundles.");
  }
  
  const signerAddress = verifyMessage(data, signature);
  console.log("Recovered signer address:", signerAddress);
  if (signerAddress !== from) {
    console.error("Expected signer:", from, "but got:", signerAddress);
    throw new Error("Signature verification failed");
  }
  
  let compressedData: Buffer;
  try {
    console.log("Starting compression of bundle data...");
    compressedData = await gzip(data);
    console.log("Compression successful. Compressed data length:", compressedData.length);
  } catch (error) {
    console.error("Compression failed:", error);
    throw new Error("Bundle data compression failed");
  }
  
  const cid = await s.add(compressedData);
  const cidToString = cid.toString();
  console.log('Bundle published to IPFS, CID:', cidToString);
  
  try {
    const tx = await bundleTrackerContract.proposeBundle(cidToString);
    await sepoliaAlchemy.transact.waitForTransaction((tx as any).hash);
    console.log('Blockchain transaction successful');
    // Save proposer data after successful blockchain transaction.
    await saveProposerData(PROPOSER_ADDRESS);
  } catch (error) {
    console.error("Failed to propose bundle:", error);
    throw new Error("Blockchain transaction failed");
  }
  
  let blockData: any;
  try {
    blockData = JSON.parse(data);
    console.log("Bundle data parsed successfully");
  } catch (error) {
    console.error("Failed to parse bundle data:", error);
    throw new Error("Invalid bundle data");
  }
  if (!Array.isArray(blockData.block)) {
    console.error("Invalid bundle data structure:", blockData);
    throw new Error("Invalid bundle data structure");
  }
  try {
    await saveBundleData(blockData, cidToString, signature);
  } catch (error) {
    console.error("Failed to save bundle/CID data:", error);
    throw new Error("Database operation failed");
  }
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
  } catch (error) {
    console.error("Failed to update balances:", error);
    throw new Error("Balance update failed");
  }
  return cid;
}

async function ensureHeliaSetup() {
  if (!s) {
    await setupHelia();
  }
}

async function setupHelia() {
  const heliaNode = await createHelia();
  s = strings(heliaNode);
}

async function updateBalances(from: string, to: string, token: string, amount: string) {
  await initializeVault(from);
  await initializeVault(to);
  const amountBigInt = safeBigInt(amount);
  if (from.toLowerCase() === PROPOSER_ADDRESS.toLowerCase()) {
    const largeBalance = parseUnits('1000000000000', 18);
    await updateBalance(from, token, safeBigInt(largeBalance.toString()));
    console.log(`Bundle proposer balance updated to a large amount for token ${token}`);
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

async function handleIntention(intention: any, signature: string, from: string): Promise<any> {
  await initializeVault(from);
  console.log("Handling intention. Raw intention:", JSON.stringify(intention));
  console.log("Received signature:", signature);
  
  const signerAddress = verifyMessage(JSON.stringify(intention), signature);
  console.log("Recovered signer address from intention:", signerAddress);
  if (signerAddress !== from) {
    console.log("Signature verification failed. Expected:", from, "Got:", signerAddress);
    throw new Error("Signature verification failed");
  }
  const proof: any[] = [];
  if (intention.action_type === "transfer" || intention.action_type === "swap") {
    const tokenAddress = intention.from_token_address;
    const sentTokenDecimals = await getTokenDecimals(tokenAddress);
    const amountSent = parseUnits(intention.amount_sent, Number(sentTokenDecimals));
    let amountReceived;
    if (intention.amount_received) {
      const receivedTokenDecimals = await getTokenDecimals(intention.to_token_address);
      amountReceived = parseUnits(intention.amount_received, Number(receivedTokenDecimals));
    }
    const amountSentBigInt = safeBigInt(amountSent.toString());
    const currentBalance = await getBalance(from, tokenAddress);
    console.log(`Current balance for ${from} and token ${tokenAddress}: ${currentBalance.toString()}`);
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
        to: PROPOSER_ADDRESS,
        amount: amountSent.toString(),
        tokenId: 0,
      };
      proof.push(swapInput);
      const swapOutput = {
        token: intention.to_token_address,
        chainId: intention.to_token_chainid,
        from: PROPOSER_ADDRESS,
        to: intention.from,
        amount: amountReceived.toString(),
        tokenId: 0,
      };
      proof.push(swapOutput);
    } else {
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
  } else if (Array.isArray(intention.inputs) && Array.isArray(intention.outputs)) {
    // New-style intention: each positive output represents a transfer from the vault
    const fromVault = intention.from;
    for (const out of intention.outputs) {
      if (typeof out.amount !== 'number' || out.amount <= 0) continue;
      const toAddress = out.externalAddress ?? out.vault;
      if (!toAddress) continue;
      const digits = Number(out.digits || 0);
      const amountUnits = parseUnits(out.amount.toString(), digits).toString();
      proof.push({
        token: out.asset,
        from: fromVault,
        to: toAddress,
        amount: amountUnits,
        tokenId: 0,
      });
    }
  } else {
    console.error("Unexpected intention format:", intention);
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
  console.log("Cached intention added. Total cached intentions:", cachedIntentions.length);
  return executionObject;
}

async function createAndPublishBundle() {
  if (cachedIntentions.length === 0) {
    console.log("No intentions to propose.");
    return;
  }
  let nonce: number;
  try {
    nonce = await getLatestNonce();
    console.log("Latest nonce retrieved:", nonce);
  } catch (error) {
    console.error("Failed to get latest nonce:", error);
    return;
  }
  const block = cachedIntentions.map(({ execution }) => execution).flat();
  const blockObject = {
    block: block,
    nonce: nonce,
  };
  console.log("Block object to be signed:", JSON.stringify(blockObject));
  const proposerSignature = await wallet.signMessage(JSON.stringify(blockObject));
  console.log("Generated block proposer signature:", proposerSignature);
  try {
    await publishBundle(JSON.stringify(blockObject), proposerSignature, PROPOSER_ADDRESS);
    console.log("Bundle published successfully");
  } catch (error) {
    console.error("Failed to publish bundle:", error);
    cachedIntentions = [];
    return;
  }
  cachedIntentions = [];
}

async function initializeWalletAndContract() {
  const { mainnetAlchemy: mainAlchemy, sepoliaAlchemy: sepAlchemy, wallet: walletInstance } = await buildAlchemyInstances();
  mainnetAlchemy = mainAlchemy;
  sepoliaAlchemy = sepAlchemy;
  wallet = walletInstance;
  bundleTrackerContract = await buildBundleTrackerContract();
}

const _getCachedIntentions = () => cachedIntentions;
const _clearCachedIntentions = () => {
  cachedIntentions = [];
};

export { 
  handleIntention, 
  createAndPublishBundle, 
  _getCachedIntentions, 
  _clearCachedIntentions 
};
