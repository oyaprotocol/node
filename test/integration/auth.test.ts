/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Authentication Integration Tests                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Comprehensive tests for Bearer token authentication middleware.
 * Tests protection of POST endpoints and proper error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
	startTestServer,
	stopTestServer,
	request,
} from '../helpers/testServer.js'
import {
	POST_ENDPOINTS,
	GET_ENDPOINTS,
	SAMPLE_INTENTION,
} from '../helpers/fixtures.js'
import type { Server } from 'http'

describe('Authentication Middleware', () => {
	let server: Server
	let baseURL: string
	const validToken = process.env.API_BEARER_TOKEN || 'test-token'

	beforeAll(async () => {
		const testServer = await startTestServer()
		server = testServer.server
		baseURL = testServer.baseURL
	})

	afterAll(async () => {
		await stopTestServer(server)
	})

	describe('Bearer Token Validation', () => {
		it('should allow POST request with valid Bearer token', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(SAMPLE_INTENTION),
			})

			// Should not return 401 or 403 (may return other errors due to validation, that's ok)
			expect(response.status).not.toBe(401)
			expect(response.status).not.toBe(403)
		})

		it('should reject POST request with missing Authorization header', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(401)
			const data = await response.json()
			expect(data.error).toBe('Missing Authorization header')
		})

		it('should reject POST request with invalid Bearer token', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: 'Bearer invalid-token-12345',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with wrong authentication scheme', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with malformed Authorization header (no space)', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with only "Bearer" and no token', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: 'Bearer',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with empty Authorization header', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: '',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(401)
			const data = await response.json()
			expect(data.error).toBe('Missing Authorization header')
		})

		it('should reject POST request with token that has extra whitespace', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer  ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			// Should fail because token includes leading space
			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with case-sensitive scheme mismatch', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `bearer ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with partial token match', async () => {
			const partialToken = validToken.substring(0, validToken.length - 5)
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${partialToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should reject POST request with token plus extra characters', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${validToken}extra`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})
	})

	describe('POST Endpoint Protection', () => {
		it('should protect all POST endpoints', async () => {
			for (const endpoint of POST_ENDPOINTS) {
				const response = await fetch(`${baseURL}${endpoint}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({}),
				})

				expect(response.status).toBe(401)
			}
		})
	})

	describe('GET Endpoint Access (No Auth Required)', () => {
		it('should allow all GET requests without authentication', async () => {
			for (const endpoint of GET_ENDPOINTS) {
				const response = await fetch(`${baseURL}${endpoint}`, {
					method: 'GET',
				})

				// Should never return auth errors (401/403)
				expect(response.status).not.toBe(401)
				expect(response.status).not.toBe(403)
			}
		})

		it('should allow GET /health/detailed without authentication (may fail DB check)', async () => {
			const response = await request(baseURL, '/health/detailed', {
				method: 'GET',
			})

			// Should not return 401/403 (may return 503 if DB health check fails)
			expect(response.status).not.toBe(401)
			expect(response.status).not.toBe(403)
		})
	})

	describe('Edge Cases', () => {
		it('should reject very long invalid tokens (DoS protection)', async () => {
			// Tests that token comparison doesn't have pathological performance with long strings
			const longInvalidToken = 'x'.repeat(10000)
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${longInvalidToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(403)
			const data = await response.json()
			expect(data.error).toBe('Invalid or missing token')
		})

		it('should handle multiple spaces in Authorization header', async () => {
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer    ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			// Should fail because split(' ') produces empty string as token
			expect(response.status).toBe(403)
		})
	})

	describe('Stateless Authentication', () => {
		it('should authenticate each request independently', async () => {
			// Verify that valid auth token works on multiple requests
			const response1 = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ ...SAMPLE_INTENTION, intention: 'test 1' }),
			})

			expect(response1.status).not.toBe(401)
			expect(response1.status).not.toBe(403)

			// Second request should also succeed with same token
			const response2 = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ ...SAMPLE_INTENTION, intention: 'test 2' }),
			})

			expect(response2.status).not.toBe(401)
			expect(response2.status).not.toBe(403)
		})

		it('should not persist authentication without header (no session)', async () => {
			// First request with auth
			await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${validToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(SAMPLE_INTENTION),
			})

			// Second request without auth header - should fail
			const response = await fetch(`${baseURL}/intention`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})

			expect(response.status).toBe(401)
		})
	})
})
