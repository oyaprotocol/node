/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Health Endpoint Integration Tests                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
	startTestServer,
	stopTestServer,
	pool,
	get,
} from '../helpers/testServer.js'
import type { Server } from 'http'

describe('Health Endpoint', () => {
	let server: Server
	let baseURL: string

	beforeAll(async () => {
		const testServer = await startTestServer()
		server = testServer.server
		baseURL = testServer.baseURL
	})

	afterAll(async () => {
		await stopTestServer(server)
		await pool.end()
	})

	it('should return 200 OK on /health', async () => {
		const response = await get(baseURL, '/health')
		expect(response.status).toBe(200)
	})

	it('should return healthy status in response body', async () => {
		const response = await get(baseURL, '/health')
		const data = await response.json()
		expect(data.status).toBe('healthy')
	})
})
