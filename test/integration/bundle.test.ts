/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Bundle Endpoints Integration Tests                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Integration tests for bundle management endpoints.
 * Tests CRUD operations with real database interactions.
 */

import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
} from 'bun:test'
import type { Server } from 'http'
import {
	createTestApp,
	pool,
	startTestServer,
	stopTestServer,
	clearTestDatabase,
	get,
	post,
} from '../helpers/testServer.js'

describe('Bundle Endpoints', () => {
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

	// Clear database between tests
	beforeEach(async () => {
		await clearTestDatabase(pool)
	})

	describe('POST /bundle', () => {
		test('should save a valid bundle', async () => {
			const bundle = {
				intentions: [
					{
						vault: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
						intent: 'Transfer 100 USDC to Alice',
					},
				],
			}
			const nonce = 123

			const response = await post(baseURL, '/bundle', { bundle, nonce })

			expect(response.status).toBe(201)

			const data = await response.json()
			expect(data).toHaveProperty('bundle')
			expect(data).toHaveProperty('nonce')
			expect(data.nonce).toBe(nonce)
		})

		test('should reject bundle with invalid nonce', async () => {
			const bundle = {
				intentions: [
					{
						vault: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
						intent: 'Test intent',
					},
				],
			}
			const nonce = 'invalid' // Invalid nonce type

			const response = await post(baseURL, '/bundle', { bundle, nonce })

			expect(response.status).toBe(400)

			const data = await response.json()
			expect(data).toHaveProperty('error')
		})

		test('should reject bundle with missing data', async () => {
			const response = await post(baseURL, '/bundle', {})

			expect(response.status).toBe(400)

			const data = await response.json()
			expect(data).toHaveProperty('error')
		})

		test('should require authentication', async () => {
			// Make request without auth token
			const response = await fetch(`${baseURL}/bundle`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bundle: { intentions: [] },
					nonce: 123,
				}),
			})

			expect(response.status).toBe(401)
		})
	})

	describe('GET /bundle/:nonce', () => {
		test('should retrieve bundle by nonce', async () => {
			// First, create a bundle
			const bundle = {
				intentions: [
					{
						vault: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
						intent: 'Test intent',
					},
				],
			}
			const nonce = 456

			await post(baseURL, '/bundle', { bundle, nonce })

			// Now retrieve it
			const response = await get(baseURL, `/bundle/${nonce}`)

			expect(response.status).toBe(200)

			const data = await response.json()
			expect(Array.isArray(data)).toBe(true)
			expect(data.length).toBeGreaterThan(0)
			expect(data[0]).toHaveProperty('nonce')
			expect(data[0].nonce).toBe(nonce)
		})

		test('should return 404 for non-existent nonce', async () => {
			const response = await get(baseURL, '/bundle/99999')

			expect(response.status).toBe(404)

			const data = await response.json()
			expect(data).toHaveProperty('error')
			expect(data.error).toBe('Bundle not found')
		})
	})

	describe('GET /bundle', () => {
		test('should return all bundles', async () => {
			// Create multiple bundles
			const bundles = [
				{ intentions: [{ vault: '0x1234', intent: 'Intent 1' }] },
				{ intentions: [{ vault: '0x5678', intent: 'Intent 2' }] },
			]

			for (let i = 0; i < bundles.length; i++) {
				await post(baseURL, '/bundle', { bundle: bundles[i], nonce: i + 1 })
			}

			// Retrieve all
			const response = await get(baseURL, '/bundle')

			expect(response.status).toBe(200)

			const data = await response.json()
			expect(Array.isArray(data)).toBe(true)
			expect(data.length).toBeGreaterThanOrEqual(2)
		})

		test('should return empty array when no bundles exist', async () => {
			const response = await get(baseURL, '/bundle')

			expect(response.status).toBe(200)

			const data = await response.json()
			expect(Array.isArray(data)).toBe(true)
			expect(data.length).toBe(0)
		})

		test('should return bundles ordered by timestamp DESC', async () => {
			// Create bundles with different nonces
			await post(baseURL, '/bundle', {
				bundle: { intentions: [] },
				nonce: 1,
			})
			await post(baseURL, '/bundle', {
				bundle: { intentions: [] },
				nonce: 2,
			})

			const response = await get(baseURL, '/bundle')
			const data = await response.json()

			// Most recent should be first
			expect(data[0].nonce).toBe(2)
			expect(data[1].nonce).toBe(1)
		})
	})
})
