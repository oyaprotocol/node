/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                      Database Type Definitions                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TypeScript type definitions for database validation and monitoring.
 * Includes types for connection validation, health checks, and retry configuration.
 *
 * @packageDocumentation
 */

/**
 * Result of database validation operations.
 * Provides success status and optional error details.
 */
export interface DatabaseValidationResult {
	/** Whether the validation succeeded */
	success: boolean
	/** Error message if validation failed */
	error?: string
	/** Additional details about the validation result */
	details?: Record<string, unknown>
}

/**
 * Configuration for database connection retry logic.
 * Controls retry behavior when connections fail.
 */
export interface DatabaseRetryConfig {
	/** Maximum number of connection attempts */
	maxAttempts: number
	/** Initial delay between attempts in milliseconds */
	delayMs: number
	/** Multiplier for exponential backoff */
	backoffMultiplier: number
}

/**
 * Options for database initialization and monitoring.
 */
export interface DatabaseInitOptions {
	/** Whether to validate database schema (default: true) */
	validateSchema?: boolean
	/** Whether to start health monitoring (default: true) */
	startHealthMonitoring?: boolean
	/** Interval for health checks in milliseconds (default: 30000) */
	healthCheckInterval?: number
	/** Retry configuration for connection attempts */
	retryConfig?: Partial<DatabaseRetryConfig>
}

/**
 * Database health status information.
 */
export interface DatabaseHealthStatus {
	/** Whether the database is currently healthy */
	isHealthy: boolean
	/** Timestamp of last successful health check */
	lastHealthCheck?: Date
	/** Number of consecutive failed health checks */
	failedChecks?: number
}