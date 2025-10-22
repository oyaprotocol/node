/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                     Filecoin Pin Integration                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Handles uploading bundle data to Filecoin via the filecoin-pin SDK.
 * Runs asynchronously alongside IPFS uploads for redundancy and permanence.
 *
 * @packageDocumentation
 */

import {
	initializeSynapse,
	createStorageContext,
} from 'filecoin-pin/core/synapse'
import { checkUploadReadiness, executeUpload } from 'filecoin-pin/core/upload'
import type { SynapseService } from 'filecoin-pin/core/synapse'
import type { ProviderInfo } from '@filoz/synapse-sdk'
import { pool } from '../index.js'
import { createLogger } from './logger.js'
import {
	getFilecoinPinConfig,
	isFilecoinPinEnabled,
	createFilecoinPinLogger,
} from '../config/filecoinPinConfig.js'

const logger = createLogger('FilecoinPin')

/** Synapse client instance (initialized once at startup) */
let synapseClient: SynapseService['synapse'] | null = null

/**
 * Initialize the Synapse SDK client.
 * Called once at startup if Filecoin pinning is enabled.
 */
export async function initializeFilecoinPin(): Promise<void> {
	if (!isFilecoinPinEnabled()) {
		logger.info('Filecoin pinning is disabled')
		return
	}

	try {
		const config = getFilecoinPinConfig()
		if (!config) {
			logger.warn('Filecoin pinning enabled but config not available')
			return
		}

		const pinoLogger = createFilecoinPinLogger()
		synapseClient = await initializeSynapse(config, pinoLogger)

		logger.info('✅ Filecoin Pin SDK initialized successfully')
	} catch (error) {
		logger.error('Failed to initialize Filecoin Pin SDK:', error)
		throw error
	}
}

/**
 * Update bundle status in database.
 */
async function updateBundleStatus(
	cid: string,
	status: string,
	error?: string
): Promise<void> {
	if (error) {
		await pool.query(
			'UPDATE bundles SET filecoin_status = $1, filecoin_error = $2 WHERE ipfs_cid = $3',
			[status, error, cid]
		)
	} else {
		await pool.query(
			'UPDATE bundles SET filecoin_status = $1 WHERE ipfs_cid = $2',
			[status, cid]
		)
	}
}

/**
 * Update bundle with piece CID after upload completes.
 */
async function updatePieceCid(cid: string, pieceCid: string): Promise<void> {
	await pool.query(
		'UPDATE bundles SET filecoin_piece_cid = $1 WHERE ipfs_cid = $2',
		[pieceCid, cid]
	)
}

/**
 * Update bundle with transaction hash.
 */
async function updateTransactionHash(
	cid: string,
	txHash: string
): Promise<void> {
	await pool.query(
		'UPDATE bundles SET filecoin_tx_hash = $1 WHERE ipfs_cid = $2',
		[txHash, cid]
	)
}

/**
 * Mark bundle as confirmed on Filecoin.
 */
async function markBundleConfirmed(cid: string): Promise<void> {
	await pool.query(
		`UPDATE bundles
     SET filecoin_status = $1,
         filecoin_confirmed_at = NOW()
     WHERE ipfs_cid = $2`,
		['confirmed', cid]
	)
}

/**
 * Create a storage context for uploading to Filecoin.
 * Each upload gets a fresh context.
 */
async function createUploadContext(): Promise<{
	storage: NonNullable<
		Awaited<ReturnType<typeof createStorageContext>>['storage']
	>
	providerInfo: ProviderInfo
}> {
	if (!synapseClient) {
		throw new Error('Synapse client not initialized')
	}

	const pinoLogger = createFilecoinPinLogger()
	const result = await createStorageContext(synapseClient, pinoLogger)

	if (!result.storage || !result.providerInfo) {
		throw new Error('Failed to create storage context')
	}

	return {
		storage: result.storage,
		providerInfo: result.providerInfo,
	}
}

/**
 * Check if the upload can proceed (balance, allowances, etc).
 */
async function verifyUploadReadiness(dataSize: number): Promise<void> {
	if (!synapseClient) {
		throw new Error('Synapse client not initialized')
	}

	const readinessCheck = await checkUploadReadiness({
		synapse: synapseClient,
		fileSize: dataSize,
		autoConfigureAllowances: true,
	})

	// Log cost estimates if available
	if (readinessCheck.status === 'ready' && 'estimatedCost' in readinessCheck) {
		const cost = readinessCheck.estimatedCost as {
			perEpoch?: bigint
			perDay?: bigint
			perMonth?: bigint
		}
		logger.info('Filecoin storage cost estimate:', {
			perEpoch: cost.perEpoch?.toString(),
			perDay: cost.perDay?.toString(),
			perMonth: cost.perMonth?.toString(),
			fileSize: dataSize,
		})
	}

	if (readinessCheck.status === 'blocked') {
		const errorMsg =
			'message' in readinessCheck ? readinessCheck.message : 'Unknown reason'
		throw new Error(`Upload blocked: ${errorMsg}`)
	}
}

/**
 * Execute the upload to Filecoin with progress callbacks.
 */
async function executeFilecoinUpload(
	synapseService: SynapseService,
	bundleData: Buffer,
	cidString: string,
	nonce: number
): Promise<void> {
	// Import CID from multiformats
	const { CID } = await import('multiformats/cid')
	const cid = CID.parse(cidString)

	await executeUpload(synapseService, bundleData, cid, {
		logger: createFilecoinPinLogger(),
		contextId: `bundle-${nonce}`,
		metadata: {
			bundleNonce: nonce.toString(),
			uploadedAt: new Date().toISOString(),
		},
		callbacks: {
			onUploadComplete: async (pieceCid) => {
				logger.info(`Upload complete for ${cidString}. Piece CID: ${pieceCid}`)
				await updatePieceCid(cidString, pieceCid.toString())
			},
			onPieceAdded: async (transaction) => {
				if (!transaction || !transaction.hash) {
					logger.warn(`Transaction missing for ${cidString}`)
					return
				}
				logger.info(
					`Transaction submitted for ${cidString}: ${transaction.hash}`
				)
				await updateTransactionHash(cidString, transaction.hash)
			},
			onPieceConfirmed: async () => {
				logger.info(`✅ Filecoin storage confirmed for ${cidString}`)
				await markBundleConfirmed(cidString)
			},
		},
	})
}

/**
 * Pin bundle data to Filecoin.
 * Runs asynchronously - failures are logged but don't block bundle creation.
 *
 * @param cid - IPFS CID of the bundle
 * @param bundleData - Compressed bundle data
 * @param nonce - Bundle nonce for tracking
 */
export async function pinBundleToFilecoin(
	cid: string,
	bundleData: Buffer,
	nonce: number
): Promise<void> {
	if (!isFilecoinPinEnabled() || !synapseClient) {
		logger.debug('Filecoin pinning not enabled or not initialized, skipping')
		return
	}

	try {
		logger.info(`Starting Filecoin pin for bundle nonce ${nonce}, CID: ${cid}`)

		// Update status to 'uploading'
		await updateBundleStatus(cid, 'uploading')

		// Verify we have sufficient balance/allowances FIRST (before creating storage context)
		await verifyUploadReadiness(bundleData.length)

		// Create storage context for this upload
		const { storage, providerInfo } = await createUploadContext()
		logger.debug(
			`Using provider: ${providerInfo.name} (ID: ${providerInfo.id})`
		)

		// Build the synapse service object
		const synapseService: SynapseService = {
			storage,
			providerInfo,
			synapse: synapseClient,
		}

		// Execute the upload
		await executeFilecoinUpload(synapseService, bundleData, cid, nonce)

		logger.info(`Successfully pinned bundle ${nonce} to Filecoin`)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		logger.error(`Filecoin pinning failed for ${cid}:`, errorMessage)

		// Update database with error status
		await updateBundleStatus(cid, 'failed', errorMessage)
	}
}
