/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                        Cache Utility Tests                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Comprehensive unit tests for the generic cache utility.
 * Tests TTL expiration, cache operations, and statistics.
 */

import { describe, test, expect } from 'bun:test'
import { Cache } from '../src/utils/cache.js'

describe('Cache Utility', () => {
	describe('Basic Operations', () => {
		test('should store and retrieve values', () => {
			const cache = new Cache<string>(1000) // 1 second TTL

			cache.set('key1', 'value1')
			cache.set('key2', 'value2')

			expect(cache.get('key1')).toBe('value1')
			expect(cache.get('key2')).toBe('value2')
		})

		test('should return undefined for non-existent keys', () => {
			const cache = new Cache<string>(1000)

			expect(cache.get('nonexistent')).toBeUndefined()
		})

		test('should handle different value types', () => {
			const stringCache = new Cache<string>(1000)
			const numberCache = new Cache<number>(1000)
			const objectCache = new Cache<{ foo: string }>(1000)

			stringCache.set('str', 'hello')
			numberCache.set('num', 42)
			objectCache.set('obj', { foo: 'bar' })

			expect(stringCache.get('str')).toBe('hello')
			expect(numberCache.get('num')).toBe(42)
			expect(objectCache.get('obj')).toEqual({ foo: 'bar' })
		})

		test('should overwrite existing keys', () => {
			const cache = new Cache<string>(1000)

			cache.set('key', 'value1')
			expect(cache.get('key')).toBe('value1')

			cache.set('key', 'value2')
			expect(cache.get('key')).toBe('value2')
		})
	})

	describe('TTL (Time-To-Live)', () => {
		test('should expire entries after TTL', async () => {
			const cache = new Cache<string>(50) // 50ms TTL

			cache.set('key', 'value')
			expect(cache.get('key')).toBe('value')

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 60))

			expect(cache.get('key')).toBeUndefined()
		})

		test('should not expire entries before TTL', async () => {
			const cache = new Cache<string>(100) // 100ms TTL

			cache.set('key', 'value')

			// Wait less than TTL
			await new Promise((resolve) => setTimeout(resolve, 50))

			expect(cache.get('key')).toBe('value')
		})

		test('should handle very short TTL', async () => {
			const cache = new Cache<string>(10) // 10ms TTL

			cache.set('key', 'value')
			await new Promise((resolve) => setTimeout(resolve, 15))

			expect(cache.get('key')).toBeUndefined()
		})

		test('should handle long TTL', () => {
			const cache = new Cache<string>(60000) // 1 minute

			cache.set('key', 'value')
			expect(cache.get('key')).toBe('value')
		})
	})

	describe('has() method', () => {
		test('should return true for existing valid entries', () => {
			const cache = new Cache<string>(1000)

			cache.set('key', 'value')
			expect(cache.has('key')).toBe(true)
		})

		test('should return false for non-existent entries', () => {
			const cache = new Cache<string>(1000)

			expect(cache.has('nonexistent')).toBe(false)
		})

		test('should return false for expired entries', async () => {
			const cache = new Cache<string>(50)

			cache.set('key', 'value')
			expect(cache.has('key')).toBe(true)

			await new Promise((resolve) => setTimeout(resolve, 60))
			expect(cache.has('key')).toBe(false)
		})
	})

	describe('clear() method', () => {
		test('should clear all entries', () => {
			const cache = new Cache<string>(1000)

			cache.set('key1', 'value1')
			cache.set('key2', 'value2')
			cache.set('key3', 'value3')

			const cleared = cache.clear()

			expect(cleared).toBe(3)
			expect(cache.get('key1')).toBeUndefined()
			expect(cache.get('key2')).toBeUndefined()
			expect(cache.get('key3')).toBeUndefined()
		})

		test('should return 0 when clearing empty cache', () => {
			const cache = new Cache<string>(1000)

			expect(cache.clear()).toBe(0)
		})

		test('should clear both valid and expired entries', async () => {
			const cache = new Cache<string>(50)

			cache.set('key1', 'value1')
			await new Promise((resolve) => setTimeout(resolve, 60))
			cache.set('key2', 'value2') // This one is fresh

			const cleared = cache.clear()
			expect(cleared).toBe(2)
		})
	})

	describe('getStats() method', () => {
		test('should return correct statistics for empty cache', () => {
			const cache = new Cache<string>(1000)

			const stats = cache.getStats()

			expect(stats).toEqual({
				total: 0,
				valid: 0,
				expired: 0,
				ttlMs: 1000,
			})
		})

		test('should count valid entries correctly', () => {
			const cache = new Cache<string>(1000)

			cache.set('key1', 'value1')
			cache.set('key2', 'value2')

			const stats = cache.getStats()

			expect(stats.total).toBe(2)
			expect(stats.valid).toBe(2)
			expect(stats.expired).toBe(0)
			expect(stats.ttlMs).toBe(1000)
		})

		test('should count expired entries correctly', async () => {
			const cache = new Cache<string>(50)

			cache.set('key1', 'value1')
			cache.set('key2', 'value2')

			await new Promise((resolve) => setTimeout(resolve, 60))

			cache.set('key3', 'value3') // Fresh entry

			const stats = cache.getStats()

			expect(stats.total).toBe(3)
			expect(stats.valid).toBe(1) // Only key3 is valid
			expect(stats.expired).toBe(2) // key1 and key2 are expired
		})
	})

	describe('prune() method', () => {
		test('should remove only expired entries', async () => {
			const cache = new Cache<string>(50)

			cache.set('expired1', 'value1')
			cache.set('expired2', 'value2')

			await new Promise((resolve) => setTimeout(resolve, 60))

			cache.set('fresh', 'value3')

			const removed = cache.prune()

			expect(removed).toBe(2)
			expect(cache.get('expired1')).toBeUndefined()
			expect(cache.get('expired2')).toBeUndefined()
			expect(cache.get('fresh')).toBe('value3')
		})

		test('should return 0 when no entries to prune', () => {
			const cache = new Cache<string>(1000)

			cache.set('key1', 'value1')
			cache.set('key2', 'value2')

			const removed = cache.prune()
			expect(removed).toBe(0)
		})

		test('should work on empty cache', () => {
			const cache = new Cache<string>(1000)

			expect(cache.prune()).toBe(0)
		})

		test('should reduce cache size after pruning', async () => {
			const cache = new Cache<string>(50)

			cache.set('key1', 'value1')
			cache.set('key2', 'value2')
			cache.set('key3', 'value3')

			await new Promise((resolve) => setTimeout(resolve, 60))

			const statsBefore = cache.getStats()
			expect(statsBefore.total).toBe(3)

			cache.prune()

			const statsAfter = cache.getStats()
			expect(statsAfter.total).toBe(0)
			expect(statsAfter.expired).toBe(0)
		})
	})

	describe('Edge Cases', () => {
		test('should handle null values correctly', () => {
			const cache = new Cache<string | null>(1000)

			// Null is a valid cacheable value (distinct from "not found")
			cache.set('null', null)
			expect(cache.get('null')).toBeNull()
			expect(cache.has('null')).toBe(true)

			// Not found returns undefined (distinct from null)
			expect(cache.get('nonexistent')).toBeUndefined()
			expect(cache.has('nonexistent')).toBe(false)
		})

		test('should handle undefined values correctly', () => {
			const cache = new Cache<string | undefined>(1000)

			// Undefined is a valid cacheable value
			cache.set('undefined', undefined)
			expect(cache.get('undefined')).toBeUndefined()
			// Note: has() can't distinguish cached undefined from not found
			// This is a known limitation - use null instead if you need this distinction
			expect(cache.has('undefined')).toBe(false)
		})

		test('should handle empty strings as keys', () => {
			const cache = new Cache<string>(1000)

			cache.set('', 'empty key value')
			expect(cache.get('')).toBe('empty key value')
		})

		test('should handle complex objects', () => {
			interface ComplexType {
				id: number
				data: string[]
				nested: { foo: number }
			}

			const cache = new Cache<ComplexType>(1000)

			const complexValue: ComplexType = {
				id: 123,
				data: ['a', 'b', 'c'],
				nested: { foo: 42 },
			}

			cache.set('complex', complexValue)
			expect(cache.get('complex')).toEqual(complexValue)
		})

		test('should handle rapid successive operations', () => {
			const cache = new Cache<number>(1000)

			for (let i = 0; i < 100; i++) {
				cache.set(`key${i}`, i)
			}

			for (let i = 0; i < 100; i++) {
				expect(cache.get(`key${i}`)).toBe(i)
			}

			const stats = cache.getStats()
			expect(stats.total).toBe(100)
			expect(stats.valid).toBe(100)
		})
	})

	describe('Performance', () => {
		test('should handle large number of entries', () => {
			const cache = new Cache<number>(10000)

			const count = 1000
			for (let i = 0; i < count; i++) {
				cache.set(`key${i}`, i)
			}

			const stats = cache.getStats()
			expect(stats.total).toBe(count)
			expect(stats.valid).toBe(count)
		})

		test('should efficiently prune large cache', async () => {
			const cache = new Cache<number>(50)

			// Add 100 entries
			for (let i = 0; i < 100; i++) {
				cache.set(`key${i}`, i)
			}

			// Wait for expiration
			await new Promise((resolve) => setTimeout(resolve, 60))

			// Add 50 fresh entries
			for (let i = 100; i < 150; i++) {
				cache.set(`key${i}`, i)
			}

			const removed = cache.prune()
			expect(removed).toBe(100)

			const stats = cache.getStats()
			expect(stats.total).toBe(50)
			expect(stats.valid).toBe(50)
		})
	})
})
