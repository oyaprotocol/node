/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         Database Connection                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * PostgreSQL connection pool management.
 * Automatically switches between production and test databases based on NODE_ENV.
 *
 * @packageDocumentation
 */

import pgpkg from 'pg'
import { logger } from './utils/logger.js'
import { getDatabaseUrl } from './utils/databaseUrl.js'

const { Pool } = pgpkg

/**
 * Creates a PostgreSQL connection pool based on the current environment.
 *
 * - In test mode (NODE_ENV=test): Uses TEST_DATABASE_URL
 * - In production/development: Uses DATABASE_URL
 *
 * @returns Configured PostgreSQL connection pool
 */
function createPool(): pgpkg.Pool {
	const isTest = process.env.NODE_ENV === 'test'
	const connectionString = getDatabaseUrl(isTest)

	// SSL configuration (typically disabled for test databases)
	const sslEnabled = process.env.DATABASE_SSL === 'true' && !isTest
	const ssl = sslEnabled ? { rejectUnauthorized: false } : false

	if (isTest) {
		logger.debug('Using test database')
	} else if (!sslEnabled) {
		logger.debug('Database SSL disabled (DATABASE_SSL=false)')
	}

	return new Pool({
		connectionString,
		ssl,
	})
}

/**
 * PostgreSQL connection pool instance.
 * Shared across the application for database operations.
 *
 * In test mode, automatically connects to TEST_DATABASE_URL.
 * In production, connects to DATABASE_URL.
 *
 * @public
 */
export const pool = createPool()
