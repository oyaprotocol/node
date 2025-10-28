/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                        Express Application Factory                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Creates and configures the Express application with all middleware and routes.
 * Separated from server.ts to enable testing without starting the server.
 *
 * @packageDocumentation
 */

import express from 'express'
import bppkg from 'body-parser'
import { logger, logAvailableEndpoints } from './utils/logger.js'
import { routeMounts } from './routes.js'
import { diagnosticLogger } from './middleware/diagnostic.js'
import { protectPostEndpoints } from './middleware/postAuth.js'
import { createRateLimiter } from './middleware/rateLimit.js'

const { json } = bppkg

/**
 * Creates and configures the Express application.
 *
 * Sets up:
 * - JSON body parsing
 * - Diagnostic logging
 * - POST endpoint authentication
 * - Rate limiting
 * - Route handlers
 *
 * @returns Configured Express application instance
 * @public
 */
export function createApp(): express.Application {
	const app = express()

	// Parse JSON request bodies
	app.use(json())

	// Diagnostic logging for all requests/responses
	app.use(diagnosticLogger)

	// Protect all POST endpoints with Bearer token auth
	app.use(protectPostEndpoints)

	// Apply rate limiting to all endpoints (requires database)
	app.use(createRateLimiter('permissive'))

	// Mount route handlers
	logger.debug('Mounting route handlers')
	for (const { basePath, router } of routeMounts) {
		app.use(basePath, router)
	}
	logger.debug('All routes mounted successfully')

	// Log available endpoints in debug mode
	logAvailableEndpoints(routeMounts)

	return app
}
