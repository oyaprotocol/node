import { ethers, parseUnits, verifyMessage } from 'ethers';
import { Alchemy, Wallet, Network } from 'alchemy-sdk';
import { createHelia } from 'helia'
import { strings } from '@helia/strings'
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { pool } from './index.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

function safeBigInt(value: string): bigint {
  const integerPart = value.split('.')[0];
  return BigInt(integerPart);
}

export interface BlockTrackerContract extends ethers.BaseContract {
  proposeBlock(
    _blockData: string,
    overrides?: ethers.Overrides
  ): Promise<ethers.ContractTransaction>;
}

const BUNDLER_ADDRESS = '0x42fA5d9E5b0B1c039b08853cF62f8E869e8E5bAf'; // For testing
const OYA_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000001";
const OYA_REWARD_AMOUNT = parseUnits('1', 18);

let cachedIntentions: any[] = [];

let mainnetAlchemy: Alchemy;
let sepoliaAlchemy: Alchemy;
let wallet: Wallet;
let blockTrackerContract: BlockTrackerContract;

let s: any;

initializeWalletAndContract()
  .then(() => {
    console.log("Block proposer initialization complete. Ready to handle proposals.");
  })
  .catch((error) => {
    console.error("Initialization failed:", error);
  });

async function buildBlockTrackerContract(): Promise<BlockTrackerContract> {
  const abiPath = path.join(__dirname, 'abi', 'BlockTracker.json');
  const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  const provider = (await sepoliaAlchemy.config.getProvider()) as unknown as ethers.Provider;
  const contract = new ethers.Contract(
    process.env.BLOCK_TRACKER_ADDRESS as string,
    contractABI,
    provider
  );
  return contract.connect(wallet as unknown as ethers.ContractRunner) as BlockTrackerContract;
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
    'SELECT nonce FROM blocks ORDER BY timestamp DESC LIMIT 1'
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
  const initialOyaBalance = parseUnits('111', 18);
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
      [vault, token, initialOyaBalance.toString()]
    );
  }
  console.log(`Vault ${vault} initialized with test tokens`);
}

async function mintRewards(addresses: string[]) {
  for (const address of addresses) {
    await initializeVault(address);
    const currentBalance = await getBalance(address, OYA_TOKEN_ADDRESS);
    const newBalance = currentBalance + safeBigInt(OYA_REWARD_AMOUNT.toString());
    await updateBalance(address, OYA_TOKEN_ADDRESS, newBalance);
  }
}

async function saveBlockData(blockData: any, cidToString: string) {
  await pool.query(
    'INSERT INTO blocks (block, nonce) VALUES ($1::jsonb, $2)',
    [JSON.stringify(blockData.block), blockData.nonce]
  );
  console.log('Block data saved to DB');

  await pool.query(
    'INSERT INTO cids (cid, nonce) VALUES ($1, $2)',
    [cidToString, blockData.nonce]
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

async function publishBlock(data: string, signature: string, from: string) {
  await ensureHeliaSetup();
  if (from !== BUNDLER_ADDRESS) {
    throw new Error("Unauthorized: Only the blockProposer can publish new blocks.");
  }
  const signerAddress = verifyMessage(data, signature);
  if (signerAddress !== from) {
    throw new Error("Signature verification failed");
  }
  const cid = await s.add(data);
  const cidToString = cid.toString();
  console.log('Block published to IPFS, CID:', cidToString);
  try {
    const tx = await blockTrackerContract.proposeBlock(cidToString);
    await sepoliaAlchemy.transact.waitForTransaction((tx as any).hash);
    console.log('Blockchain transaction successful');
  } catch (error) {
    console.error("Failed to propose block:", error);
    throw new Error("Blockchain transaction failed");
  }
  let blockData: any;
  try {
    blockData = JSON.parse(data);
  } catch (error) {
    console.error("Failed to parse block data:", error);
    throw new Error("Invalid block data");
  }
  if (!Array.isArray(blockData.block)) {
    console.error("Invalid block data structure:", blockData);
    throw new Error("Invalid block data structure");
  }
  try {
    await saveBlockData(blockData, cidToString);
  } catch (error) {
    console.error("Failed to save block/CID data:", error);
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
  try {
    await mintRewards(blockData.rewards.map((reward: any) => reward.vault));
    console.log('Rewards minted successfully');
  } catch (error) {
    console.error("Failed to mint rewards:", error);
    throw new Error("Minting rewards failed");
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
  if (from.toLowerCase() === BUNDLER_ADDRESS.toLowerCase()) {
    const largeBalance = parseUnits('1000000000000', 18);
    await updateBalance(from, token, safeBigInt(largeBalance.toString()));
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

async function handleIntention(intention: any, signature: string, from: string): Promise<any> {
  await initializeVault(from);
  const signerAddress = verifyMessage(JSON.stringify(intention), signature);
  if (signerAddress !== from) {
    console.log("Signature verification failed");
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
  } else {
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

async function createAndPublishBlock() {
  if (cachedIntentions.length === 0) {
    console.log("No intentions to propose.");
    return;
  }
  let nonce: number;
  try {
    nonce = await getLatestNonce();
  } catch (error) {
    console.error("Failed to get latest nonce:", error);
    return;
  }
  const block = cachedIntentions.map(({ execution }) => execution).flat();
  const rewardAddresses = [
    ...new Set(block.flatMap((execution: any) => execution.proof.map((proof: any) => proof.from)))
  ];
  const blockObject = {
    block: block,
    nonce: nonce,
    rewards: rewardAddresses.map((address: string) => ({
      vault: address,
      token: OYA_TOKEN_ADDRESS,
      amount: safeBigInt(OYA_REWARD_AMOUNT.toString()).toString(),
    })),
  };
  const blockProposerSignature = await wallet.signMessage(JSON.stringify(blockObject));
  try {
    await publishBlock(JSON.stringify(blockObject), blockProposerSignature, BUNDLER_ADDRESS);
  } catch (error) {
    console.error("Failed to publish block:", error);
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
  blockTrackerContract = await buildBlockTrackerContract();
}

const _getCachedIntentions = () => cachedIntentions;
const _clearCachedIntentions = () => {
  cachedIntentions = [];
};

export { 
  handleIntention, 
  createAndPublishBlock, 
  _getCachedIntentions, 
  _clearCachedIntentions 
};
