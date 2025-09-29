/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                     Database Validation Utility                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Validates database connections and schema integrity at startup.
 * Provides retry logic for connection attempts and continuous health monitoring.
 *
 * Key features:
 * - Connection validation with exponential backoff retry
 * - Schema validation to ensure required tables exist
 * - Periodic health monitoring with failure detection
 * - Graceful shutdown handling
 *
 * @packageDocumentation
 */

import { Pool } from 'pg'
import { createLogger, diagnostic } from './logger.js'
import {
	DEFAULT_RETRY_CONFIG,
	DEFAULT_HEALTH_CHECK_INTERVAL,
	REQUIRED_TABLES,
} from '../config/dbSettings.js'
import type {
	DatabaseValidationResult,
	DatabaseRetryConfig,
	DatabaseInitOptions,
	DatabaseHealthStatus,
} from '../types/db.js'

/** Logger instance for database validation */
const logger = createLogger('DatabaseValidator')

/**
 * Validates database connection with retry logic.
 * Attempts to connect to the database with exponential backoff.
 *
 * @param pool - PostgreSQL connection pool
 * @param retryConfig - Retry configuration for connection attempts
 * @returns Validation result with success status and optional error details
 */
export async function validateConnection(
	pool: Pool,
	retryConfig: DatabaseRetryConfig = DEFAULT_RETRY_CONFIG
): Promise<DatabaseValidationResult> {
	let lastError: Error | undefined
	const startTime = Date.now()

	for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
		try {
			logger.info(
				`Attempting database connection (attempt ${attempt}/${retryConfig.maxAttempts})`
			)

			const client = await pool.connect()
			const result = await client.query('SELECT NOW()')
			client.release()

			const connectionTime = Date.now() - startTime
			logger.info('Database connection successful', {
				timestamp: result.rows[0].now,
				connectionTime,
			})

			diagnostic.info('Database connection established', {
				attempt,
				totalAttempts: retryConfig.maxAttempts,
				connectionTime,
				timestamp: result.rows[0].now,
			})

			return {
				success: true,
				details: {
					timestamp: result.rows[0].now,
					connectionTime,
					attemptsNeeded: attempt,
				},
			}
		} catch (error) {
			lastError = error as Error

			// Provide helpful error messages for common issues
			if (lastError.message.includes('does not support SSL')) {
				logger.warn(
					'‼️ SSL connection failed. If connecting to a local database, ' +
						'set DATABASE_SSL=false in your .env file'
				)
			} else if (
				lastError.message.includes('database') &&
				lastError.message.includes('does not exist')
			) {
				logger.warn(
					'‼️ Database does not exist. Create it with: ' +
						'createdb oya_db (or use psql/pgAdmin)'
				)
			} else if (lastError.message.includes('password authentication failed')) {
				logger.warn(
					'‼️ Authentication failed. Check your DATABASE_URL credentials'
				)
			}

			logger.warn(`Database connection attempt ${attempt} failed:`, error)

			diagnostic.debug('Connection attempt failed', {
				attempt,
				error: lastError.message,
				willRetry: attempt < retryConfig.maxAttempts,
			})

			if (attempt < retryConfig.maxAttempts) {
				const delay =
					retryConfig.delayMs *
					Math.pow(retryConfig.backoffMultiplier, attempt - 1)
				logger.info(`Retrying in ${delay}ms...`)
				await sleep(delay)
			}
		}
	}

	diagnostic.error('Database connection failed after all attempts', {
		maxAttempts: retryConfig.maxAttempts,
		lastError: lastError?.message,
		totalTime: Date.now() - startTime,
	})

	return {
		success: false,
		error: lastError?.message || 'Failed to connect after all retry attempts',
		details: {
			attempts: retryConfig.maxAttempts,
			totalTime: Date.now() - startTime,
		},
	}
}

/**
 * Validates that all required database tables exist.
 * Checks the information_schema for table existence.
 *
 * @param pool - PostgreSQL connection pool
 * @returns Validation result with list of any missing tables
 */
export async function validateSchema(
	pool: Pool
): Promise<DatabaseValidationResult> {
	const missingTables: string[] = []
	const startTime = Date.now()

	try {
		const client = await pool.connect()

		for (const tableName of REQUIRED_TABLES) {
			const result = await client.query(
				`SELECT EXISTS (
					SELECT FROM information_schema.tables
					WHERE table_schema = 'public'
					AND table_name = $1
				)`,
				[tableName]
			)

			if (!result.rows[0].exists) {
				missingTables.push(tableName)
			}
		}

		client.release()

		if (missingTables.length > 0) {
			logger.error('Missing database tables:', missingTables)
			diagnostic.error('Schema validation failed', {
				missingTables,
				validationTime: Date.now() - startTime,
			})

			return {
				success: false,
				error: `Missing required tables: ${missingTables.join(', ')}`,
				details: { missingTables },
			}
		}

		logger.info('Database schema validation successful')
		diagnostic.info('Schema validation completed', {
			tablesChecked: REQUIRED_TABLES.length,
			validationTime: Date.now() - startTime,
		})

		return {
			success: true,
			details: {
				tablesValidated: REQUIRED_TABLES,
				validationTime: Date.now() - startTime,
			},
		}
	} catch (error) {
		const errorMessage = (error as Error).message
		logger.error('Schema validation failed:', error)
		diagnostic.error('Schema validation error', {
			error: errorMessage,
			validationTime: Date.now() - startTime,
		})

		return {
			success: false,
			error: `Schema validation error: ${errorMessage}`,
		}
	}
}

/**
 * Database health monitoring manager.
 * Provides continuous health checks and status tracking.
 */
export class DatabaseHealthMonitor {
	private pool: Pool
	private healthStatus: DatabaseHealthStatus
	private healthCheckInterval?: NodeJS.Timeout

	constructor(pool: Pool) {
		this.pool = pool
		this.healthStatus = {
			isHealthy: false,
			failedChecks: 0,
		}
	}

	/**
	 * Starts periodic health checks on the database connection.
	 * @param intervalMs - Interval between health checks in milliseconds
	 */
	start(intervalMs: number = DEFAULT_HEALTH_CHECK_INTERVAL): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
		}

		this.healthCheckInterval = setInterval(async () => {
			try {
				const client = await this.pool.connect()
				await client.query('SELECT 1')
				client.release()

				if (!this.healthStatus.isHealthy) {
					logger.info('Database connection restored')
					diagnostic.info('Database health restored', {
						previousFailures: this.healthStatus.failedChecks,
					})
				}

				this.healthStatus = {
					isHealthy: true,
					lastHealthCheck: new Date(),
					failedChecks: 0,
				}
			} catch (error) {
				const newFailureCount = (this.healthStatus.failedChecks || 0) + 1

				if (this.healthStatus.isHealthy) {
					logger.error('Database connection lost:', error)
					diagnostic.error('Database health check failed', {
						error: (error as Error).message,
						consecutiveFailures: newFailureCount,
					})
				}

				this.healthStatus = {
					isHealthy: false,
					lastHealthCheck: new Date(),
					failedChecks: newFailureCount,
				}
			}
		}, intervalMs)

		logger.info(`Health monitoring started (interval: ${intervalMs}ms)`)
		diagnostic.info('Database health monitoring initialized', {
			intervalMs,
		})
	}

	/**
	 * Stops the health monitoring process.
	 */
	stop(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = undefined
			logger.info('Health monitoring stopped')
			diagnostic.debug('Database health monitoring stopped')
		}
	}

	/**
	 * Gets the current health status of the database.
	 * @returns Current health status information
	 */
	getStatus(): DatabaseHealthStatus {
		return { ...this.healthStatus }
	}
}

/**
 * Initializes database connection with validation and monitoring.
 * Performs connection validation, schema checks, and sets up health monitoring.
 *
 * @param pool - PostgreSQL connection pool
 * @param options - Initialization options for validation and monitoring
 * @returns Database health monitor instance
 * @throws Error if connection or schema validation fails
 */
export async function initializeDatabase(
	pool: Pool,
	options: DatabaseInitOptions = {}
): Promise<DatabaseHealthMonitor> {
	const startTime = Date.now()
	const retryConfig = {
		...DEFAULT_RETRY_CONFIG,
		...options.retryConfig,
	}

	diagnostic.info('Starting database initialization', {
		validateSchema: options.validateSchema !== false,
		startHealthMonitoring: options.startHealthMonitoring !== false,
		retryConfig,
	})

	// Validate connection with retries
	const connectionResult = await validateConnection(pool, retryConfig)
	if (!connectionResult.success) {
		throw new Error(`Database connection failed: ${connectionResult.error}`)
	}

	// Validate schema if requested
	if (options.validateSchema !== false) {
		const schemaResult = await validateSchema(pool)
		if (!schemaResult.success) {
			throw new Error(
				`Database schema validation failed: ${schemaResult.error}`
			)
		}
	}

	// Create and optionally start health monitor
	const monitor = new DatabaseHealthMonitor(pool)
	if (options.startHealthMonitoring !== false) {
		monitor.start(options.healthCheckInterval)
	}

	const totalTime = Date.now() - startTime
	logger.info(`Database initialization completed in ${totalTime}ms`)
	diagnostic.info('Database initialization successful', {
		totalTime,
		connectionDetails: connectionResult.details,
	})

	return monitor
}

/**
 * Utility function to sleep for a specified duration.
 * Used for retry delays.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
