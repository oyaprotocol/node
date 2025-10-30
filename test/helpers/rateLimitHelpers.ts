/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Rate Limit Test Utilities                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Utilities for testing rate limiting with proper test isolation.
 * Provides unique IP generation and database cleanup for parallel test execution.
 */

import type { Pool } from 'pg'

/**
 * Generates a unique test IP address based on a seed string.
 * Uses deterministic hashing to create IPs in the 10.0.0.0/8 range.
 *
 * This ensures:
 * - Each test gets a unique IP (no collision in parallel execution)
 * - Same seed always generates same IP (test reproducibility)
 * - IPs are in private range (10.0.0.0/8)
 *
 * @param seed - Unique seed for this test (e.g., test name)
 * @returns IPv4 address in format "10.x.x.x"
 *
 * @example
 * ```typescript
 * const ip1 = generateTestIP('test-rate-limit-by-ip')
 * const ip2 = generateTestIP('test-different-ips')
 * // ip1 !== ip2, guaranteed unique per seed
 * ```
 */
export function generateTestIP(seed: string): string {
	// Simple hash function to convert string to number
	const hash = seed.split('').reduce((acc, char) => {
		return (acc << 5) - acc + char.charCodeAt(0)
	}, 0)

	// Use 24 bits (16777216 possible IPs) in 10.0.0.0/8 range
	const num = Math.abs(hash) % 16777216

	// Extract octets
	const octet2 = (num >> 16) & 0xff
	const octet3 = (num >> 8) & 0xff
	const octet4 = num & 0xff

	return `10.${octet2}.${octet3}.${octet4}`
}

/**
 * Ensures the rate_limit schema and tables exist in the database.
 * Creates them if they don't exist yet.
 *
 * The rate-limit-postgresql package auto-creates tables on first use,
 * but we need to ensure they exist before trying to clear them in tests.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function ensureRateLimitSchema(pool: Pool): Promise<void> {
	const client = await pool.connect()
	try {
		// Create schema if it doesn't exist
		await client.query('CREATE SCHEMA IF NOT EXISTS rate_limit')

		// Create tables if they don't exist
		// These match the structure created by @acpr/rate-limit-postgresql
		await client.query(`
			CREATE TABLE IF NOT EXISTS rate_limit.sessions (
				sid varchar NOT NULL PRIMARY KEY,
				sess json NOT NULL,
				expire timestamp(6) NOT NULL
			)
		`)

		await client.query(`
			CREATE TABLE IF NOT EXISTS rate_limit.records_aggregated (
				key varchar NOT NULL PRIMARY KEY,
				value integer NOT NULL,
				expire timestamp(6) NOT NULL
			)
		`)

		await client.query(`
			CREATE TABLE IF NOT EXISTS rate_limit.individual_records (
				id varchar NOT NULL PRIMARY KEY,
				key varchar NOT NULL,
				expire timestamp(6) NOT NULL
			)
		`)

		// Create indexes
		await client.query(`
			CREATE INDEX IF NOT EXISTS idx_rate_limit_sessions_expire
			ON rate_limit.sessions (expire)
		`)

		await client.query(`
			CREATE INDEX IF NOT EXISTS idx_rate_limit_records_expire
			ON rate_limit.records_aggregated (expire)
		`)

		await client.query(`
			CREATE INDEX IF NOT EXISTS idx_rate_limit_individual_expire
			ON rate_limit.individual_records (expire)
		`)
	} finally {
		client.release()
	}
}

/**
 * Clears all rate limit data from the PostgreSQL database.
 *
 * Truncates:
 * - rate_limit.records_aggregated - Aggregated IP counts
 * - rate_limit.individual_records - Individual request records
 * - rate_limit.sessions - Session metadata
 *
 * Should be called in beforeEach() to ensure test isolation.
 * Will automatically ensure schema exists before attempting to clear.
 *
 * @param pool - PostgreSQL connection pool
 *
 * @example
 * ```typescript
 * beforeEach(async () => {
 *   await clearRateLimitTables(pool)
 * })
 * ```
 */
export async function clearRateLimitTables(pool: Pool): Promise<void> {
	// Ensure schema and tables exist first
	await ensureRateLimitSchema(pool)

	const client = await pool.connect()
	try {
		// Clear rate limit tables in correct order (handle foreign keys)
		await client.query('TRUNCATE TABLE rate_limit.records_aggregated CASCADE')
		await client.query('TRUNCATE TABLE rate_limit.individual_records CASCADE')
		await client.query('DELETE FROM rate_limit.sessions')
	} finally {
		client.release()
	}
}

/**
 * Makes an HTTP request with a custom IP address by setting X-Forwarded-For header.
 *
 * Note: Requires Express to be configured with trust proxy enabled.
 *
 * @param url - Full URL to request
 * @param ip - IP address to use for rate limiting
 * @param options - Additional fetch options
 * @returns Fetch response
 *
 * @example
 * ```typescript
 * const testIP = generateTestIP('my-test')
 * const response = await requestWithIP('http://localhost:3000/health', testIP)
 * ```
 */
export async function requestWithIP(
	url: string,
	ip: string,
	options: RequestInit = {}
): Promise<Response> {
	const headers = {
		...((options.headers as Record<string, string>) || {}),
		'X-Forwarded-For': ip,
	}

	return fetch(url, {
		...options,
		headers,
	})
}

/**
 * Helper to wait for rate limit window to expire.
 * Useful for testing window expiration behavior.
 *
 * @param windowMs - Rate limit window in milliseconds
 * @param buffer - Additional buffer time in milliseconds (default: 100ms)
 *
 * @example
 * ```typescript
 * // Make requests that hit limit
 * // ...
 *
 * // Wait for window to reset
 * await waitForRateLimitWindow(60000) // 1 minute + 100ms buffer
 *
 * // Should be able to make requests again
 * ```
 */
export async function waitForRateLimitWindow(
	windowMs: number,
	buffer = 100
): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, windowMs + buffer))
}
