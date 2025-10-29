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
	ensureRateLimitSchema,
	requestWithIP,
} from '../helpers/rateLimitHelpers.js'
import { getEnvConfig } from '../../src/utils/env.js'
import type { Server } from 'http'

describe('Rate Limiting Integration', () => {
	let server: Server
	let baseURL: string
	let rateLimit: number
	// let rateLimitWindow: number // Used in comment on line 225

	beforeAll(async () => {
		const testServer = await startTestServer()
		server = testServer.server
		baseURL = testServer.baseURL

		// Get rate limit configuration from environment
		const config = getEnvConfig()
		rateLimit = config.RATE_LIMIT_PERMISSIVE
		// rateLimitWindow = config.RATE_LIMIT_WINDOW_MS

		// Ensure rate limit schema and tables exist (only once)
		await ensureRateLimitSchema(pool)
	})

	afterAll(async () => {
		await stopTestServer(server)
		// Note: Don't call pool.end() here as other tests may share the same pool
		// The pool will be cleaned up when the test process exits
	})

	beforeEach(async () => {
		// Clear rate limit tables before each test for clean state
		const client = await pool.connect()
		try {
			await client.query('TRUNCATE TABLE rate_limit.records_aggregated CASCADE')
			await client.query('TRUNCATE TABLE rate_limit.individual_records CASCADE')
			await client.query('DELETE FROM rate_limit.sessions')
		} finally {
			client.release()
		}
	})

	describe('IP-based rate limiting', () => {
		it('should allow requests under the limit', async () => {
			const testIP = generateTestIP('test-under-limit-' + Date.now())
			const url = `${baseURL}/health`

			// Make 3 requests (well under permissive limit)
			let previousRemaining = rateLimit
			for (let i = 0; i < 3; i++) {
				const response = await requestWithIP(url, testIP)
				expect(response.status).toBe(200)
				expect(response.headers.get('RateLimit-Limit')).toBe(String(rateLimit))

				const remaining = parseInt(
					response.headers.get('RateLimit-Remaining') || '0'
				)
				expect(remaining).toBe(previousRemaining - 1)
				previousRemaining = remaining
			}
		})

		it('should block requests after exceeding the limit', async () => {
			const testIP = generateTestIP('test-exceed-limit-' + Date.now())
			const url = `${baseURL}/health`

			// Make exactly rateLimit requests in parallel (much faster than sequential)
			const requests = Array.from({ length: rateLimit }, () =>
				requestWithIP(url, testIP)
			)
			await Promise.all(requests)

			// (rateLimit + 1)st request should be rate limited
			const blockedResponse = await requestWithIP(url, testIP)
			expect(blockedResponse.status).toBe(429)

			const body = await blockedResponse.json()
			expect(body.error).toBe('Too many requests')
			expect(body.message).toBe('Rate limit exceeded. Please try again later.')
			expect(body.retryAfter).toBeDefined()
		})

		it('should enforce limits independently for different IPs', async () => {
			const ip1 = generateTestIP('test-ip-1-' + Date.now())
			const ip2 = generateTestIP('test-ip-2-' + Date.now())
			const url = `${baseURL}/health`

			// Make rateLimit requests from IP1 in parallel to hit its limit
			const ip1Requests = Array.from({ length: rateLimit }, () =>
				requestWithIP(url, ip1)
			)
			await Promise.all(ip1Requests)

			// IP1 should be rate limited
			const ip1Response = await requestWithIP(url, ip1)
			expect(ip1Response.status).toBe(429)

			// IP2 should still be allowed
			const ip2Response = await requestWithIP(url, ip2)
			expect(ip2Response.status).toBe(200)
		})

		it('should include rate limit headers in response', async () => {
			const testIP = generateTestIP('test-headers-' + Date.now())
			const url = `${baseURL}/health`

			const response = await requestWithIP(url, testIP)

			// Check standard rate limit headers (RateLimit-*)
			expect(response.headers.get('RateLimit-Limit')).toBe(String(rateLimit))
			expect(response.headers.get('RateLimit-Remaining')).toBeDefined()
			expect(response.headers.get('RateLimit-Reset')).toBeDefined()

			// First request with unique IP should have exactly (rateLimit - 1) remaining
			const remaining = parseInt(
				response.headers.get('RateLimit-Remaining') || '0'
			)
			expect(remaining).toBe(rateLimit - 1)
		})

		it('should decrement remaining count with each request', async () => {
			const testIP = generateTestIP('test-decrement-' + Date.now())
			const url = `${baseURL}/health`

			// Make 5 requests and collect remaining counts
			const remainingCounts: number[] = []
			for (let i = 0; i < 5; i++) {
				const response = await requestWithIP(url, testIP)
				const remaining = parseInt(
					response.headers.get('RateLimit-Remaining') || '0'
				)
				remainingCounts.push(remaining)
			}

			// Verify each count is exactly 1 less than previous
			for (let i = 1; i < remainingCounts.length; i++) {
				expect(remainingCounts[i]).toBe(remainingCounts[i - 1] - 1)
			}
		})
	})

	describe('Token-based rate limiting', () => {
		it('should rate limit by bearer token instead of IP', async () => {
			const token = crypto.randomUUID()
			const url = `${baseURL}/health`

			// Make requests with same token from different IPs
			const ip1 = generateTestIP('token-test-ip-1-' + Date.now())
			const ip2 = generateTestIP('token-test-ip-2-' + Date.now())

			// Make rateLimit requests with token from IP1 in parallel
			const tokenRequests = Array.from({ length: rateLimit }, () =>
				requestWithIP(url, ip1, {
					headers: { Authorization: `Bearer ${token}` },
				})
			)
			await Promise.all(tokenRequests)

			// Token should be rate limited even from different IP
			const ip2Response = await requestWithIP(url, ip2, {
				headers: { Authorization: `Bearer ${token}` },
			})
			expect(ip2Response.status).toBe(429)

			// But different token should work
			const differentToken = crypto.randomUUID()
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
			expect(response.headers.get('RateLimit-Limit')).toBe(String(rateLimit))
		})
	})

	describe('Rate limit window expiration', () => {
		it('should track remaining count within the window', async () => {
			const testIP = generateTestIP('test-window-' + Date.now())
			const url = `${baseURL}/health`

			// Note: Window is configured via RATE_LIMIT_WINDOW_MS env var
			// Testing full window expiration would take too long in CI
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

			// NOTE: Full window expiration test is skipped because it would take
			// ${RATE_LIMIT_WINDOW_MS}ms (${RATE_LIMIT_WINDOW_MS / 1000}s) to complete
			// To test window reset: Configure shorter RATE_LIMIT_WINDOW_MS for tests
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
