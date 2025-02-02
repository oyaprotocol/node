import axios from 'axios';
import { ethers } from 'ethers';
import { parseUnits, verifyMessage } from 'ethers/lib/utils';
import { Alchemy, Wallet, Network } from 'alchemy-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Constants (from your original oya-node code)
const BUNDLER_ADDRESS = '0x42fA5d9E5b0B1c039b08853cF62f8E869e8E5bAf'; // For testing
const OYA_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000001";
const OYA_REWARD_AMOUNT = parseUnits('1', 18); // 1 Oya token (BigNumber)

// Global variables
let cachedIntentions: any[] = [];

let mainnetAlchemy: Alchemy;
let sepoliaAlchemy: Alchemy;
let wallet: Wallet;
let blockTrackerContract: ethers.Contract;

// Variables for Helia/IPFS – will be initialized in setupHelia()
let s: any; // helper for adding data to IPFS

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
async function buildBlockTrackerContract(): Promise<ethers.Contract> {
  const abiPath = path.join(__dirname, 'abi', 'BlockTracker.json');
  const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  // Await the provider from sepoliaAlchemy.
  const provider = await sepoliaAlchemy.config.getProvider();
  const contract = new ethers.Contract(
    process.env.BUNDLE_TRACKER_ADDRESS as string,
    contractABI,
    provider
  );
  return contract.connect(wallet);
}

/**
 * Creates and returns Alchemy instances (mainnet and Sepolia) and an Alchemy Wallet.
 */
async function buildAlchemyInstances() {
  // Create Alchemy instance for Ethereum mainnet using the Network enum.
  const mainnet = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY as string,
    network: Network.ETH_MAINNET,
  });
  // Create Alchemy instance for the Sepolia network using the Network enum.
  const sepolia = new Alchemy({
    apiKey: process.env.ALCHEMY_API_KEY as string,
    network: Network.ETH_SEPOLIA,
  });
  // Ensure that the mainnet instance is fully initialized.
  await mainnet.core.getTokenMetadata("0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828");
  // Create a wallet using the Sepolia Alchemy instance.
  const walletInstance = new Wallet(process.env.TEST_PRIVATE_KEY as string, sepolia);
  return { mainnetAlchemy: mainnet, sepoliaAlchemy: sepolia, wallet: walletInstance };
}

/**
 * Called periodically to publish a block if any intentions have been cached.
 */
export async function createAndPublishBlock() {
  if (cachedIntentions.length === 0) {
    console.log("No intentions to block.");
    return;
  }
  let nonce: number;
  try {
    nonce = await getLatestNonce();
  } catch (error) {
    console.error("Failed to get latest nonce:", error);
    return;
  }
  // Flatten cached intentions into a block array.
  const block = cachedIntentions.map(({ execution }) => execution).flat();
  // Collect all unique reward addresses from proofs.
  const rewardAddresses = [
    ...new Set(block.flatMap((execution: any) => execution.proof.map((proof: any) => proof.from))),
  ];
  const blockObject = {
    block: block,
    nonce: nonce,
    rewards: rewardAddresses.map((address: string) => ({
      vault: address,
      token: OYA_TOKEN_ADDRESS,
      // Convert OYA_REWARD_AMOUNT to bigint then to string.
      amount: BigInt(OYA_REWARD_AMOUNT.toString()).toString(),
    })),
  };
  // Sign the block object.
  const blockProposerSignature = await wallet.signMessage(JSON.stringify(blockObject));
  try {
    await publishBlock(JSON.stringify(blockObject), blockProposerSignature, BUNDLER_ADDRESS);
  } catch (error) {
    console.error("Failed to publish block:", error);
    cachedIntentions = [];
    return;
  }
  // Clear the cached intentions after publishing.
  cachedIntentions = [];
}

/**
 * Returns the latest nonce from the API.
 */
async function getLatestNonce(): Promise<number> {
  try {
    const response = await axios.get(`${process.env.OYA_API_BASE_URL}/block`);
    const blocks = response.data;
    if (blocks.length === 0) return 0;
    return blocks[0].nonce + 1;
  } catch (error) {
    console.error("Failed to fetch blocks from Oya API:", error);
    throw new Error("API request failed");
  }
}

/**
 * Helper to retrieve the token decimals.
 */
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

/**
 * Processes an incoming intention.
 */
export async function handleIntention(intention: any, signature: string, from: string): Promise<any> {
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
    // Convert amountSent to bigint for comparison.
    const amountSentBigInt = BigInt(amountSent.toString());
    const response = await axios.get(`${process.env.OYA_API_BASE_URL}/balance/${from}/${tokenAddress}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    let currentBalance = response.data.length > 0 ? BigInt(response.data[0].balance) : 0n;
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

/**
 * Ensures that a vault (by address) is initialized in the API.
 */
async function initializeVault(vault: string) {
  try {
    const url = `${process.env.OYA_API_BASE_URL}/balance/${vault}`;
    const response = await axios.get(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.data.length === 0) {
      await initializeBalancesForVault(vault);
    }
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      await initializeBalancesForVault(vault);
    } else {
      console.error(`Failed to initialize vault ${vault}:`, error);
      throw new Error("Vault initialization failed");
    }
  }
}

/**
 * Initializes the balances for a given vault.
 */
async function initializeBalancesForVault(vault: string) {
  const initialBalance18 = parseUnits('10000', 18);
  const initialBalance6 = parseUnits('1000000', 6);
  const initialOyaBalance = parseUnits('111', 18);
  const supportedTokens18: string[] = [];
  const supportedTokens6: string[] = ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"];
  const oyaTokens: string[] = ["0x0000000000000000000000000000000000000001"];
  for (const token of supportedTokens18) {
    await axios.post(
      `${process.env.OYA_API_BASE_URL}/balance`,
      { vault, token, balance: initialBalance18.toString() },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  for (const token of supportedTokens6) {
    await axios.post(
      `${process.env.OYA_API_BASE_URL}/balance`,
      { vault, token, balance: initialBalance6.toString() },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  for (const token of oyaTokens) {
    await axios.post(
      `${process.env.OYA_API_BASE_URL}/balance`,
      { vault, token, balance: initialOyaBalance.toString() },
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  console.log(`Vault ${vault} initialized with test tokens`);
}

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

/**
 * Mints rewards (1 Oya token) to the specified addresses.
 */
async function mintRewards(addresses: string[]) {
  try {
    for (const address of addresses) {
      await initializeVault(address);
      let currentBalance: bigint;
      try {
        const response = await axios.get(`${process.env.OYA_API_BASE_URL}/balance/${address}/${OYA_TOKEN_ADDRESS}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        currentBalance = response.data.length > 0 ? BigInt(response.data[0].balance) : 0n;
      } catch (error: any) {
        if (error.response && error.response.status === 404) {
          currentBalance = 0n;
        } else {
          throw error;
        }
      }
      const newBalance = currentBalance + BigInt(OYA_REWARD_AMOUNT.toString());
      await axios.post(
        `${process.env.OYA_API_BASE_URL}/balance`,
        { vault: address, token: OYA_TOKEN_ADDRESS, balance: newBalance.toString() },
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error("Failed to mint rewards:", error);
    throw new Error("Minting rewards failed");
  }
}

/**
 * Publishes a block. This function:
 *  1. Ensures Helia/IPFS is set up.
 *  2. Signs and verifies the block.
 *  3. Uploads block data to IPFS.
 *  4. Calls the blockchain contract.
 *  5. Notifies the API (by calling /block, /cid, etc.).
 *  6. Processes balance updates and nonce changes.
 */
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
    await sepoliaAlchemy.transact.waitForTransaction(tx.hash);
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
    await axios.post(`${process.env.OYA_API_BASE_URL}/block`, blockData, {
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('Block data sent to Oya API');
  } catch (error) {
    console.error("Failed to send block data to Oya API:", error);
    throw new Error("API request failed");
  }
  try {
    await axios.post(
      `${process.env.OYA_API_BASE_URL}/cid`,
      { cid: cidToString, nonce: blockData.nonce },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('CID sent to Oya API');
  } catch (error) {
    console.error("Failed to send CID to Oya API:", error);
    throw new Error("API request failed");
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
  try {
    for (const execution of blockData.block) {
      const vaultNonce = execution.intention.nonce;
      const vault = execution.intention.from;
      await axios.post(
        `${process.env.OYA_API_BASE_URL}/nonce/${vault}`,
        { nonce: vaultNonce },
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error(`Failed to set nonce for vaults in the block:`, error);
    throw new Error("Nonce update failed");
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
  const heliaModule = await import('helia');
  const { createHelia } = heliaModule;
  const stringsModule = await import('@helia/strings');
  const { strings } = stringsModule;
  const heliaNode = await createHelia();
  s = strings(heliaNode);
}

/**
 * Updates balances for a given transfer.
 */
async function updateBalances(from: string, to: string, token: string, amount: string) {
  try {
    await initializeVault(from);
    await initializeVault(to);
    const amountBigInt = BigInt(amount);
    let fromBalance: bigint;
    if (from.toLowerCase() === BUNDLER_ADDRESS.toLowerCase()) {
      const largeBalance = parseUnits('1000000000000', 18);
      try {
        await axios.post(
          `${process.env.OYA_API_BASE_URL}/balance`,
          { vault: from, token, balance: largeBalance.toString() },
          { headers: { 'Content-Type': 'application/json' } }
        );
        console.log(`Block proposer balance updated to a large amount for token ${token}`);
      } catch (error: any) {
        if (error.response && error.response.status === 404) {
          console.log(`Initializing block proposer vault for token ${token}`);
          await initializeBalancesForVault(from);
        } else {
          console.error("Failed to update block proposer balance:", error);
          throw new Error("Balance update failed for block proposer");
        }
      }
    }
    const fromResponse = await axios.get(`${process.env.OYA_API_BASE_URL}/balance/${from}/${token}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    fromBalance = fromResponse.data.length > 0 ? BigInt(fromResponse.data[0].balance) : 0n;
    let toBalance: bigint;
    try {
      const toResponse = await axios.get(`${process.env.OYA_API_BASE_URL}/balance/${to}/${token}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      toBalance = toResponse.data.length > 0 ? BigInt(toResponse.data[0].balance) : 0n;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        toBalance = 0n;
      } else {
        console.error("Failed to retrieve 'to' vault balance:", error);
        throw new Error("Balance retrieval failed for 'to' vault");
      }
    }
    const newFromBalance = fromBalance - amountBigInt;
    const newToBalance = toBalance + amountBigInt;
    if (newFromBalance < 0n) {
      throw new Error('Insufficient balance in from vault');
    }
    console.log(`New balance for from vault (${from}): ${newFromBalance.toString()}`);
    console.log(`New balance for to vault (${to}): ${newToBalance.toString()}`);
    await axios.post(
      `${process.env.OYA_API_BASE_URL}/balance`,
      { vault: from, token, balance: newFromBalance.toString() },
      { headers: { 'Content-Type': 'application/json' } }
    );
    await axios.post(
      `${process.env.OYA_API_BASE_URL}/balance`,
      { vault: to, token, balance: newToBalance.toString() },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log(`Balances updated: from ${from} to ${to} for token ${token} amount ${amount}`);
  } catch (error) {
    console.error("Failed to update balances:", error);
    throw new Error("Balance update failed");
  }
}

module.exports = {
  handleIntention,
  createAndPublishBlock,
  _getCachedIntentions: () => cachedIntentions,
  _clearCachedIntentions: () => {
    cachedIntentions = [];
  },
};
