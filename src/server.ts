/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                            Server Entry Point                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Main entry point for the Oya Natural Language Protocol Node.
 * Initializes the node, validates the database, and starts the Express server.
 *
 * @packageDocumentation
 */

import { displayBanner } from './utils/banner.js'
import { logger } from './utils/logger.js'
import { setupEnvironment } from './utils/env.js'
import { initializeDatabase } from './utils/database.js'
import { registerShutdownHandlers } from './utils/gracefulShutdown.js'
import type { DatabaseHealthMonitor } from './utils/database.js'
import { createAndPublishBundle, initializeProposer } from './proposer.js'
import { createApp } from './app.js'
import { pool } from './db.js'

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                          ENVIRONMENT SETUP                                ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

// Display banner
displayBanner()

// Initialize and validate environment
const envConfig = setupEnvironment()
const { PORT } = envConfig

// Initialize proposer module
try {
	await initializeProposer()
} catch (error) {
	logger.error('Failed to initialize proposer:', error)
	process.exit(1)
}

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                          DATABASE INITIALIZATION                          ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

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

/*
╔═══════════════════════════════════════════════════════════════════════════╗
║                           APPLICATION SETUP                               ║
╚═══════════════════════════════════════════════════════════════════════════╝
*/

/** Express application instance for the Oya node server */
const app = createApp()

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
