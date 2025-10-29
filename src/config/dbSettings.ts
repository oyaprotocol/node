/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                      Database Configuration                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Default configuration values for database connection and monitoring.
 * These values can be overridden when initializing the database.
 *
 * @packageDocumentation
 */

import type { DatabaseRetryConfig } from '../types/db.js'

/**
 * Default retry configuration for database connections.
 * Uses exponential backoff starting at 1 second.
 */
export const DEFAULT_RETRY_CONFIG: DatabaseRetryConfig = {
	maxAttempts: 5,
	delayMs: 1000,
	backoffMultiplier: 2,
}

/**
 * Default health check interval in milliseconds.
 * Checks database health every 30 seconds.
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL = 30000

/**
 * Required database tables for the Oya node.
 * Schema validation ensures all these tables exist.
 */
export const REQUIRED_TABLES = [
	'bundles',
	'cids',
	'balances',
	'proposers',
	'vaults',
	'deposits',
	'deposit_assignment_events',
] as const
