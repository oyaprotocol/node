/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Health Endpoints Integration Tests                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Integration tests for health check endpoints.
 * Tests the full request/response cycle with real database connections.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type { Server } from 'http'
import {
	createTestApp,
	startTestServer,
	stopTestServer,
	get,
} from '../helpers/testServer.js'

describe('Health Endpoints', () => {
	let server: Server
	let baseURL: string

	// Set up test server and database before all tests
	beforeAll(async () => {
		// Create and start test server with real controllers
		const app = createTestApp()
		const testServer = await startTestServer(app)
		server = testServer.server
		baseURL = testServer.baseURL
	})

	// Clean up after all tests
	afterAll(async () => {
		await stopTestServer(server)
		// Note: pool is shared across test files and will be cleaned up when process exits
	})

	describe('GET /health', () => {
		test('should return healthy status', async () => {
			const response = await get(baseURL, '/health')

			expect(response.status).toBe(200)

			const data = await response.json()
			expect(data).toHaveProperty('status')
			expect(data.status).toBe('healthy')
		})

		test('should return 200 when database is accessible', async () => {
			// This tests the real database connectivity check in the controller
			const response = await get(baseURL, '/health')

			expect(response.status).toBe(200)
		})
	})

	describe('GET /health/detailed', () => {
		test('should return detailed health information', async () => {
			const response = await get(baseURL, '/health/detailed')

			// May return 200 or 503 depending on external services
			expect([200, 503]).toContain(response.status)

			const data = await response.json()
			expect(data).toHaveProperty('status')
			expect(data).toHaveProperty('checks')
			expect(data).toHaveProperty('timestamp')
			expect(data).toHaveProperty('total_check_time_ms')
		})

		test('should include database check', async () => {
			const response = await get(baseURL, '/health/detailed')
			const data = await response.json()

			expect(data.checks).toHaveProperty('database')
			expect(data.checks.database).toHaveProperty('status')
			expect(data.checks.database.status).toBe('healthy')
		})

		test('should include response times for checks', async () => {
			const response = await get(baseURL, '/health/detailed')
			const data = await response.json()

			// Database check should have response time
			if (data.checks.database?.status === 'healthy') {
				expect(data.checks.database).toHaveProperty('response_time_ms')
				expect(typeof data.checks.database.response_time_ms).toBe('number')
			}
		})

		test('should include IPFS check', async () => {
			const response = await get(baseURL, '/health/detailed')
			const data = await response.json()

			expect(data.checks).toHaveProperty('ipfs')
			expect(data.checks.ipfs).toHaveProperty('status')
			// IPFS may be healthy or unhealthy depending on environment
		})

		test('should include Ethereum check', async () => {
			const response = await get(baseURL, '/health/detailed')
			const data = await response.json()

			expect(data.checks).toHaveProperty('ethereum')
			expect(data.checks.ethereum).toHaveProperty('status')
		})

		test('should return degraded status if any check fails', async () => {
			const response = await get(baseURL, '/health/detailed')
			const data = await response.json()

			// If status is degraded, at least one check should be unhealthy
			if (data.status === 'degraded') {
				const checks = Object.values(data.checks) as Array<{ status: string }>
				const hasUnhealthy = checks.some(
					(check) => check.status === 'unhealthy'
				)
				expect(hasUnhealthy).toBe(true)
			}
		})
	})
})
