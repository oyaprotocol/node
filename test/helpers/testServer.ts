/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Test Server Utilities                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Utilities for setting up Express server in test environment.
 * Provides HTTP client helpers and database management for tests.
 */

import type { Server } from 'http'
import type { Pool } from 'pg'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db.js'

/**
 * Re-export the environment-aware pool from db.ts.
 * This pool automatically uses the test database when NODE_ENV=test.
 */
export { pool }

/**
 * Starts a test server on a random available port.
 *
 * @param app - Express application
 * @returns Promise resolving to server instance and base URL
 */
export async function startTestServer(): Promise<{
	server: Server
	baseURL: string
}> {
	const app = createApp()

	return new Promise((resolve, reject) => {
		// Use port 0 to let the OS assign a random available port
		const server = app.listen(0, () => {
			const address = server.address()
			if (!address || typeof address === 'string') {
				reject(new Error('Failed to get server address'))
				return
			}

			const baseURL = `http://localhost:${address.port}`
			resolve({ server, baseURL })
		})

		server.on('error', reject)
	})
}

/**
 * Stops a running test server.
 *
 * @param server - Server instance to stop
 */
export async function stopTestServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((err) => {
			if (err) reject(err)
			else resolve()
		})
	})
}

/**
 * Clears all data from test database tables.
 * Useful for cleanup between tests.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function clearTestDatabase(pool: Pool): Promise<void> {
	const client = await pool.connect()
	try {
		// Clear application tables
        await client.query(
            'TRUNCATE TABLE bundles, cids, balances, proposers, vaults CASCADE'
        )
	} finally {
		client.release()
	}
}

/**
 * HTTP request helper for making authenticated requests to test server.
 *
 * @param baseURL - Base URL of test server
 * @param path - Request path (e.g., '/submit')
 * @param options - Fetch options
 * @returns Fetch response
 */
export async function request(
	baseURL: string,
	path: string,
	options: RequestInit = {}
): Promise<Response> {
	const url = `${baseURL}${path}`

	// Add bearer token from environment if not already provided
	if (!options.headers) {
		options.headers = {}
	}

	const headers = options.headers as Record<string, string>

	// Add bearer token for POST requests if not already set
	if (options.method === 'POST' && !headers['Authorization']) {
		const token = process.env.API_BEARER_TOKEN
		if (token) {
			headers['Authorization'] = `Bearer ${token}`
		}
	}

	// Set content-type for JSON if not already set
	if (options.body && !headers['Content-Type']) {
		headers['Content-Type'] = 'application/json'
	}

	return fetch(url, options)
}

/**
 * Helper to make GET requests.
 */
export async function get(baseURL: string, path: string): Promise<Response> {
	return request(baseURL, path, { method: 'GET' })
}

/**
 * Helper to make POST requests with JSON body.
 */
export async function post(
	baseURL: string,
	path: string,
	body?: unknown
): Promise<Response> {
	return request(baseURL, path, {
		method: 'POST',
		body: body ? JSON.stringify(body) : undefined,
	})
}
