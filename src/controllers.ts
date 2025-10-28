/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         Database Controllers                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Database controller functions for managing bundles, CIDs, balances, and vaults.
 * Provides CRUD operations for all core data entities in PostgreSQL.
 *
 * Key operations:
 * - Bundle management (save, retrieve)
 * - CID tracking for IPFS content
 * - Balance management for vaults and tokens
 * - Vault nonce tracking for transaction ordering
 *
 * @packageDocumentation
 */

import { Request, Response } from 'express'
import { pool } from './index.js'
import { RequestBody } from './types/core.js'
import { createLogger, diagnostic } from './utils/logger.js'
import {
	validateBundle,
	handleValidationError,
	validateAddress,
	validateId,
} from './utils/validator.js'
import { getEnvConfig } from './utils/env.js'
import { handleIntention } from './proposer.js'
import {
    getVaultsForController as getVaultsForControllerUtil,
    getRulesForVault as getRulesForVaultUtil,
    setRulesForVault as setRulesForVaultUtil,
    addControllerToVault as addControllerToVaultUtil,
    removeControllerFromVault as removeControllerFromVaultUtil,
    createVaultRow,
} from './utils/vaults.js'

/** Logger instance for controllers module */
const logger = createLogger('Controller')

/**
 * POST /bundle
 * Saves a new bundle with its nonce to the database.
 * Returns the created bundle or 400/500 on error.
 */
export const saveBundle = async (req: Request, res: Response) => {
	const startTime = Date.now()
	let { bundle, nonce } = req.body as RequestBody

	logger.info('Received bundle:', JSON.stringify(bundle, null, 2))
	logger.info('Received nonce:', nonce)

	// Validate bundle data
	try {
		const validated = validateBundle(bundle, nonce)
		bundle = validated.bundle
		nonce = validated.nonce
	} catch (error) {
		const errorResponse = handleValidationError(error)
		diagnostic.debug('Bundle validation failed', errorResponse)
		return res.status(errorResponse.status).json(errorResponse)
	}

	try {
		const bundleString = JSON.stringify(bundle)

		logger.info('Stringified bundle for DB:', bundleString)

		const queryStart = Date.now()
		const result = await pool.query(
			'INSERT INTO bundles (bundle, nonce) VALUES ($1::jsonb, $2) RETURNING *',
			[bundleString, nonce]
		)

		diagnostic.info('Database operation', {
			operation: 'INSERT',
			table: 'bundles',
			queryTime: Date.now() - queryStart,
			totalTime: Date.now() - startTime,
			nonce,
			bundleSize: bundleString.length,
		})

		res.status(201).json(result.rows[0])
	} catch (err) {
		diagnostic.error('Database error', {
			operation: 'saveBundle',
			error: err instanceof Error ? err.message : String(err),
			nonce,
		})
		logger.error('Database insertion error (bundle):', err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /bundle/:nonce
 * Retrieves a bundle by its nonce.
 * Returns the bundle or 404 if not found.
 */
export const getBundle = async (req: Request, res: Response) => {
	const { nonce } = req.params

	try {
		const result = await pool.query(
			'SELECT * FROM bundles WHERE nonce = $1 ORDER BY timestamp DESC',
			[parseInt(nonce)]
		)

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Bundle not found' })
		}

		res.status(200).json(result.rows)
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /bundle
 * Retrieves all bundles ordered by timestamp.
 */
export const getAllBundles = async (req: Request, res: Response) => {
	try {
		const result = await pool.query(
			'SELECT * FROM bundles ORDER BY timestamp DESC'
		)
		res.status(200).json(result.rows)
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /balance/:vault
 * Returns all token balances for a specific vault.
 */
export const getBalanceForAllTokens = async (req: Request, res: Response) => {
	const { vault } = req.params

	try {
		const result = await pool.query(
			'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) ORDER BY timestamp DESC',
			[vault]
		)
		logger.info('Getting all token balances:', result.rows)
		res.status(200).json(result.rows)
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /balance/:vault/:token
 * Returns the balance for a specific token in a vault.
 * Returns 404 if balance not found.
 */
export const getBalanceForOneToken = async (req: Request, res: Response) => {
	const { vault, token } = req.params

	try {
		const queryStart = Date.now()
		const result = await pool.query(
			'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2) ORDER BY timestamp DESC',
			[vault, token]
		)

		diagnostic.debug('Balance query', {
			operation: 'SELECT',
			table: 'balances',
			vault: vault.toLowerCase(),
			token: token.toLowerCase(),
			queryTime: Date.now() - queryStart,
			rowCount: result.rows.length,
			found: result.rows.length > 0,
		})

		logger.info('Getting balance for one token:', result.rows)

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Balance not found' })
		}

		res.status(200).json(result.rows)
	} catch (err) {
		diagnostic.error('Database error', {
			operation: 'getBalanceForOneToken',
			error: err instanceof Error ? err.message : String(err),
			vault,
			token,
		})
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /balance/:vault/:token
 * Updates or creates a balance entry for a vault/token pair.
 * Expects balance string in request body.
 */
export const updateBalanceForOneToken = async (req: Request, res: Response) => {
	const { vault, token, balance } = req.body

	try {
		const checkResult = await pool.query(
			'SELECT * FROM balances WHERE LOWER(vault) = LOWER($1) AND LOWER(token) = LOWER($2)',
			[vault, token]
		)

		if (checkResult.rows.length === 0) {
			const insertResult = await pool.query(
				'INSERT INTO balances (vault, token, balance) VALUES (LOWER($1), LOWER($2), $3) RETURNING *',
				[vault, token, balance]
			)
			logger.info(
				`Inserted new balance: ${JSON.stringify(insertResult.rows[0])}`
			)
			return res.status(201).json(insertResult.rows[0])
		} else {
			const updateResult = await pool.query(
				'UPDATE balances SET balance = $1, timestamp = CURRENT_TIMESTAMP WHERE LOWER(vault) = LOWER($2) AND LOWER(token) = LOWER($3) RETURNING *',
				[balance, vault, token]
			)
			logger.info(
				`Updated existing balance: ${JSON.stringify(updateResult.rows[0])}`
			)
			return res.status(200).json(updateResult.rows[0])
		}
	} catch (err) {
		logger.error('Error updating balance:', err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /cid
 * Saves an IPFS CID with its associated nonce.
 * Returns the created CID record or 400 on invalid data.
 */
export const saveCID = async (req: Request, res: Response) => {
	const { cid, nonce } = req.body

	try {
		const result = await pool.query(
			'INSERT INTO cids (cid, nonce) VALUES ($1, $2) RETURNING *',
			[cid, nonce]
		)
		res.status(201).json(result.rows[0])
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /cid/:nonce
 * Retrieves all CIDs associated with a specific nonce.
 * Returns 404 if no CIDs found for the nonce.
 */
export const getCIDsByNonce = async (req: Request, res: Response) => {
	const { nonce } = req.params

	try {
		const result = await pool.query(
			'SELECT * FROM cids WHERE nonce = $1 ORDER BY timestamp DESC',
			[parseInt(nonce)]
		)

		if (result.rows.length === 0) {
			return res
				.status(404)
				.json({ error: 'No CIDs found for the given nonce' })
		}

		res.status(200).json(result.rows)
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /nonce/:vault
 * Gets the current nonce for a vault.
 * Returns 404 if vault has no nonce set.
 */
export const getVaultNonce = async (req: Request, res: Response) => {
	const { vault } = req.params
	try {
		const result = await pool.query(
			'SELECT nonce FROM nonces WHERE LOWER(vault) = LOWER($1)',
			[vault]
		)
		logger.info('Getting vault nonce:', result.rows)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Nonce not found' })
		}
		res.status(200).json(result.rows[0])
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /nonce/:vault
 * Sets or updates the nonce for a vault.
 * Creates new entry or updates existing one.
 */
export const setVaultNonce = async (req: Request, res: Response) => {
	const { vault } = req.params
	const { nonce } = req.body

	try {
		const result = await pool.query(
			`INSERT INTO nonces (vault, nonce)
       VALUES (LOWER($1), $2)
       ON CONFLICT (LOWER(vault))
       DO UPDATE SET nonce = EXCLUDED.nonce
       RETURNING *`,
			[vault, nonce]
		)
		res.status(201).json(result.rows[0])
	} catch (err) {
		logger.error(err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /health
 * Health check endpoint for container orchestration and load balancers.
 * Returns simple health status of the service.
 */
export const healthCheck = async (req: Request, res: Response) => {
	try {
		// Quick database connectivity check
		await pool.query('SELECT 1')
		res.status(200).json({ status: 'healthy' })
	} catch (err) {
		logger.error('Health check failed:', err)
		res.status(503).json({ status: 'unhealthy' })
	}
}

/**
 * GET /info
 * Returns service metadata including version, uptime, and configuration.
 */
export const getInfo = async (req: Request, res: Response) => {
	const uptime = process.uptime()
	const { PROPOSER_ADDRESS, BUNDLE_TRACKER_ADDRESS } = getEnvConfig()

	try {
		res.status(200).json({
			version: '1.0.0',
			uptime: Math.floor(uptime),
			nodeStarted: new Date(Date.now() - uptime * 1000).toISOString(),
			proposerAddress: PROPOSER_ADDRESS,
			bundleTrackerAddress: BUNDLE_TRACKER_ADDRESS,
			network: 'sepolia',
		})
	} catch (err) {
		logger.error('Error getting info:', err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /metrics
 * Returns operational metrics including bundle count, database stats, and performance.
 */
export const getMetrics = async (req: Request, res: Response) => {
	const startTime = Date.now()

	try {
		// Get bundle count
		const bundleCountResult = await pool.query('SELECT COUNT(*) FROM bundles')
		const totalBundles = parseInt(bundleCountResult.rows[0].count)

		// Get CID count and latest CID
		const cidCountResult = await pool.query('SELECT COUNT(*) FROM cids')
		const totalCIDs = parseInt(cidCountResult.rows[0].count)

		const latestCIDResult = await pool.query(
			'SELECT cid, nonce FROM cids ORDER BY timestamp DESC LIMIT 1'
		)
		const latestCID =
			latestCIDResult.rows.length > 0 ? latestCIDResult.rows[0].cid : null
		const latestCIDNonce =
			latestCIDResult.rows.length > 0 ? latestCIDResult.rows[0].nonce : null

		// Get unique vault count
		const vaultCountResult = await pool.query(
			'SELECT COUNT(DISTINCT vault) FROM nonces'
		)
		const totalVaults = parseInt(vaultCountResult.rows[0].count)

		// Get latest bundle nonce
		const latestBundleResult = await pool.query(
			'SELECT nonce FROM bundles ORDER BY nonce DESC LIMIT 1'
		)
		const latestBundleNonce =
			latestBundleResult.rows.length > 0
				? latestBundleResult.rows[0].nonce
				: null

		// Get bundle stats from last 24h
		const recentBundlesResult = await pool.query(
			`SELECT COUNT(*) FROM bundles
       WHERE timestamp >= NOW() - INTERVAL '24 hours'`
		)
		const bundlesLast24h = parseInt(recentBundlesResult.rows[0].count)

		// Get database size
		const dbSizeResult = await pool.query(
			`SELECT pg_database_size(current_database()) as size`
		)
		const dbSize = parseInt(dbSizeResult.rows[0].size)

		// Calculate query time
		const queryTime = Date.now() - startTime

		res.status(200).json({
			bundles: {
				total: totalBundles,
				latest_nonce: latestBundleNonce,
				last_24h: bundlesLast24h,
			},
			cids: {
				total: totalCIDs,
				latest: latestCID,
				latest_nonce: latestCIDNonce,
			},
			vaults: {
				total: totalVaults,
			},
			database: {
				size_bytes: dbSize,
				size_mb: (dbSize / 1024 / 1024).toFixed(2),
			},
			performance: {
				query_time_ms: queryTime,
				uptime_seconds: Math.floor(process.uptime()),
			},
			memory: {
				heap_used_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
				heap_total_mb: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(
					2
				),
				rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(2),
			},
		})
	} catch (err) {
		logger.error('Error getting metrics:', err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /health/detailed
 * Comprehensive health check including database, IPFS, and Ethereum connectivity.
 */
export const detailedHealthCheck = async (req: Request, res: Response) => {
	const startTime = Date.now()
	const checks: Record<
		string,
		{
			status: string
			response_time_ms?: number
			error?: string
			network?: string
			latest_block?: number
		}
	> = {}

	// Database check
	try {
		const dbStart = Date.now()
		await pool.query('SELECT 1')
		checks.database = {
			status: 'healthy',
			response_time_ms: Date.now() - dbStart,
		}
	} catch (err) {
		checks.database = {
			status: 'unhealthy',
			error: err instanceof Error ? err.message : String(err),
		}
	}

	// IPFS check (test if Helia is accessible)
	try {
		const ipfsStart = Date.now()
		const { getIPFSNode } = await import('./proposer.js')
		const ipfs = await getIPFSNode()
		if (ipfs) {
			checks.ipfs = {
				status: 'healthy',
				response_time_ms: Date.now() - ipfsStart,
			}
		} else {
			checks.ipfs = {
				status: 'unhealthy',
				error: 'IPFS node not initialized',
			}
		}
	} catch (err) {
		checks.ipfs = {
			status: 'unhealthy',
			error: err instanceof Error ? err.message : String(err),
		}
	}

	// Ethereum connectivity check
	try {
		const ethStart = Date.now()
		const { getSepoliaAlchemy } = await import('./proposer.js')
		const alchemy = getSepoliaAlchemy()
		const provider = (await alchemy.config.getProvider()) as unknown as {
			getBlockNumber: () => Promise<number>
		}
		const blockNumber = await provider.getBlockNumber()
		checks.ethereum = {
			status: 'healthy',
			network: 'sepolia',
			latest_block: blockNumber,
			response_time_ms: Date.now() - ethStart,
		}
	} catch (err) {
		checks.ethereum = {
			status: 'unhealthy',
			error: err instanceof Error ? err.message : String(err),
		}
	}

	// Determine overall health
	const allHealthy = Object.values(checks).every(
		(check) => check.status === 'healthy'
	)

	const status = allHealthy ? 'healthy' : 'degraded'
	const statusCode = allHealthy ? 200 : 503

	res.status(statusCode).json({
		status,
		checks,
		total_check_time_ms: Date.now() - startTime,
		timestamp: new Date().toISOString(),
	})
}

/**
 * POST /intention
 * Receives and processes signed intentions.
 * Validates the intention, signature, and vault address before processing.
 */
export const submitIntention = async (req: Request, res: Response) => {
	const startTime = Date.now()
	try {
		const { intention, signature, controller } = req.body
		if (!intention || !signature || !controller) {
			diagnostic.debug('Missing intention fields', {
				hasIntention: !!intention,
				hasSignature: !!signature,
				hasController: !!controller,
			})
			throw new Error(
				'Missing required fields: intention, signature, or controller'
			)
		}

		diagnostic.info('Intention endpoint called', {
			controller,
			intentionType: intention.action_type || 'legacy',
			signaturePreview: signature.slice(0, 10) + '...',
		})

		logger.info('Received signed intention', {
			controller,
			signature: signature.slice(0, 10) + '...',
		})
		const response = await handleIntention(intention, signature, controller)

		diagnostic.info('Intention processed', {
			controller,
			processingTime: Date.now() - startTime,
			success: true,
		})

		res.status(200).json(response)
	} catch (error) {
		const errorResponse = handleValidationError(error)
		diagnostic.error('Intention processing failed', {
			error: errorResponse.error,
			processingTime: Date.now() - startTime,
		})
		logger.error('Error handling intention', error)
		res.status(errorResponse.status).json(errorResponse)
	}
}

/**
 * GET /filecoin/status/:cid
 * Retrieves Filecoin pinning status for a bundle by its IPFS CID.
 * Returns detailed status including transaction hash, piece CID, and confirmation time.
 */
export const getFilecoinStatus = async (req: Request, res: Response) => {
	const { cid } = req.params

	try {
		const result = await pool.query(
			`SELECT ipfs_cid, filecoin_status, filecoin_tx_hash,
              filecoin_piece_cid, filecoin_confirmed_at, filecoin_error
       FROM bundles WHERE ipfs_cid = $1`,
			[cid]
		)

		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Bundle not found' })
		}

		const bundle = result.rows[0]

		res.status(200).json({
			cid: bundle.ipfs_cid,
			filecoin: {
				status: bundle.filecoin_status,
				transactionHash: bundle.filecoin_tx_hash,
				pieceCid: bundle.filecoin_piece_cid,
				confirmedAt: bundle.filecoin_confirmed_at,
				error: bundle.filecoin_error,
			},
		})
	} catch (err) {
		logger.error('Error fetching Filecoin status:', err)
		res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /vault/by-controller/:address
 * Returns array of vault IDs (strings) controlled by an address
 */
export const getVaultIdsByController = async (req: Request, res: Response) => {
	try {
		const address = validateAddress(req.params.address, 'address')
		const vaults = await getVaultsForControllerUtil(address)
		return res.status(200).json(vaults)
	} catch (error) {
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error getting vaults by controller:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /vault/:vaultId/controllers
 * Returns array of controller addresses for a given vault ID (404 if vault not found)
 */
export const getControllersByVaultId = async (req: Request, res: Response) => {
	try {
		const vaultId = validateId(Number(req.params.vaultId), 'vaultId')
		const result = await pool.query(
			'SELECT controllers FROM vaults WHERE vault = $1',
			[String(vaultId)]
		)
		if (result.rows.length === 0) {
			return res.status(404).json({ error: 'Vault not found' })
		}
		const controllers = (result.rows[0].controllers as string[]).map((c) =>
			c.toLowerCase()
		)
		return res.status(200).json(controllers)
	} catch (error) {
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error getting controllers by vaultId:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * GET /vault/:vaultId/rules
 * Returns \{ vault, rules \} for the given vault ID (404 if vault not found)
 */
export const getRulesByVaultId = async (req: Request, res: Response) => {
	try {
		const vaultId = validateId(Number(req.params.vaultId), 'vaultId')
		const rules = await getRulesForVaultUtil(vaultId)
		if (rules === undefined) {
			return res.status(404).json({ error: 'Vault not found' })
		}
		return res.status(200).json({ vault: String(vaultId), rules })
	} catch (error) {
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error getting rules by vaultId:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /vault/:vaultId/controllers/add
 * Adds a controller to an existing vault. Returns \{ vault, controllers \}
 */
export const addControllerToVault = async (req: Request, res: Response) => {
	try {
		const vaultId = validateId(Number(req.params.vaultId), 'vaultId')
		const controller = validateAddress(req.body.controller, 'controller')

		// Check existence for status code
		const existsResult = await pool.query(
			'SELECT 1 FROM vaults WHERE vault = $1',
			[String(vaultId)]
		)
		const existed = existsResult.rows.length > 0
		if (!existed) {
			return res.status(404).json({ error: 'Vault not found' })
		}

		const controllers = await addControllerToVaultUtil(vaultId, controller)
		const payload = { vault: String(vaultId), controllers }
		return res.status(200).json(payload)
	} catch (error) {
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error adding controller to vault:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /vault/:vaultId/controllers/remove
 * Removes a controller from a vault. Returns \{ vault, controllers \}
 */
export const removeControllerFromVault = async (
	req: Request,
	res: Response
) => {
	try {
		const vaultId = validateId(Number(req.params.vaultId), 'vaultId')
		const controller = validateAddress(req.body.controller, 'controller')
		try {
			const controllers = await removeControllerFromVaultUtil(
				vaultId,
				controller
			)
			return res.status(200).json({ vault: String(vaultId), controllers })
		} catch (inner) {
			if (inner instanceof Error && inner.message === 'Vault not found') {
				return res.status(404).json({ error: 'Vault not found' })
			}
			throw inner
		}
	} catch (error) {
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error removing controller from vault:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /vault/:vaultId/rules
 * Sets rules for an existing vault. Returns \{ vault, rules \}
 */
export const setRulesForVault = async (req: Request, res: Response) => {
	try {
		const vaultId = validateId(Number(req.params.vaultId), 'vaultId')
		const { rules } = req.body as { rules: string | null }
		if (rules !== null && typeof rules !== 'string') {
			return res
				.status(400)
				.json({ error: 'Invalid rules: must be string or null' })
		}

		// Check existence for status code
		const existsResult = await pool.query(
			'SELECT 1 FROM vaults WHERE vault = $1',
			[String(vaultId)]
		)
		const existed = existsResult.rows.length > 0
		if (!existed) {
			return res.status(404).json({ error: 'Vault not found' })
		}

		const persisted = await setRulesForVaultUtil(vaultId, rules ?? null)
		return res.status(200).json({ vault: String(vaultId), rules: persisted })
	} catch (error) {
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error updating rules for vault:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}

/**
 * POST /vault/:vaultId
 * Creates a new vault row with initial controller and optional rules.
 * Returns \{ vault, controllers, rules \}. 409 if vault already exists.
 */
export const createVault = async (req: Request, res: Response) => {
	try {
		const vaultId = validateId(Number(req.params.vaultId), 'vaultId')
		const controller = validateAddress(req.body.controller, 'controller')
		const rules = (req.body?.rules ?? null) as string | null
		if (rules !== null && typeof rules !== 'string') {
			return res
				.status(400)
				.json({ error: 'Invalid rules: must be string or null' })
		}
        const row = await createVaultRow(vaultId, controller, rules)
		return res.status(201).json({
			vault: row.vault,
			controllers: row.controllers,
			rules: row.rules,
		})
	} catch (error) {
		const pgErr = error as Error & { code?: string }
		if (pgErr.code === '23505') {
			return res.status(409).json({ error: 'Vault already exists' })
		}
		const err = handleValidationError(error)
		if (err.status === 400) return res.status(400).json(err)
		logger.error('Error creating vault:', error)
		return res.status(500).json({ error: 'Internal Server Error' })
	}
}
