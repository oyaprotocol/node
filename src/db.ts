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
import { getEnvConfig } from './utils/env.js'
import { logger } from './utils/logger.js'

const { Pool } = pgpkg

/**
 * Cached pool instance (lazy initialization)
 */
let poolInstance: pgpkg.Pool | null = null

/**
 * Creates a PostgreSQL connection pool based on the current environment.
 *
 * - In test mode (NODE_ENV=test): Uses TEST_DATABASE_URL or derives from DATABASE_URL
 * - In production/development: Uses DATABASE_URL
 *
 * @returns Configured PostgreSQL connection pool
 */
function createPool(): pgpkg.Pool {
	const isTest = process.env.NODE_ENV === 'test'
	const config = getEnvConfig()

	let connectionString: string

	if (isTest) {
		// Use TEST_DATABASE_URL if set, otherwise derive from DATABASE_URL
		if (config.TEST_DATABASE_URL) {
			connectionString = config.TEST_DATABASE_URL
		} else if (config.DATABASE_URL) {
			// Derive test database URL by appending '_test' to database name
			connectionString = config.DATABASE_URL.replace(
				/\/([^/]+)(\?|$)/,
				'/$1_test$2'
			)
			logger.debug(
				'TEST_DATABASE_URL not set, derived from DATABASE_URL:',
				connectionString.replace(/:[^:@]+@/, ':***@')
			)
		} else {
			throw new Error(
				'TEST_DATABASE_URL not set and DATABASE_URL not available for derivation. Please run: bun run db:test:create'
			)
		}
	} else {
		connectionString = config.DATABASE_URL
	}

	// SSL configuration (typically disabled for test databases)
	const sslEnabled = config.DATABASE_SSL && !isTest
	const ssl = sslEnabled ? { rejectUnauthorized: false } : false

	if (isTest) {
		logger.debug('Using test database')
	} else if (!config.DATABASE_SSL) {
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
 * Lazily initialized on first access to ensure environment is validated first.
 *
 * @public
 */
export const pool = new Proxy({} as pgpkg.Pool, {
	get(_target, prop) {
		// Lazily create pool on first property access
		if (!poolInstance) {
			poolInstance = createPool()
		}
		// @ts-expect-error - Proxy to actual pool methods
		const value = poolInstance[prop]
		// Bind methods to the actual pool instance to preserve 'this' context
		if (typeof value === 'function') {
			return value.bind(poolInstance)
		}
		return value
	},
	// Forward all other operations to the real pool
	apply(_target, thisArg, args) {
		if (!poolInstance) {
			poolInstance = createPool()
		}
		// @ts-expect-error - Dynamic proxy forwarding
		return poolInstance.apply(thisArg, args)
	},
})
