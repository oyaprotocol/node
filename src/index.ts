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

import express from 'express'
import bppkg from 'body-parser'
import pgpkg from 'pg'

import { displayBanner } from './utils/banner.js'
import { logger, diagnostic, logAvailableEndpoints } from './utils/logger.js'
import { setupEnvironment } from './utils/env.js'
import { initializeDatabase } from './utils/database.js'
import { registerShutdownHandlers } from './utils/gracefulShutdown.js'
import type { DatabaseHealthMonitor } from './utils/database.js'
import { routeMounts } from './routes.js'
import { createAndPublishBundle, initializeProposer } from './proposer.js'
import { bearerAuth } from './auth.js'
import { createRateLimiter } from './middleware/rateLimit.js'

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                          ENVIRONMENT SETUP                                ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

// Display banner
displayBanner()

// Initialize and validate environment
const envConfig = setupEnvironment()
const { PORT, DATABASE_URL, DATABASE_SSL } = envConfig

// Initialize proposer module
try {
	await initializeProposer()
} catch (error) {
	logger.error('Failed to initialize proposer:', error)
	process.exit(1)
}

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                           SERVER SETUP                                    ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

const { json } = bppkg

/** Express application instance for the Oya node server */
const app = express()
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

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                          DATABASE CONNECTION                              ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

const { Pool } = pgpkg

/**
 * PostgreSQL connection pool for database operations.
 * SSL configuration is determined by DATABASE_SSL environment variable.
 */
export const pool = new Pool({
	connectionString: DATABASE_URL,
	ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
})

if (!DATABASE_SSL) {
	logger.debug('Database SSL disabled (DATABASE_SSL=false)')
}

/** Database health monitor instance */
let dbHealthMonitor: DatabaseHealthMonitor | undefined

// Initialize database with validation and monitoring
try {
	dbHealthMonitor = await initializeDatabase(pool, {
		validateSchema: true,
		startHealthMonitoring: true,
		healthCheckInterval: 30000,
	})
	logger.info('Database validation and monitoring initialized')
} catch (error) {
	logger.fatal('Failed to initialize database:', error)
	process.exit(1)
}

/**
 * Rate limiting middleware for all endpoints.
 * Applies read-tier rate limiting (configurable via environment variables).
 * Uses PostgreSQL storage for persistence across restarts.
 * Rate limits by IP address for unauthenticated requests and by Bearer token for authenticated requests.
 */
app.use(createRateLimiter('read'))

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                            ROUTE HANDLERS                                 ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

// Mount route handlers
logger.debug('Mounting route handlers')
for (const { basePath, router } of routeMounts) {
	app.use(basePath, router)
}
logger.debug('All routes mounted successfully')

// Log available endpoints in debug mode
logAvailableEndpoints(routeMounts)

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                          BUNDLE PROCESSING                                ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

/**
 * Interval timer that creates and publishes bundles every 10 seconds.
 * Bundles cached intentions, uploads to IPFS, and submits CIDs to blockchain.
 */
const bundleInterval = setInterval(async () => {
	try {
		await createAndPublishBundle()
	} catch (error) {
		logger.error('Error creating and publishing bundle', error)
	}
}, 10 * 1000)

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                           SERVER STARTUP                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

/**
 * Start the Express server on the configured port
 */
const server = app.listen(PORT, () => {
	logger.info(`Server running on port ${PORT}`)
})

// Register graceful shutdown handlers
registerShutdownHandlers({
	server,
	pool,
	dbHealthMonitor,
	bundleInterval,
})

export { app }
