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

/** Logger instance for controllers module */
const logger = createLogger('Controller')

/**
 * POST /bundle
 * Saves a new bundle with its nonce to the database.
 * Returns the created bundle or 400/500 on error.
 */
export const saveBundle = async (req: Request, res: Response) => {
	const startTime = Date.now()
	const { bundle, nonce } = req.body as RequestBody

	logger.info('Received bundle:', JSON.stringify(bundle, null, 2))
	logger.info('Received nonce:', nonce)

	if (!bundle || typeof nonce !== 'number') {
		diagnostic.debug('Invalid bundle data', {
			hasBundle: !!bundle,
			nonceType: typeof nonce,
		})
		return res.status(400).json({ error: 'Invalid bundle data' })
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
