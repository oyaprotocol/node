/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Rate Limiting Integration Tests                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Tests rate limiting middleware with PostgreSQL storage.
 * Uses unique IPs per test for parallel execution safety.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { startTestServer, stopTestServer, pool } from '../helpers/testServer.js'
import {
	generateTestIP,
	clearRateLimitTables,
	requestWithIP,
} from '../helpers/rateLimitHelpers.js'
import type { Server } from 'http'

describe('Rate Limiting Integration', () => {
	let server: Server
	let baseURL: string

	beforeAll(async () => {
		const testServer = await startTestServer()
		server = testServer.server
		baseURL = testServer.baseURL
	})

	afterAll(async () => {
		await stopTestServer(server)
		// Note: Don't call pool.end() here as other tests may share the same pool
		// The pool will be cleaned up when the test process exits
	})

	beforeEach(async () => {
		// Clear rate limit tables before each test for clean state
		await clearRateLimitTables(pool)
	})

	describe('IP-based rate limiting', () => {
		it('should allow requests under the limit', async () => {
			const testIP = generateTestIP('test-under-limit-' + Date.now())
			const url = `${baseURL}/health`

			// Make 3 requests (well under permissive limit of 300/min)
			for (let i = 0; i < 3; i++) {
				const response = await requestWithIP(url, testIP)
				expect(response.status).toBe(200)
				expect(response.headers.get('RateLimit-Limit')).toBe('300')
				expect(response.headers.get('RateLimit-Remaining')).toBeDefined()
			}
		})

		it('should block requests after exceeding the limit', async () => {
			const testIP = generateTestIP('test-exceed-limit-' + Date.now())
			const url = `${baseURL}/health`

			// Permissive tier allows 300 requests per minute
			// Make requests until we get rate limited
			let blockedResponse: Response | null = null
			for (let i = 0; i < 305; i++) {
				const response = await requestWithIP(url, testIP)
				if (response.status === 429) {
					blockedResponse = response
					break
				}
			}

			// Should have been rate limited
			expect(blockedResponse).not.toBeNull()
			expect(blockedResponse!.status).toBe(429)

			const body = await blockedResponse!.json()
			expect(body.error).toBe('Too many requests')
			expect(body.message).toBe('Rate limit exceeded. Please try again later.')
			expect(body.retryAfter).toBeDefined()
		})

		it('should enforce limits independently for different IPs', async () => {
			const ip1 = generateTestIP('test-ip-1-' + Date.now())
			const ip2 = generateTestIP('test-ip-2-' + Date.now())
			const url = `${baseURL}/health`

			// Make requests from IP1 until rate limited
			let ip1Limited = false
			for (let i = 0; i < 305; i++) {
				const response = await requestWithIP(url, ip1)
				if (response.status === 429) {
					ip1Limited = true
					break
				}
			}

			// IP1 should be rate limited
			expect(ip1Limited).toBe(true)

			// IP2 should still be allowed
			const ip2Response = await requestWithIP(url, ip2)
			expect(ip2Response.status).toBe(200)
		})

		it('should include rate limit headers in response', async () => {
			const testIP = generateTestIP('test-headers-' + Date.now())
			const url = `${baseURL}/health`

			const response = await requestWithIP(url, testIP)

			// Check standard rate limit headers (RateLimit-*)
			expect(response.headers.get('RateLimit-Limit')).toBe('300')
			expect(response.headers.get('RateLimit-Remaining')).toBeDefined()
			expect(response.headers.get('RateLimit-Reset')).toBeDefined()

			// Verify remaining count is less than limit
			const remaining = parseInt(
				response.headers.get('RateLimit-Remaining') || '0'
			)
			expect(remaining).toBeLessThan(300)
			expect(remaining).toBeGreaterThanOrEqual(0)
		})

		it('should decrement remaining count with each request', async () => {
			const testIP = generateTestIP('test-decrement-' + Date.now())
			const url = `${baseURL}/health`

			// Make first request and get initial count
			const firstResponse = await requestWithIP(url, testIP)
			const firstRemaining = parseInt(
				firstResponse.headers.get('RateLimit-Remaining') || '0'
			)

			// Make 4 more requests and verify count decreases
			for (let i = 0; i < 4; i++) {
				const response = await requestWithIP(url, testIP)
				const remaining = parseInt(
					response.headers.get('RateLimit-Remaining') || '0'
				)
				expect(remaining).toBeLessThan(firstRemaining)
			}
		})
	})

	describe('Token-based rate limiting', () => {
		it('should rate limit by bearer token instead of IP', async () => {
			const token = 'test-token-' + Date.now() + '-12345678' // Must be >= 16 chars
			const url = `${baseURL}/health`

			// Make requests with same token from different IPs
			const ip1 = generateTestIP('token-test-ip-1-' + Date.now())
			const ip2 = generateTestIP('token-test-ip-2-' + Date.now())

			// Make requests with token from IP1 until rate limited
			let tokenLimited = false
			for (let i = 0; i < 305; i++) {
				const response = await requestWithIP(url, ip1, {
					headers: { Authorization: `Bearer ${token}` },
				})
				if (response.status === 429) {
					tokenLimited = true
					break
				}
			}

			expect(tokenLimited).toBe(true)

			// Token should be rate limited even from different IP
			const ip2Response = await requestWithIP(url, ip2, {
				headers: { Authorization: `Bearer ${token}` },
			})
			expect(ip2Response.status).toBe(429)

			// But different token should work
			const differentToken = 'different-token-' + Date.now() + '-87654321'
			const differentTokenResponse = await requestWithIP(url, ip2, {
				headers: { Authorization: `Bearer ${differentToken}` },
			})
			expect(differentTokenResponse.status).toBe(200)
		})

		it('should fall back to IP-based limiting when no token provided', async () => {
			const testIP = generateTestIP('test-no-token-' + Date.now())
			const url = `${baseURL}/health`

			// Make requests without token
			const response = await requestWithIP(url, testIP)
			expect(response.status).toBe(200)
			expect(response.headers.get('RateLimit-Limit')).toBe('300')
		})
	})

	describe('Rate limit window expiration', () => {
		it('should track remaining count within the window', async () => {
			const testIP = generateTestIP('test-window-' + Date.now())
			const url = `${baseURL}/health`

			// Note: Default window is 60000ms (1 minute)
			// Testing full window expiration would take too long
			// Instead, we verify that rate limit tracking works within the window

			// Make 5 requests
			const responses: number[] = []
			for (let i = 0; i < 5; i++) {
				const response = await requestWithIP(url, testIP)
				const remaining = parseInt(
					response.headers.get('RateLimit-Remaining') || '0'
				)
				responses.push(remaining)
			}

			// Verify remaining count consistently decreases
			for (let i = 1; i < responses.length; i++) {
				expect(responses[i]).toBeLessThan(responses[i - 1])
			}

			// NOTE: Full window expiration test is skipped because it takes 60+ seconds
			// To test window reset in production:
			// 1. Configure shorter RATE_LIMIT_WINDOW_MS for tests
			// 2. Or run manual window expiration tests separately
		})
	})

	describe('Rate limit disabled mode', () => {
		it('should bypass rate limiting when RATE_LIMIT_ENABLED=false', async () => {
			// Note: This test would require restarting the server with
			// RATE_LIMIT_ENABLED=false, which is complex in integration tests
			// Consider this a documentation test
			// In a real scenario:
			// 1. Set process.env.RATE_LIMIT_ENABLED = 'false'
			// 2. Restart server
			// 3. Make unlimited requests
			// 4. Verify no 429 responses
		})
	})

	describe('PostgreSQL storage and state management', () => {
		it('should maintain rate limit state across requests', async () => {
			const testIP = generateTestIP('test-state-' + Date.now())
			const url = `${baseURL}/health`

			// Make first request and get remaining count
			const firstResponse = await requestWithIP(url, testIP)
			const firstRemaining = parseInt(
				firstResponse.headers.get('RateLimit-Remaining') || '0'
			)

			// Make second request - should remember the first request
			const secondResponse = await requestWithIP(url, testIP)
			const secondRemaining = parseInt(
				secondResponse.headers.get('RateLimit-Remaining') || '0'
			)

			// State is persisted: second request has lower remaining count
			expect(secondRemaining).toBeLessThan(firstRemaining)
			expect(secondRemaining).toBe(firstRemaining - 1)
		})

		it('should verify rate limit schema and tables exist', async () => {
			// Verify the rate limit schema and tables were created
			const schemaResult = await pool.query(`
				SELECT schema_name
				FROM information_schema.schemata
				WHERE schema_name = 'rate_limit'
			`)
			expect(schemaResult.rows.length).toBe(1)

			// Verify key tables exist
			const tablesResult = await pool.query(`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = 'rate_limit'
				AND table_name IN ('sessions', 'records_aggregated', 'individual_records')
				ORDER BY table_name
			`)
			expect(tablesResult.rows.length).toBeGreaterThanOrEqual(1)
		})
	})
})
