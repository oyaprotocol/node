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
import { pool } from './index.js'
import { fileURLToPath } from 'url'
import zlib from 'zlib'
import { promisify } from 'util'
import { getEnvConfig } from './utils/env.js'
import { createLogger, diagnostic } from './utils/logger.js'
import { resolveIntentionENS } from './utils/ensResolver.js'
import {
	validateIntention,
	validateAddress,
	validateSignature,
} from './utils/validator.js'
import type {
	Intention,
	BundleData,
	ExecutionObject,
} from './types/core.js'

const gzip = promisify(zlib.gzip)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

/** Logger instance for proposer module */
const logger = createLogger('Proposer')

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
	): Promise<ethers.ContractTransaction>
}

let cachedIntentions: ExecutionObject[] = []

let mainnetAlchemy: Alchemy
let sepoliaAlchemy: Alchemy
let wallet: Wallet
let bundleTrackerContract: BundleTrackerContract

let s: ReturnType<typeof strings>

// Initialization flag
let isInitialized = false

/**
 * Initializes the BundleTracker contract with ABI and provider.
 * Connects the wallet for transaction signing.
 */
async function buildBundleTrackerContract(): Promise<BundleTrackerContract> {
	const { BUNDLE_TRACKER_ADDRESS } = getEnvConfig()
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
 * Sets up Alchemy SDK instances for mainnet and Sepolia.
 * Initializes wallet with private key for blockchain transactions.
 */
async function buildAlchemyInstances() {
	const { ALCHEMY_API_KEY, PROPOSER_KEY } = getEnvConfig()
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
 * Fetches token decimals from mainnet for proper amount calculations.
 * Returns 18 for ETH (zero address).
 */
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
 * Checks if a vault has any balance records in the database.
 */
async function vaultExists(vault: string | number): Promise<boolean> {
	const result = await pool.query(
		'SELECT 1 FROM balances WHERE LOWER(vault)=LOWER($1) LIMIT 1',
		[vault.toString()]
	)
	return result.rows.length > 0
}

/**
 * Initializes a new vault with default token balances if it doesn't exist.
 */
async function initializeVault(vault: string | number) {
	if (!(await vaultExists(vault))) {
		// We can only initialize balances for vaults that are ETH addresses
		if (typeof vault === 'string' && ethers.isAddress(vault)) {
			await initializeBalancesForVault(vault)
		}
	}
}

/**
 * Sets up initial test token balances for a new vault.
 * Includes ETH, USDC, and OYA tokens with different decimal places.
 */
async function initializeBalancesForVault(vault: string) {
	// Validate vault address
	const validatedVault = validateAddress(vault, 'vault')
	const initialBalance18 = parseUnits('10000', 18)
	const initialBalance6 = parseUnits('1000000', 6)
	const supportedTokens18: string[] = [
		'0x0000000000000000000000000000000000000000',
	]
	const supportedTokens6: string[] = [
		'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
	]
	const oyaTokens: string[] = ['0x0000000000000000000000000000000000000001']
	for (const token of supportedTokens18) {
		await pool.query(
			'INSERT INTO balances (vault, token, balance) VALUES ($1, LOWER($2), $3)',
			[validatedVault, token, initialBalance18.toString()]
		)
	}
	for (const token of supportedTokens6) {
		await pool.query(
			'INSERT INTO balances (vault, token, balance) VALUES ($1, LOWER($2), $3)',
			[validatedVault, token, initialBalance6.toString()]
		)
	}
	for (const token of oyaTokens) {
		await pool.query(
			'INSERT INTO balances (vault, token, balance) VALUES ($1, LOWER($2), $3)',
			[
				validatedVault,
				token,
				/* Note: Removed initialOyaBalance since rewards are not minted */ '0',
			]
		)
	}
	logger.info(`Vault ${validatedVault} initialized with test tokens`)
}

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
	const { PROPOSER_ADDRESS } = getEnvConfig()
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
			await pool.query(
				`INSERT INTO nonces (vault, nonce)
       VALUES (LOWER($1), $2)
       ON CONFLICT (vault)
       DO UPDATE SET nonce = EXCLUDED.nonce`,
				[vault, vaultNonce]
			)
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

	const { PROPOSER_ADDRESS } = getEnvConfig()
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
		const { PROPOSER_ADDRESS } = getEnvConfig()
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
	try {
		for (const execution of bundleData.bundle) {
			if (!Array.isArray(execution.proof)) {
				logger.error('Invalid proof structure in execution:', execution)
				throw new Error('Invalid proof structure')
			}
			for (const proof of execution.proof) {
				await updateBalances(proof.from, proof.to, proof.token, proof.amount)
			}
		}
		logger.info('Balances updated successfully')
	} catch (error) {
		logger.error('Failed to update balances:', error)
		throw new Error('Balance update failed')
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
	from: string,
	to: string | number,
	token: string,
	amount: string
) {
	// from is always an address, to can be an address or a vault ID
	const validatedFrom = validateAddress(from, 'from')
	const validatedToken = validateAddress(token, 'token')

	await initializeVault(validatedFrom)
	await initializeVault(to)

	const amountBigInt = safeBigInt(amount)
	const { PROPOSER_ADDRESS } = getEnvConfig()
	if (validatedFrom === PROPOSER_ADDRESS.toLowerCase()) {
		const largeBalance = parseUnits('1000000000000', 18)
		await updateBalance(
			validatedFrom,
			validatedToken,
			safeBigInt(largeBalance.toString())
		)
		logger.info(
			`Bundle proposer balance updated to a large amount for token ${validatedToken}`
		)
	}
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
 * Verifies and processes an incoming intention.
 * Validates signature, checks balances, and caches for bundling.
 */
async function handleIntention(
	intention: Intention,
	signature: string,
	from: string
): Promise<ExecutionObject> {
	const startTime = Date.now()

	/**
	 * STEP 1: Basic validation of signature format and from address
	 * - Validates signature is properly formatted (0x + hex)
	 * - Validates from is a valid Ethereum address
	 * - Does NOT validate intention fields yet (may contain ENS names)
	 */
	const validatedSignature = validateSignature(signature)
	const validatedFrom = validateAddress(from, 'from')

	diagnostic.trace('Starting intention processing', {
		from: validatedFrom,
		action: intention.action,
		intentionNonce: intention.nonce,
		timestamp: startTime,
	})

	await initializeVault(validatedFrom)
	logger.info('Handling intention. Raw intention:', JSON.stringify(intention))
	logger.info('Received signature:', validatedSignature)

	/**
	 * STEP 2: Verify signature against ORIGINAL intention
	 * - Signature was created by user signing the original intention (with ENS names)
	 * - Must verify BEFORE resolving ENS, otherwise signature won't match
	 * - Recovers signer address and compares to 'from' parameter
	 */
	const verifyStartTime = Date.now()
	const signerAddress = verifyMessage(
		JSON.stringify(intention),
		validatedSignature
	)

	diagnostic.debug('Signature verification completed', {
		recoveredAddress: signerAddress,
		expectedAddress: validatedFrom,
		verificationTime: Date.now() - verifyStartTime,
		signatureValid: signerAddress.toLowerCase() === validatedFrom,
	})

	logger.info('Recovered signer address from intention:', signerAddress)
	if (signerAddress.toLowerCase() !== validatedFrom) {
		logger.info(
			'Signature verification failed. Expected:',
			validatedFrom,
			'Got:',
			signerAddress
		)
		diagnostic.error('Signature mismatch', {
			expected: validatedFrom,
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

	/**
	 * STEP 5: Verify vault balances based on intention inputs
	 */
	for (const input of validatedIntention.inputs) {
		const tokenAddress = input.asset
		const tokenDecimals = await getTokenDecimals(tokenAddress)
		const requiredAmount = parseUnits(input.amount, Number(tokenDecimals))

		// For now, all inputs are debited from the user's main vault,
		// which is identified by their validated 'from' address.
		const balanceOwner = validatedFrom
		const currentBalance = await getBalance(balanceOwner, tokenAddress)

		diagnostic.trace('Balance check', {
			vault: balanceOwner,
			token: tokenAddress,
			currentBalance: currentBalance.toString(),
			requiredAmount: requiredAmount.toString(),
			sufficient: currentBalance >= requiredAmount,
		})

		if (currentBalance < requiredAmount) {
			diagnostic.error('Insufficient balance', {
				vault: balanceOwner,
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

	for (const output of validatedIntention.outputs) {
		const tokenAddress = output.asset
		const tokenDecimals = await getTokenDecimals(tokenAddress)
		const amountInWei = parseUnits(output.amount, Number(tokenDecimals))
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
			from: validatedFrom, // All transfers originate from the user's vault
			to: toIdentifier,
			amount: amountInWei.toString(),
		})
	}

	const executionObject: ExecutionObject = {
		execution: [
			{
				intention: validatedIntention,
				from: validatedFrom,
				proof: proof,
			},
		],
	}
	cachedIntentions.push(executionObject)

	diagnostic.info('Intention processed successfully', {
		from: validatedFrom,
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
		const { PROPOSER_ADDRESS } = getEnvConfig()
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

	// Initialize wallet and contract
	await initializeWalletAndContract()
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
