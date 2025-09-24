/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                            Main Entry Point                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Main entry point for the Oya Natural Language Protocol Node.
 * Sets up Express server with routes for handling signed intentions, creating bundles,
 * and managing blockchain interactions.
 *
 * @packageDocumentation
 */

import { JSDOM } from 'jsdom'
import { displayBanner } from './utils/banner.js'
import { logger } from './utils/logger.js'

// Polyfill for CustomEvent in Node.js environment (required by Helia)
if (typeof globalThis.CustomEvent === 'undefined') {
	const { window } = new JSDOM()
	globalThis.CustomEvent = window.CustomEvent
	logger.debug('CustomEvent polyfill via jsdom applied.')
}

import express from 'express'
import bppkg from 'body-parser'
const { json } = bppkg
import dotenv from 'dotenv'
import pgpkg from 'pg'
const { Pool } = pgpkg
import {
	bundleRouter,
	cidRouter,
	balanceRouter,
	vaultNonceRouter,
} from './routes.js'
import { handleIntention, createAndPublishBundle } from './proposer.js'
import { bearerAuth } from './auth.js'

dotenv.config()

/** Express application instance for the Oya node server */
const app = express()

/** Port number for the server to listen on (defaults to 3000) */
const port = process.env.PORT || 3000

app.use(json())

/**
 * Global middleware to protect all POST endpoints with Bearer token authorization.
 * Ensures that only authenticated requests can modify state.
 */
app.use((req, res, next) => {
	if (req.method === 'POST') {
		return bearerAuth(req, res, next)
	}
	next()
})

/**
 * PostgreSQL connection pool for database operations.
 * Configured with SSL for secure connections.
 */
export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false,
	},
})

// Mount route handlers
app.use('/bundle', bundleRouter)
app.use('/cid', cidRouter)
app.use('/balance', balanceRouter)
app.use('/nonce', vaultNonceRouter)

/**
 * POST endpoint for receiving signed intentions.
 * Validates the intention, signature, and vault address before processing.
 *
 * @param req - Express request object with body containing intention, signature, and from
 * @param res - Express response object
 * @returns Response indicating success or failure
 */
app.post('/intention', bearerAuth, async (req, res) => {
	try {
		const { intention, signature, from } = req.body
		if (!intention || !signature || !from) {
			throw new Error('Missing required fields')
		}
		logger.info('Received signed intention', { from, signature: signature.slice(0, 10) + '...' })
		const response = await handleIntention(intention, signature, from)
		res.status(200).json(response)
	} catch (error) {
		logger.error('Error handling intention', error)
		res
			.status(500)
			.json({ error: error instanceof Error ? error.message : 'Unknown error' })
	}
})

/**
 * Interval timer that creates and publishes bundles every 10 seconds.
 * Bundles cached intentions, uploads to IPFS, and submits CIDs to blockchain.
 */
setInterval(async () => {
	try {
		await createAndPublishBundle()
	} catch (error) {
		logger.error('Error creating and publishing bundle', error)
	}
}, 10 * 1000)

/**
 * Start the Express server on the configured port
 */
app.listen(port, () => {
	displayBanner()
	logger.info(`Server running on port ${port}`)
})

export { app }
