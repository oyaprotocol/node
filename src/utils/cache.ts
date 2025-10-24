/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         Generic Cache Utility                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Generic in-memory cache with TTL (time-to-live) support.
 * Provides automatic expiration and cache statistics.
 *
 * @packageDocumentation
 */

import type { CacheEntry, CacheStats } from '../types/cache.js'

/**
 * Generic in-memory cache with TTL support.
 * Type parameter T: The type of values stored in the cache
 */
export class Cache<T> {
	private cache: Map<string, CacheEntry<T>>
	private ttl: number

	/**
	 * Creates a new cache instance.
	 * @param ttl - Time-to-live in milliseconds
	 */
	constructor(ttl: number) {
		this.cache = new Map()
		this.ttl = ttl
	}

	/**
	 * Get a value from the cache.
	 * Returns undefined if not found or expired.
	 * This allows null to be a valid cached value.
	 * @param key - Cache key
	 * @returns Cached value or undefined if not found/expired
	 */
	get(key: string): T | undefined {
		const entry = this.cache.get(key)

		if (!entry) {
			return undefined
		}

		// Check if expired
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key)
			return undefined
		}

		return entry.value
	}

	/**
	 * Store a value in the cache.
	 * @param key - Cache key
	 * @param value - Value to cache (cannot be undefined; use null instead)
	 * @throws Error if attempting to cache undefined
	 */
	set(key: string, value: T): void {
		if (value === undefined) {
			throw new Error(
				'Cannot cache undefined values. Use null to represent missing data.'
			)
		}

		this.cache.set(key, {
			value,
			timestamp: Date.now(),
		})
	}

	/**
	 * Check if a key exists and is not expired.
	 * @param key - Cache key
	 * @returns True if key exists and is valid
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined
	}

	/**
	 * Clear all entries from the cache.
	 * @returns Number of entries cleared
	 */
	clear(): number {
		const size = this.cache.size
		this.cache.clear()
		return size
	}

	/**
	 * Get cache statistics.
	 * @returns Cache statistics including valid/expired counts
	 */
	getStats(): CacheStats {
		const now = Date.now()
		let valid = 0
		let expired = 0

		for (const entry of this.cache.values()) {
			if (now - entry.timestamp < this.ttl) {
				valid++
			} else {
				expired++
			}
		}

		return {
			total: this.cache.size,
			valid,
			expired,
			ttlMs: this.ttl,
		}
	}

	/**
	 * Remove expired entries from the cache.
	 * @returns Number of entries removed
	 */
	prune(): number {
		const now = Date.now()
		let removed = 0

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > this.ttl) {
				this.cache.delete(key)
				removed++
			}
		}

		return removed
	}
}
