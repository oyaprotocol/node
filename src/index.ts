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
import { logger, diagnostic } from './utils/logger.js'
import { validateEnv, printEnvValidationReport, setConfigCache } from './utils/env.js'
import type { EnvironmentConfig } from './types/setup.js'
import dotenv from 'dotenv'

// Load environment variables first
dotenv.config()

// Display banner first thing
displayBanner()

// Validate environment configuration
const envValidationResult = validateEnv()
printEnvValidationReport(envValidationResult)

if (!envValidationResult.valid) {
	process.exit(1)
}

// Cache the validated config for use throughout the application
setConfigCache(envValidationResult.config as EnvironmentConfig)

// Polyfill for CustomEvent in Node.js environment (required by Helia)
if (typeof globalThis.CustomEvent === 'undefined') {
	const { window } = new JSDOM()
	globalThis.CustomEvent = window.CustomEvent
	logger.debug('CustomEvent polyfill via jsdom applied.')
}

import express from 'express'
import bppkg from 'body-parser'
const { json } = bppkg
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

/** Express application instance for the Oya node server */
const app = express()

/** Port number for the server to listen on (defaults to 3000) */
const port = process.env.PORT || 3000

app.use(json())

/**
 * Diagnostic logging middleware for all HTTP requests
 */
app.use((req, res, next) => {
	const startTime = Date.now()
	const requestId = Math.random().toString(36).substring(7)

	diagnostic.trace('HTTP request received', {
		requestId,
		method: req.method,
		path: req.path,
		query: req.query,
		headers: req.headers,
		bodySize: req.body ? JSON.stringify(req.body).length : 0,
	})

	// Capture response on finish
	res.on('finish', () => {
		diagnostic.debug('HTTP response sent', {
			requestId,
			method: req.method,
			path: req.path,
			statusCode: res.statusCode,
			responseTime: Date.now() - startTime,
		})
	})

	next()
})

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

// Test database connection on startup
pool
	.connect()
	.then((client) => {
		logger.info('Database pool initialized successfully')
		client.release()
	})
	.catch((err) => {
		logger.error('Failed to initialize database pool:', err)
		logger.warn('Server will continue but database operations may fail')
	})

// Mount route handlers
logger.debug('Mounting route handlers')
app.use('/bundle', bundleRouter)
app.use('/cid', cidRouter)
app.use('/balance', balanceRouter)
app.use('/nonce', vaultNonceRouter)
logger.debug('All routes mounted successfully')

/**
 * POST endpoint for receiving signed intentions.
 * Validates the intention, signature, and vault address before processing.
 *
 * @param req - Express request object with body containing intention, signature, and from
 * @param res - Express response object
 * @returns Response indicating success or failure
 */
app.post('/intention', bearerAuth, async (req, res) => {
	const startTime = Date.now()
	try {
		const { intention, signature, from } = req.body
		if (!intention || !signature || !from) {
			diagnostic.debug('Missing intention fields', {
				hasIntention: !!intention,
				hasSignature: !!signature,
				hasFrom: !!from,
			})
			throw new Error('Missing required fields')
		}

		diagnostic.info('Intention endpoint called', {
			from,
			intentionType: intention.action_type || 'legacy',
			signaturePreview: signature.slice(0, 10) + '...',
		})

		logger.info('Received signed intention', {
			from,
			signature: signature.slice(0, 10) + '...',
		})
		const response = await handleIntention(intention, signature, from)

		diagnostic.info('Intention processed', {
			from,
			processingTime: Date.now() - startTime,
			success: true,
		})

		res.status(200).json(response)
	} catch (error) {
		diagnostic.error('Intention processing failed', {
			error: error instanceof Error ? error.message : String(error),
			processingTime: Date.now() - startTime,
		})
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
	logger.info(`Server running on port ${port}`)
})

export { app }
