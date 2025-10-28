/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                   Database URL Utility Functions                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Utilities for deriving and managing database connection URLs.
 * Shared between application code and database setup scripts.
 *
 * @packageDocumentation
 */

/**
 * Derives a test database URL from a production database URL.
 * Appends '_test' to the database name.
 *
 * @param productionUrl - The production database URL
 * @returns Test database URL with '_test' appended to database name
 *
 * @example
 * deriveTestDatabaseUrl('postgresql://localhost/oya_db')
 * // Returns: 'postgresql://localhost/oya_db_test'
 *
 * @example
 * deriveTestDatabaseUrl('postgresql://localhost/oya_db?ssl=true')
 * // Returns: 'postgresql://localhost/oya_db_test?ssl=true'
 */
export function deriveTestDatabaseUrl(productionUrl: string): string {
	return productionUrl.replace(/\/([^/]+)(\?|$)/, '/$1_test$2')
}

/**
 * Gets the appropriate database URL based on the current environment.
 *
 * - In test mode: Returns TEST_DATABASE_URL if set, otherwise derives from DATABASE_URL
 * - In production: Returns DATABASE_URL
 *
 * @param isTest - Whether running in test mode
 * @returns Database connection URL
 * @throws Error if required environment variables are not set
 */
export function getDatabaseUrl(isTest: boolean): string {
	if (isTest) {
		// Use TEST_DATABASE_URL if explicitly set
		if (process.env.TEST_DATABASE_URL) {
			return process.env.TEST_DATABASE_URL
		}

		// Derive from DATABASE_URL if available
		if (process.env.DATABASE_URL) {
			return deriveTestDatabaseUrl(process.env.DATABASE_URL)
		}

		throw new Error(
			'TEST_DATABASE_URL or DATABASE_URL required in test mode. Please run: bun run db:test:create'
		)
	} else {
		const url = process.env.DATABASE_URL
		if (!url) {
			throw new Error('DATABASE_URL required')
		}
		return url
	}
}
