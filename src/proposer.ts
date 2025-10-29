/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                           Bundle Proposer                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Handles the bundle proposer logic for the Oya Protocol.
 * Manages intention verification, bundle creation, IPFS uploads, and blockchain interactions.
 *
 * Key responsibilities:
 * - Verify intention signatures using ethers.js
 * - Cache intentions until bundle creation
 * - Compress and upload bundles to IPFS via Helia
 * - Submit bundle CIDs to the BundleTracker smart contract
 * - Update database with bundles, balances, and nonces
 *
 * @packageDocumentation
 */

import { ethers, parseUnits, verifyMessage } from 'ethers'
import { Alchemy, Wallet, Network } from 'alchemy-sdk'
import { createHelia } from 'helia'
import { strings } from '@helia/strings'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { pool } from './db.js'
import { fileURLToPath } from 'url'
import zlib from 'zlib'
import { promisify } from 'util'
import { getEnvConfig } from './utils/env.js'
import { createLogger, diagnostic } from './utils/logger.js'
import { resolveIntentionENS } from './utils/ensResolver.js'
import {
	getControllersForVault,
	getVaultsForController,
	updateVaultControllers,
} from './utils/vaults.js'
import { PROPOSER_VAULT_ID, SEED_CONFIG } from './config/seedingConfig.js'
import {
	validateIntention,
	validateAddress,
	validateSignature,
	validateId,
} from './utils/validator.js'
import {
	pinBundleToFilecoin,
	initializeFilecoinPin,
} from './utils/filecoinPin.js'
import { sendWebhook } from './utils/webhook.js'
import {
	insertDepositIfMissing,
	findDepositWithSufficientRemaining,
	createAssignmentEventTransactional,
} from './utils/deposits.js'
import { handleAssignDeposit } from './utils/intentionHandlers/AssignDeposit.js'
import { handleCreateVault } from './utils/intentionHandlers/CreateVault.js'
import type {
	Intention,
	BundleData,
	ExecutionObject,
	IntentionInput,
	IntentionOutput,
} from './types/core.js'

const gzip = promisify(zlib.gzip)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

/** Logger instance for proposer module */
const logger = createLogger('Proposer')

/** Cached environment variables for frequently used values */
const {
	PROPOSER_ADDRESS,
	BUNDLE_TRACKER_ADDRESS,
	VAULT_TRACKER_ADDRESS,
	ALCHEMY_API_KEY,
	PROPOSER_KEY,
} = getEnvConfig()

/** Bundle cycle counter for diagnostics */
let bundleCycleCount = 0
let lastSuccessfulBundleTime = 0

/**
 * Safely converts a string to BigInt, handling decimal values.
 * Truncates to integer part to avoid BigInt decimal errors.
 */
function safeBigInt(value: string): bigint {
	const integerPart = value.split('.')[0]
	return BigInt(integerPart)
}

/**
 * Contract interface for the BundleTracker on Sepolia.
 */
export interface BundleTrackerContract extends ethers.BaseContract {
	proposeBundle(
		_bundleData: string,
		overrides?: ethers.Overrides
	): Promise<ethers.ContractTransactionResponse>
}

/**
 * Contract interface for the VaultTracker on Sepolia.
 */
export interface VaultTrackerContract extends ethers.BaseContract {
	createVault(
		_controller: string,
		overrides?: ethers.Overrides
	): Promise<ethers.ContractTransactionResponse>
	/** Returns the next unassigned vault ID (acts as current vault count). */
	nextVaultId(): Promise<bigint>
}

let cachedIntentions: ExecutionObject[] = []

let mainnetAlchemy: Alchemy
let sepoliaAlchemy: Alchemy
let wallet: Wallet
let bundleTrackerContract: BundleTrackerContract
let vaultTrackerContract: VaultTrackerContract

let s: ReturnType<typeof strings>

// Initialization flag
let isInitialized = false

// ~7 days at ~12s blocks
const APPROX_7D_BLOCKS = 50400
/**
 * Validates that a vault ID exists on-chain by checking it is within range
 * [1, nextVaultId - 1]. Throws if invalid or out of range.
 */
export async function validateVaultIdOnChain(vaultId: number): Promise<void> {
	// Basic sanity
	if (!Number.isInteger(vaultId) || vaultId < 1) {
		throw new Error('Invalid vault ID')
	}
	// Ensure contracts are initialized
	if (!vaultTrackerContract) {
		throw new Error('VaultTracker contract not initialized')
	}
	const nextId = await vaultTrackerContract.nextVaultId()
	const nextIdNumber = Number(nextId)
	if (!Number.isFinite(nextIdNumber)) {
		throw new Error('Could not determine nextVaultId from chain')
	}
	if (vaultId >= nextIdNumber) {
		throw new Error('Vault ID does not exist on-chain')
	}
}

/**
 * Computes block range hex strings for Alchemy getAssetTransfers requests,
 * defaulting to a ~7 day lookback if not provided.
 */
async function computeBlockRange(
	fromBlockHex?: string,
	toBlockHex?: string
): Promise<{ fromBlockHex: string; toBlockHex: string }> {
	const provider = (await sepoliaAlchemy.config.getProvider()) as unknown as {
		getBlockNumber: () => Promise<number>
	}
	const latest = await provider.getBlockNumber()
	const resolvedTo = toBlockHex ?? '0x' + latest.toString(16)
	const fromBlock = Math.max(0, latest - APPROX_7D_BLOCKS)
	const resolvedFrom = fromBlockHex ?? '0x' + fromBlock.toString(16)
	return { fromBlockHex: resolvedFrom, toBlockHex: resolvedTo }
}

/**
 * Generic discovery for deposits into VaultTracker using Alchemy's decoded
 * asset transfers. Supports ERC-20 and ETH (internal/external) categories.
 */

async function discoverAndIngestDeposits(params: {
	controller: string
	chainId: number
	categories: Array<'erc20' | 'internal' | 'external'>
	token?: string
	fromBlockHex?: string
	toBlockHex?: string
}): Promise<void> {
	const controller = validateAddress(params.controller, 'controller')

	if (!isInitialized) {
		throw new Error('Proposer not initialized')
	}
	if (params.chainId !== 11155111) {
		throw new Error('Unsupported chain_id for discovery')
	}

	const { fromBlockHex, toBlockHex } = await computeBlockRange(
		params.fromBlockHex,
		params.toBlockHex
	)

	let pageKey: string | undefined = undefined
	do {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const req: any = {
			fromBlock: fromBlockHex,
			toBlock: toBlockHex,
			fromAddress: controller,
			toAddress: VAULT_TRACKER_ADDRESS,
			category: params.categories,
			withMetadata: true,
			excludeZeroValue: true,
		}
		if (params.token) {
			req.contractAddresses = [validateAddress(params.token, 'token')]
		}
		if (pageKey) req.pageKey = pageKey

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res: any = await sepoliaAlchemy.core.getAssetTransfers(req)
		const transfers = res?.transfers ?? []
		for (const t of transfers) {
			const txHash: string = t.hash
			const raw = t.rawContract || {}
			const rawAddr: string | undefined = raw.address
			const rawValueHex: string | undefined = raw.value
			if (!rawValueHex) continue

			// Determine token address: ERC-20 uses raw.address; ETH uses zero address
			const tokenAddr = rawAddr ?? '0x0000000000000000000000000000000000000000'

			// Deterministic transfer UID to avoid dependency on provider-specific IDs
			const transferUid = `${txHash}:${tokenAddr}:${rawValueHex}`
			const amountWei = BigInt(rawValueHex).toString()

			await insertDepositIfMissing({
				tx_hash: txHash,
				transfer_uid: transferUid,
				chain_id: params.chainId,
				depositor: t.from,
				token: tokenAddr,
				amount: amountWei,
			})
		}
		pageKey = res?.pageKey
	} while (pageKey)
}

/**
 * Validates structural and fee constraints for AssignDeposit intentions.
 * Rules:
 * - inputs.length === outputs.length
 * - For each index i: asset/amount/chain_id must match between input and output
 * - outputs[i].to must be provided (no to_external) and must be a valid on-chain vault ID
 * - Fees must be zero:
 *   - totalFee amounts must all be "0"
 *   - proposerTip must be empty
 *   - protocolFee must be empty
 *   - agentTip must be undefined or empty
 */

export async function validateAssignDepositStructure(
	intention: Intention
): Promise<void> {
	if (!Array.isArray(intention.inputs) || !Array.isArray(intention.outputs)) {
		throw new Error('AssignDeposit requires inputs and outputs arrays')
	}
	if (intention.inputs.length !== intention.outputs.length) {
		throw new Error(
			'AssignDeposit requires 1:1 mapping between inputs and outputs'
		)
	}

	// Zero-fee enforcement
	if (!Array.isArray(intention.totalFee) || intention.totalFee.length === 0) {
		throw new Error('AssignDeposit requires totalFee with zero amount')
	}
	const allTotalZero = intention.totalFee.every((f) => f.amount === '0')
	if (!allTotalZero) {
		throw new Error('AssignDeposit totalFee must be zero')
	}
	if (
		Array.isArray(intention.proposerTip) &&
		intention.proposerTip.length > 0
	) {
		throw new Error('AssignDeposit proposerTip must be empty')
	}
	if (
		Array.isArray(intention.protocolFee) &&
		intention.protocolFee.length > 0
	) {
		throw new Error('AssignDeposit protocolFee must be empty')
	}
	if (Array.isArray(intention.agentTip) && intention.agentTip.length > 0) {
		throw new Error('AssignDeposit agentTip must be empty if provided')
	}

	for (let i = 0; i < intention.inputs.length; i++) {
		const input: IntentionInput = intention.inputs[i]
		const output: IntentionOutput = intention.outputs[i]

		if (!output || (output.to === undefined && !output.to_external)) {
			throw new Error('AssignDeposit requires outputs[].to (vault ID)')
		}
		if (output.to_external !== undefined) {
			throw new Error('AssignDeposit does not support to_external')
		}

		if (input.asset.toLowerCase() !== output.asset.toLowerCase()) {
			throw new Error('AssignDeposit input/output asset mismatch at index ' + i)
		}
		if (input.amount !== output.amount) {
			throw new Error(
				'AssignDeposit input/output amount mismatch at index ' + i
			)
		}
		if (input.chain_id !== output.chain_id) {
			throw new Error(
				'AssignDeposit input/output chain_id mismatch at index ' + i
			)
		}

		// Validate on-chain vault existence
		await validateVaultIdOnChain(Number(output.to))
	}
}

/**
 * Discovers ERC-20 deposits made by `controller` into the VaultTracker and
 * ingests them into the local `deposits` table. Uses Alchemy's decoded
 * getAssetTransfers API for reliability and simplicity.
 *
 * If fromBlock/toBlock are not provided, computes a default lookback window
 * of ~7 days by subtracting ~50,400 blocks from the latest block.
 */
async function discoverAndIngestErc20Deposits(params: {
	controller: string
	token: string
	chainId: number
	fromBlockHex?: string
	toBlockHex?: string
}): Promise<void> {
	await discoverAndIngestDeposits({
		controller: params.controller,
		chainId: params.chainId,
		categories: ['erc20'],
		token: params.token,
		fromBlockHex: params.fromBlockHex,
		toBlockHex: params.toBlockHex,
	})
}

/**
 * Discovers ETH (internal) deposits made by `controller` into the VaultTracker
 * and ingests them into the local `deposits` table via idempotent inserts.
 */
async function discoverAndIngestEthDeposits(params: {
	controller: string
	chainId: number
	fromBlockHex?: string
	toBlockHex?: string
}): Promise<void> {
	await discoverAndIngestDeposits({
		controller: params.controller,
		chainId: params.chainId,
		categories: ['internal', 'external'],
		fromBlockHex: params.fromBlockHex,
		toBlockHex: params.toBlockHex,
	})
}

/**
 * Initializes the BundleTracker contract with ABI and provider.
 * Connects the wallet for transaction signing.
 */
async function buildBundleTrackerContract(): Promise<BundleTrackerContract> {
	const abiPath = path.join(__dirname, 'abi', 'BundleTracker.json')
	const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'))
	const provider =
		(await sepoliaAlchemy.config.getProvider()) as unknown as ethers.Provider
	const contract = new ethers.Contract(
		BUNDLE_TRACKER_ADDRESS,
		contractABI,
		provider
	)
	return contract.connect(
		wallet as unknown as ethers.ContractRunner
	) as BundleTrackerContract
}

/**
 * Initializes the VaultTracker contract with ABI and provider.
 * Connects the wallet for transaction signing.
 */
async function buildVaultTrackerContract(): Promise<VaultTrackerContract> {
	const abiPath = path.join(__dirname, 'abi', 'VaultTracker.json')
	const contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'))
	const provider =
		(await sepoliaAlchemy.config.getProvider()) as unknown as ethers.Provider
	const contract = new ethers.Contract(
		VAULT_TRACKER_ADDRESS,
		contractABI,
		provider
	)
	return contract.connect(
		wallet as unknown as ethers.ContractRunner
	) as VaultTrackerContract
}

/**
 * Sets up Alchemy SDK instances for mainnet and Sepolia.
 * Initializes wallet with private key for blockchain transactions.
 */
async function buildAlchemyInstances() {
	const mainnet = new Alchemy({
		apiKey: ALCHEMY_API_KEY,
		network: Network.ETH_MAINNET,
	})
	const sepolia = new Alchemy({
		apiKey: ALCHEMY_API_KEY,
		network: Network.ETH_SEPOLIA,
	})
	await mainnet.core.getTokenMetadata(
		'0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828'
	)
	const walletInstance = new Wallet(PROPOSER_KEY, sepolia)
	return {
		mainnetAlchemy: mainnet,
		sepoliaAlchemy: sepolia,
		wallet: walletInstance,
	}
}

/**
 * Retrieves the latest bundle nonce from the database.
 * Returns 0 if no bundles exist yet.
 */
async function getLatestNonce(): Promise<number> {
	const result = await pool.query(
		'SELECT nonce FROM bundles ORDER BY timestamp DESC LIMIT 1'
	)
	if (result.rows.length === 0) return 0
	return result.rows[0].nonce + 1
}

/**
 * Retrieves the latest nonce for a specific vault from the database.
 * Returns 0 if no nonce is found for the vault.
 */
async function getVaultNonce(vaultId: number | string): Promise<number> {
    const result = await pool.query('SELECT nonce FROM vaults WHERE vault = $1', [
        String(vaultId),
    ])
	if (result.rows.length === 0) {
		return 0
	}
	return result.rows[0].nonce
}

/**
 * Fetches token decimals from mainnet for proper amount calculations.
 * Returns 18 for ETH (zero address).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getTokenDecimals(tokenAddress: string): Promise<bigint> {
	try {
		if (tokenAddress === '0x0000000000000000000000000000000000000000') {
			return 18n
		}
		const tokenMetadata =
			await mainnetAlchemy.core.getTokenMetadata(tokenAddress)
		if (
			tokenMetadata.decimals === null ||
			tokenMetadata.decimals === undefined
		) {
			logger.error(
				'Token metadata decimals is missing for token:',
				tokenAddress
			)
			throw new Error('Token decimals missing')
		}
		return BigInt(tokenMetadata.decimals)
	} catch (error) {
		logger.error(`Failed to get token metadata for ${tokenAddress}:`, error)
		throw new Error('Failed to retrieve token decimals')
	}
}

/**
 * Fetches token decimals from Sepolia for proper amount calculations.
 * Returns 18 for ETH (zero address).
 */
async function getSepoliaTokenDecimals(tokenAddress: string): Promise<bigint> {
	try {
		if (tokenAddress === '0x0000000000000000000000000000000000000000') {
			return 18n
		}
		const tokenMetadata =
			await sepoliaAlchemy.core.getTokenMetadata(tokenAddress)
		if (
			tokenMetadata.decimals === null ||
			tokenMetadata.decimals === undefined
		) {
			logger.error(
				'Token metadata decimals is missing for token:',
				tokenAddress
			)
			throw new Error('Token decimals missing')
		}
		return BigInt(tokenMetadata.decimals)
	} catch (error) {
		logger.error(
			`Failed to get Sepolia token metadata for ${tokenAddress}:`,
			error
		)
		throw new Error('Failed to retrieve Sepolia token decimals')
	}
}

/**
 * Gets the current balance for a vault/token pair from the database.
 * Returns 0n if no balance exists.
 */
async function getBalance(
	vault: string | number,
	token: string
): Promise<bigint> {
	const result = await pool.query(
		'SELECT balance FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2) ORDER BY timestamp DESC LIMIT 1',
		[vault.toString(), token]
	)
	if (result.rows.length === 0) return 0n
	return safeBigInt(result.rows[0].balance.toString())
}

/**
 * Updates or inserts a balance record for a vault/token pair.
 * Handles case-insensitive vault and token addresses.
 */
async function updateBalance(
	vault: string | number,
	token: string,
	newBalance: bigint
): Promise<void> {
	const validatedToken = validateAddress(token, 'token')
	const vaultIdentifier = vault.toString()

	if (newBalance < 0n) {
		throw new Error('Balance cannot be negative')
	}
	const result = await pool.query(
		'SELECT * FROM balances WHERE vault = $1 AND token = $2',
		[vaultIdentifier, validatedToken]
	)
	if (result.rows.length === 0) {
		await pool.query(
			'INSERT INTO balances (vault, token, balance) VALUES ($1, $2, $3)',
			[vaultIdentifier, validatedToken, newBalance.toString()]
		)
	} else {
		await pool.query(
			'UPDATE balances SET balance = $1, timestamp = CURRENT_TIMESTAMP WHERE vault = $2 AND token = $3',
			[newBalance.toString(), vaultIdentifier, validatedToken]
		)
	}
}

/**
 * Seeds a new vault with initial token balances by transferring them from the
 * proposer's vault.
 * This is now a fallback/manual method. The primary path is via createAndSubmitSeedingIntention.
 */
/*
async function initializeBalancesForVault(newVaultId: number): Promise<void> {
	logger.info(
		`Directly seeding new vault (ID: ${newVaultId}) from proposer vault (ID: ${PROPOSER_VAULT_ID.value})...`
	)

	for (const token of SEED_CONFIG) {
		try {
			const tokenDecimals = await getSepoliaTokenDecimals(token.address)
			const seedAmount = parseUnits(token.amount, Number(tokenDecimals))

			const proposerBalance = await getBalance(
				PROPOSER_VAULT_ID.value,
				token.address
			)

			if (proposerBalance < seedAmount) {
				logger.warn(
					`- Insufficient proposer balance for ${token.address}. Have: ${proposerBalance}, Need: ${seedAmount}. Skipping.`
				)
				continue
			}

			// Use the single, updated function for the transfer
			await updateBalances(
				PROPOSER_VAULT_ID.value,
				newVaultId,
				token.address,
				seedAmount.toString()
			)

			logger.info(
				`- Successfully seeded vault ${newVaultId} with ${token.amount} of token ${token.address}`
			)
		} catch (error) {
			logger.error(
				`- Failed to seed vault ${newVaultId} with token ${token.address}:`,
				error
			)
		}
	}
}
*/

/**
 * Records proposer activity in the database.
 * Updates last_seen timestamp for monitoring.
 */
async function saveProposerData(proposer: string): Promise<void> {
	// Validate proposer address
	const validatedProposer = validateAddress(proposer, 'proposer')

	await pool.query(
		`INSERT INTO proposers (proposer, last_seen)
     VALUES ($1, CURRENT_TIMESTAMP)
     ON CONFLICT (proposer)
     DO UPDATE SET last_seen = EXCLUDED.last_seen`,
		[validatedProposer]
	)
	logger.info(`Proposer data saved/updated for ${validatedProposer}`)
}

/**
 * Persists bundle data, CID, and vault nonces to the database.
 * Handles bundle storage as BYTEA and CID tracking.
 */
async function saveBundleData(
	bundleData: BundleData,
	cidToString: string,
	proposerSignature: string
) {
	// Convert the bundle (JSON) to a Buffer for the BYTEA column
	const bundleBuffer = Buffer.from(JSON.stringify(bundleData.bundle), 'utf8')
	await pool.query(
		`INSERT INTO bundles (bundle, nonce, proposer, signature, ipfs_cid)
     VALUES ($1, $2, $3, $4, $5)`,
		[
			bundleBuffer,
			bundleData.nonce,
			PROPOSER_ADDRESS,
			proposerSignature,
			cidToString,
		]
	)
	logger.info('Bundle data saved to DB')

	// Also insert into the cids table, now including the proposer
	await pool.query(
		'INSERT INTO cids (cid, nonce, proposer) VALUES ($1, $2, $3)',
		[cidToString, bundleData.nonce, PROPOSER_ADDRESS]
	)
	logger.info('CID saved to DB')

	if (Array.isArray(bundleData.bundle)) {
		for (const execution of bundleData.bundle) {
			const vaultNonce = execution.intention.nonce
            const vault = execution.from
            const updateResult = await pool.query(
                `UPDATE vaults SET nonce = $2 WHERE vault = $1`,
                [String(vault), vaultNonce]
            )
            if (updateResult.rowCount === 0) {
                logger.warn(`Nonce update skipped: vault ${String(vault)} does not exist`)
            }
		}
	}
}

/**
 * Publishes a bundle to IPFS and submits the CID to the blockchain.
 * Compresses data with gzip before IPFS upload.
 */
async function publishBundle(data: string, signature: string, from: string) {
	const startTime = Date.now()
	await ensureHeliaSetup()

	// Validate and normalize the from address
	const validatedFrom = validateAddress(from, 'from')
	const validatedSignature = validateSignature(signature)

	const originalSize = data.length
	logger.info(
		'Publishing bundle. Data length (before compression):',
		originalSize
	)

	diagnostic.info('Bundle publish started', {
		dataSize: originalSize,
		from: validatedFrom,
		timestamp: startTime,
	})

	if (validatedFrom !== PROPOSER_ADDRESS.toLowerCase()) {
		throw new Error('Unauthorized: Only the proposer can publish new bundles.')
	}

	const signerAddress = verifyMessage(data, validatedSignature)
	logger.info('Recovered signer address:', signerAddress)
	if (signerAddress.toLowerCase() !== validatedFrom) {
		logger.error('Expected signer:', validatedFrom, 'but got:', signerAddress)
		throw new Error('Signature verification failed')
	}

	let compressedData: Buffer
	try {
		const compressionStart = Date.now()
		logger.info('Starting compression of bundle data...')
		compressedData = await gzip(data)

		diagnostic.debug('Compression metrics', {
			originalSize,
			compressedSize: compressedData.length,
			compressionRatio: (compressedData.length / originalSize).toFixed(3),
			compressionTime: Date.now() - compressionStart,
		})

		logger.info(
			'Compression successful. Compressed data length:',
			compressedData.length
		)
	} catch (error) {
		diagnostic.error('Compression failed', {
			error: error instanceof Error ? error.message : String(error),
		})
		logger.error('Compression failed:', error)
		throw new Error('Bundle data compression failed')
	}

	const ipfsUploadStart = Date.now()
	const cid = await s.add(compressedData.toString('base64'))
	const cidToString = cid.toString()

	diagnostic.info('IPFS upload completed', {
		cid: cidToString,
		uploadTime: Date.now() - ipfsUploadStart,
		compressedSize: compressedData.length,
	})

	logger.info('Bundle published to IPFS, CID:', cidToString)

	// Ensure initialization before using contract
	if (!isInitialized) {
		throw new Error('Proposer not initialized. Call initializeProposer() first')
	}

	try {
		const tx = await bundleTrackerContract.proposeBundle(cidToString)
		await sepoliaAlchemy.transact.waitForTransaction(
			(tx as ethers.ContractTransactionResponse).hash
		)
		logger.info('Blockchain transaction successful')
		// Save proposer data after successful blockchain transaction.
		await saveProposerData(PROPOSER_ADDRESS)
	} catch (error) {
		logger.error('Failed to propose bundle:', error)
		throw new Error('Blockchain transaction failed')
	}

	let bundleData: BundleData
	try {
		bundleData = JSON.parse(data)
		logger.info('Bundle data parsed successfully')
	} catch (error) {
		logger.error('Failed to parse bundle data:', error)
		throw new Error('Invalid bundle data')
	}
	if (!Array.isArray(bundleData.bundle)) {
		logger.error('Invalid bundle data structure:', bundleData)
		throw new Error('Invalid bundle data structure')
	}
	try {
		await saveBundleData(bundleData, cidToString, validatedSignature)
	} catch (error) {
		logger.error('Failed to save bundle/CID data:', error)
		throw new Error('Database operation failed')
	}

	// Pin to Filecoin asynchronously (non-blocking)
	const nonce = bundleData.nonce
	pinBundleToFilecoin(cidToString, compressedData, nonce).catch((err) => {
		logger.warn('Filecoin pinning failed (bundle still valid):', err.message)
	})
	try {
		for (const execution of bundleData.bundle) {
			if (!Array.isArray(execution.proof)) {
				logger.error('Invalid proof structure in execution:', execution)
				throw new Error('Invalid proof structure')
			}

			if (execution.intention?.action === 'AssignDeposit') {
				// Publish-time crediting for AssignDeposit
				for (const proof of execution.proof) {
					// Create a transactional assignment event (partial or full)
					await createAssignmentEventTransactional(
						proof.deposit_id,
						proof.amount,
						String(proof.to)
					)

					// Credit the destination vault balance
					const current = await getBalance(proof.to, proof.token)
					const increment = safeBigInt(proof.amount)
					const newBalance = current + increment
					await updateBalance(proof.to, proof.token, newBalance)
				}
			} else {
				for (const proof of execution.proof) {
					await updateBalances(proof.from, proof.to, proof.token, proof.amount)
				}
			}
		}
		logger.info('Balances updated successfully')
	} catch (error) {
		logger.error('Failed to update balances:', error)
		throw new Error('Balance update failed')
	}
	try {
		const { WEBHOOK_URL, WEBHOOK_SECRET } = getEnvConfig()

		if (WEBHOOK_URL && WEBHOOK_SECRET) {
			const payload = {
				type: 'BUNDLE_PROPOSED',
				bundle: bundleData.bundle,
				cid: cidToString,
				nonce: bundleData.nonce,
				createdAt: Date.now(),
			}
			await sendWebhook(payload)
			logger.info('BUNDLE_PROPOSED webhook sent successfully')
		} else {
			logger.warn(
				'Webhook URL or secret not configured, skipping webhook delivery'
			)
		}
	} catch (error) {
		logger.error('Failed to send webhook:', error)
		throw new Error('Webhook delivery failed')
	}
	return cid
}

/**
 * Ensures Helia IPFS node is initialized before use.
 */
async function ensureHeliaSetup() {
	if (!s) {
		await setupHelia()
	}
}

/**
 * Creates and configures the Helia IPFS node with string codec.
 */
async function setupHelia() {
	const heliaNode = await createHelia()
	s = strings(heliaNode)
}

/**
 * Processes balance changes from an intention proof.
 * Handles transfers between vaults with balance validation.
 */
async function updateBalances(
	from: number, // from is now always a vault ID
	to: string | number,
	token: string,
	amount: string
) {
	const validatedFrom = validateId(from, 'from')
	const validatedToken = validateAddress(token, 'token')
	const amountBigInt = safeBigInt(amount)

	const fromBalance = await getBalance(validatedFrom, validatedToken)
	const toBalance = await getBalance(to, validatedToken)
	const newFromBalance = fromBalance - amountBigInt
	const newToBalance = toBalance + amountBigInt
	if (newFromBalance < 0n) {
		throw new Error('Insufficient balance in from vault')
	}
	logger.info(
		`New balance for from vault (${validatedFrom}): ${newFromBalance.toString()}`
	)
	logger.info(`New balance for to vault (${to}): ${newToBalance.toString()}`)
	await updateBalance(validatedFrom, validatedToken, newFromBalance)
	await updateBalance(to, validatedToken, newToBalance)
	logger.info(
		`Balances updated: from ${validatedFrom} to ${to} for token ${validatedToken} amount ${amount}`
	)
}

/**
 * Creates and submits a signed intention to seed a new vault with initial tokens.
 * This creates an auditable record of the seeding transaction.
 */
async function createAndSubmitSeedingIntention(
	newVaultId: number
): Promise<void> {
	logger.info(`Creating seeding intention for new vault ${newVaultId}...`)

	const inputs: IntentionInput[] = []
	const outputs: IntentionOutput[] = []
	const tokenSummary = SEED_CONFIG.map(
		(token) => `${token.amount} ${token.symbol}`
	).join(', ')
	const action = `Transfer ${tokenSummary} to vault #${newVaultId}`

	for (const token of SEED_CONFIG) {
		const tokenDecimals = await getSepoliaTokenDecimals(token.address)
		const seedAmount = parseUnits(token.amount, Number(tokenDecimals))

		inputs.push({
			asset: token.address,
			amount: seedAmount.toString(),
			from: PROPOSER_VAULT_ID.value,
			chain_id: 11155111, // Sepolia
		})

		outputs.push({
			asset: token.address,
			amount: seedAmount.toString(),
			to: newVaultId,
			chain_id: 11155111, // Sepolia
		})
	}

	const currentNonce = await getVaultNonce(PROPOSER_VAULT_ID.value)
	const nextNonce = currentNonce + 1
	const feeAmountInWei = parseUnits('0.0001', 18).toString()

	const intention: Intention = {
		action: action,
		nonce: nextNonce,
		expiry: Math.floor(Date.now() / 1000) + 300, // 5 minute expiry
		inputs,
		outputs,
		totalFee: [
			{
				asset: ['ETH'],
				amount: '0.0001',
			},
		],
		proposerTip: [], // 0 tip for internal seeding
		protocolFee: [
			{
				asset: '0x0000000000000000000000000000000000000000', // ETH
				amount: feeAmountInWei,
				chain_id: 11155111, // Sepolia
			},
		],
	}

	// Proposer signs the intention with its wallet
	const signature = await wallet.signMessage(JSON.stringify(intention))

	// Submit the intention to be processed and bundled
	// The controller is the proposer's own address
	await handleIntention(intention, signature, PROPOSER_ADDRESS)

	logger.info(
		`Successfully submitted seeding intention for vault ${newVaultId}.`
	)
}

/**
 * Verifies and processes an incoming intention.
 * Validates signature, checks balances, and caches for bundling.
 */
async function handleIntention(
	intention: Intention,
	signature: string,
	controller: string
): Promise<ExecutionObject> {
	const startTime = Date.now()

	/**
	 * STEP 1: Basic validation of signature format and controller address
	 * - Validates signature is properly formatted (0x + hex)
	 * - Validates controller is a valid Ethereum address
	 * - Does NOT validate intention fields yet (may contain ENS names)
	 */
	const validatedSignature = validateSignature(signature)
	const validatedController = validateAddress(controller, 'controller')

	diagnostic.trace('Starting intention processing', {
		controller: validatedController,
		action: intention.action,
		intentionNonce: intention.nonce,
		timestamp: startTime,
	})

	logger.info('Handling intention. Raw intention:', JSON.stringify(intention))
	logger.info('Received signature:', validatedSignature)

	/**
	 * STEP 2: Verify signature against ORIGINAL intention
	 * - Signature was created by user signing the original intention (with ENS names)
	 * - Must verify BEFORE resolving ENS, otherwise signature won't match
	 * - Recovers signer address and compares to 'controller' parameter
	 */
	const verifyStartTime = Date.now()
	const signerAddress = verifyMessage(
		JSON.stringify(intention),
		validatedSignature
	)

	diagnostic.debug('Signature verification completed', {
		recoveredAddress: signerAddress,
		expectedAddress: validatedController,
		verificationTime: Date.now() - verifyStartTime,
		signatureValid: signerAddress.toLowerCase() === validatedController,
	})

	logger.info('Recovered signer address from intention:', signerAddress)
	if (signerAddress.toLowerCase() !== validatedController) {
		logger.info(
			'Signature verification failed. Expected:',
			validatedController,
			'Got:',
			signerAddress
		)
		diagnostic.error('Signature mismatch', {
			expected: validatedController,
			received: signerAddress,
			intention: intention,
		})
		throw new Error('Signature verification failed')
	}

	/**
	 * STEP 3: Resolve ENS names to Ethereum addresses
	 * - Mutates intention object in-place
	 * - Resolves: outputs[].to_external
	 * - Always resolves on Ethereum mainnet (canonical ENS registry)
	 * - Results are cached for 1 hour to reduce network calls
	 * - Must happen AFTER signature verification (step 2)
	 */
	await resolveIntentionENS(intention)
	diagnostic.debug('Intention after ENS resolution:', JSON.stringify(intention))

	/**
	 * STEP 4: Validate the fully resolved intention
	 * - All addresses are now hex format (ENS resolved)
	 * - Validates all fields including token addresses, balances, nonces
	 * - Returns a validated copy with normalized addresses (lowercase)
	 */
	const validatedIntention = validateIntention(intention)
	diagnostic.debug(
		'Intention after validation:',
		JSON.stringify(validatedIntention)
	)

	// Handle AssignDeposit intention (bypass generic balance checks)
	if (validatedIntention.action === 'AssignDeposit') {
		const executionObject = await handleAssignDeposit({
			intention: validatedIntention,
			validatedController,
			validatedSignature,
			context: {
				validateAssignDepositStructure,
				discoverAndIngestErc20Deposits,
				discoverAndIngestEthDeposits,
				findDepositWithSufficientRemaining,
				validateVaultIdOnChain,
				logger,
				diagnostic,
			},
		})
		cachedIntentions.push(executionObject)
		return executionObject
	}

	// Handle CreateVault intention and trigger seeding
	if (validatedIntention.action === 'CreateVault') {
		await handleCreateVault({
			intention: validatedIntention,
			validatedController,
			deps: {
				vaultTrackerContract,
				updateVaultControllers,
				createAndSubmitSeedingIntention,
				logger,
			},
		})
	}

	// Check for expiry
	if (validatedIntention.expiry < Date.now() / 1000) {
		diagnostic.error('Intention has expired', {
			expiry: validatedIntention.expiry,
			currentTime: Math.floor(Date.now() / 1000),
		})
		throw new Error('Intention has expired')
	}

	/**
	 * STEP 5: Verify vault balances based on intention inputs.
	 * This now involves resolving the fromVaultId and checking controller authorization.
	 */
	for (const input of validatedIntention.inputs) {
		const tokenAddress = input.asset
		const requiredAmount = safeBigInt(input.amount)

		// Determine the source vault for this input
		let fromVaultId: number
		if (input.from !== undefined) {
			fromVaultId = input.from
		} else {
			// If 'from' is not in the input, resolve it via the controller
			const vaults = await getVaultsForController(validatedController)
			if (vaults.length === 0) {
				throw new Error(
					`Controller ${validatedController} has no associated vaults.`
				)
			}
			if (vaults.length > 1) {
				throw new Error(
					`Controller has multiple vaults, but no specific 'from' vault was provided in intention input.`
				)
			}
			fromVaultId = parseInt(vaults[0])
		}

		// Security Check: Verify the signer is a controller of the source vault
		const authorizedControllers = await getControllersForVault(fromVaultId)
		if (!authorizedControllers.includes(validatedController)) {
			throw new Error(
				`Controller ${validatedController} is not authorized for vault ${fromVaultId}.`
			)
		}

		const currentBalance = await getBalance(fromVaultId, tokenAddress)

		diagnostic.trace('Balance check', {
			vault: fromVaultId,
			token: tokenAddress,
			currentBalance: currentBalance.toString(),
			requiredAmount: requiredAmount.toString(),
			sufficient: currentBalance >= requiredAmount,
		})

		if (currentBalance < requiredAmount) {
			diagnostic.error('Insufficient balance', {
				vault: fromVaultId,
				token: tokenAddress,
				currentBalance: currentBalance.toString(),
				requiredAmount: requiredAmount.toString(),
			})
			throw new Error('Insufficient balance')
		}
	}

	/**
	 * STEP 6: Generate proof based on intention outputs
	 */
	const proof: unknown[] = []

	// By this point, STEP 5 has guaranteed that every input has a `from` vault ID.
	// We create a set to find the unique source vault(s).
	const sourceVaultIds = new Set(validatedIntention.inputs.map((i) => i.from))

	if (sourceVaultIds.size > 1) {
		// For now, we only support a single source vault per intention.
		throw new Error(
			'Intentions with inputs from multiple source vaults are not yet supported.'
		)
	}

	if (sourceVaultIds.size === 0 && validatedIntention.inputs.length > 0) {
		// This should be an impossible state if the intention has inputs.
		throw new Error('Could not determine source vault for proof generation.')
	}

	// Get the single, definitive source vault ID from the set.
	const finalSourceVaultId = sourceVaultIds.values().next().value as number

	for (const output of validatedIntention.outputs) {
		const tokenAddress = output.asset
		const amountInWei = safeBigInt(output.amount)
		let toIdentifier: string | number

		if (output.to_external) {
			toIdentifier = output.to_external
		} else if (output.to !== undefined) {
			toIdentifier = output.to // Pass the vault ID directly
		} else {
			// This case should be prevented by the validator, but we handle it defensively
			throw new Error(
				'Intention output must have a destination (`to` or `to_external`)'
			)
		}

		proof.push({
			token: tokenAddress,
			from: finalSourceVaultId, // All transfers originate from the resolved vault
			to: toIdentifier,
			amount: amountInWei.toString(),
		})
	}

	const executionObject: ExecutionObject = {
		execution: [
			{
				intention: validatedIntention,
				from: finalSourceVaultId,
				proof: proof,
				signature: validatedSignature,
			},
		],
	}
	cachedIntentions.push(executionObject)

	diagnostic.info('Intention processed successfully', {
		controller: validatedController,
		action: validatedIntention.action,
		processingTime: Date.now() - startTime,
		totalCachedIntentions: cachedIntentions.length,
		proofCount: proof.length,
	})

	logger.info(
		'Cached intention added. Total cached intentions:',
		cachedIntentions.length
	)
	return executionObject
}

/**
 * Creates a bundle from cached intentions and publishes to IPFS/blockchain.
 * Runs every 10 seconds via interval timer.
 */
async function createAndPublishBundle() {
	bundleCycleCount++
	const cycleStartTime = Date.now()

	diagnostic.info('Bundle cycle started', {
		cycleNumber: bundleCycleCount,
		memoryUsage: process.memoryUsage(),
		pendingIntentions: cachedIntentions.length,
		lastSuccessTime: lastSuccessfulBundleTime,
		timeSinceLastSuccess: lastSuccessfulBundleTime
			? Date.now() - lastSuccessfulBundleTime
			: 0,
	})

	if (cachedIntentions.length === 0) {
		logger.info('No intentions to propose.')
		return
	}
	let nonce: number
	try {
		nonce = await getLatestNonce()
		logger.info('Latest nonce retrieved:', nonce)
	} catch (error) {
		diagnostic.error('Failed to get nonce', {
			error: error instanceof Error ? error.message : String(error),
			cycleNumber: bundleCycleCount,
		})
		logger.error('Failed to get latest nonce:', error)
		return
	}
	const bundle = cachedIntentions.map(({ execution }) => execution).flat()
	const bundleObject = {
		bundle: bundle,
		nonce: nonce,
	}

	diagnostic.debug('Bundle creation metrics', {
		intentionCount: cachedIntentions.length,
		bundleSize: JSON.stringify(bundleObject).length,
		nonce,
		cycleNumber: bundleCycleCount,
	})

	logger.info('Bundle object to be signed:', JSON.stringify(bundleObject))

	// Ensure initialization before using wallet
	if (!isInitialized) {
		throw new Error('Proposer not initialized. Call initializeProposer() first')
	}

	const proposerSignature = await wallet.signMessage(
		JSON.stringify(bundleObject)
	)
	logger.info('Generated bundle proposer signature:', proposerSignature)
	try {
		await publishBundle(
			JSON.stringify(bundleObject),
			proposerSignature,
			PROPOSER_ADDRESS
		)
		lastSuccessfulBundleTime = Date.now()

		diagnostic.info('Bundle cycle completed', {
			cycleNumber: bundleCycleCount,
			cycleTime: Date.now() - cycleStartTime,
			intentionsProcessed: cachedIntentions.length,
			nonce,
			success: true,
		})

		logger.info('Bundle published successfully')
	} catch (error) {
		diagnostic.error('Bundle publish failed', {
			error: error instanceof Error ? error.message : String(error),
			cycleNumber: bundleCycleCount,
			cycleTime: Date.now() - cycleStartTime,
			intentionsLost: cachedIntentions.length,
			nonce,
		})
		logger.error('Failed to publish bundle:', error)
		cachedIntentions = []
		return
	}
	cachedIntentions = []
}

/**
 * Initializes the proposer module.
 * Must be called after environment validation.
 * Sets up Alchemy instances, wallet, and smart contract.
 */
export async function initializeProposer() {
	if (isInitialized) {
		logger.warn('Proposer already initialized')
		return
	}

	logger.info('Initializing proposer module...')

	// Seed the proposer's own vault-to-controller mapping
	await seedProposerVaultMapping()

	// Initialize wallet and contract
	await initializeWalletAndContract()

	// Initialize Filecoin Pin (if enabled)
	try {
		await initializeFilecoinPin()
	} catch (error) {
		logger.warn(
			'Filecoin Pin initialization failed (continuing without it):',
			error
		)
	}

	isInitialized = true

	logger.info('Proposer module initialized successfully')
}

/**
 * Exports Sepolia Alchemy instance for health checks
 */
export function getSepoliaAlchemy() {
	if (!isInitialized) {
		throw new Error('Proposer not initialized')
	}
	return sepoliaAlchemy
}

/**
 * Ensures the proposer's vault-to-controller mapping is seeded in the database.
 * This is crucial for allowing the proposer to sign and submit seeding intentions.
 */
async function seedProposerVaultMapping() {
	try {
		await updateVaultControllers(PROPOSER_VAULT_ID.value, [PROPOSER_ADDRESS])
		logger.info(
			`Proposer vault mapping seeded: Vault ${PROPOSER_VAULT_ID.value} -> Controller ${PROPOSER_ADDRESS}`
		)
	} catch (error) {
		logger.error('Failed to seed proposer vault mapping:', error)
		// We throw here because if the proposer can't control its own vault,
		// it won't be able to perform critical functions like seeding new vaults.
		throw new Error('Could not seed proposer vault mapping')
	}
}

/**
 * Exports IPFS node for health checks
 */
export async function getIPFSNode() {
	if (!s) {
		const helia = await createHelia()
		s = strings(helia)
	}
	return s
}

/**
 * Internal: Initializes Alchemy instances, wallet, and smart contract.
 * @internal
 */
async function initializeWalletAndContract() {
	const {
		mainnetAlchemy: mainAlchemy,
		sepoliaAlchemy: sepAlchemy,
		wallet: walletInstance,
	} = await buildAlchemyInstances()
	mainnetAlchemy = mainAlchemy
	sepoliaAlchemy = sepAlchemy
	wallet = walletInstance
	bundleTrackerContract = await buildBundleTrackerContract()
	vaultTrackerContract = await buildVaultTrackerContract()
}

/**
 * Testing utility to inspect cached intentions.
 * @internal
 */
const _getCachedIntentions = () => cachedIntentions

/**
 * Testing utility to clear cached intentions.
 * @internal
 */
const _clearCachedIntentions = () => {
	cachedIntentions = []
}

export {
	handleIntention,
	createAndPublishBundle,
	_getCachedIntentions,
	_clearCachedIntentions,
}
