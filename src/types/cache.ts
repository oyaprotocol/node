/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Cache Type Definitions                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Type definitions for caching systems used throughout the application.
 *
 * @packageDocumentation
 */

/**
 * Represents a cached entry with a timestamp for TTL management.
 */
export interface CacheEntry<T> {
	/** The cached value */
	value: T
	/** Unix timestamp (ms) when this entry was cached */
	timestamp: number
}

/**
 * Statistics about cache performance and state.
 */
export interface CacheStats {
	/** Total number of entries in the cache */
	total: number
	/** Number of valid (non-expired) entries */
	valid: number
	/** Number of expired entries still in cache */
	expired: number
	/** Cache TTL in milliseconds */
	ttlMs: number
}
