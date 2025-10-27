/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                        Vaults Table Tests                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Integration-style tests targeting the 'vaults' table behaviors used by the
 * new Vault API endpoints and utilities. These tests exercise the intended
 * SQL operations directly against the test database.
 */

import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
} from 'bun:test'
import dotenv from 'dotenv'
import pg from 'pg'

const { Pool } = pg

// Test constants
const TEST_VAULT_1 = 1001
const TEST_VAULT_2 = 1002
const TEST_ADDR_1 = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa'
const TEST_ADDR_2 = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb'

let pool: pg.Pool

beforeAll(async () => {
	dotenv.config()

	// Derive TEST_DATABASE_URL from DATABASE_URL if not set
	let testDbUrl = process.env.TEST_DATABASE_URL
	if (!testDbUrl && process.env.DATABASE_URL) {
		testDbUrl = process.env.DATABASE_URL.replace(
			/\/([^/]+)(\?|$)/,
			'/$1_test$2'
		)
	}
	if (!testDbUrl) {
		throw new Error(
			'TEST_DATABASE_URL or DATABASE_URL must be set for DB tests'
		)
	}

	pool = new Pool({
		connectionString: testDbUrl,
		ssl:
			process.env.DATABASE_SSL === 'true'
				? { rejectUnauthorized: false }
				: false,
	})

	// Ensure tables exist (the project provides a setup script; here we assume it's been run)
	// Clean slate for the specific test vaults used below
	await pool.query('DELETE FROM vaults WHERE vault IN ($1, $2)', [
		String(TEST_VAULT_1),
		String(TEST_VAULT_2),
	])
})

afterAll(async () => {
	await pool.query('DELETE FROM vaults WHERE vault IN ($1, $2)', [
		String(TEST_VAULT_1),
		String(TEST_VAULT_2),
	])
	await pool.end()
})

beforeEach(async () => {
	// Ensure each test starts from a clean state
	await pool.query('DELETE FROM vaults WHERE vault IN ($1, $2)', [
		String(TEST_VAULT_1),
		String(TEST_VAULT_2),
	])
})

describe('Vaults table behaviors', () => {
	test('add controller to new vault (UPSERT + dedupe)', async () => {
		const res = await pool.query(
			`INSERT INTO vaults (vault, controllers)
 			 VALUES ($1, ARRAY[LOWER($2)])
 			 ON CONFLICT (vault)
 			 DO UPDATE SET controllers = (
 			   SELECT ARRAY(SELECT DISTINCT c FROM UNNEST(vaults.controllers || EXCLUDED.controllers) AS c)
 			 )
 			 RETURNING controllers`,
			[String(TEST_VAULT_1), TEST_ADDR_1]
		)

		expect(res.rows[0].controllers).toEqual([TEST_ADDR_1.toLowerCase()])

		// Idempotent add (same controller)
		const res2 = await pool.query(
			`INSERT INTO vaults (vault, controllers)
 			 VALUES ($1, ARRAY[LOWER($2)])
 			 ON CONFLICT (vault)
 			 DO UPDATE SET controllers = (
 			   SELECT ARRAY(SELECT DISTINCT c FROM UNNEST(vaults.controllers || EXCLUDED.controllers) AS c)
 			 )
 			 RETURNING controllers`,
			[String(TEST_VAULT_1), TEST_ADDR_1]
		)

		expect(res2.rows[0].controllers).toEqual([TEST_ADDR_1.toLowerCase()])
	})

	test('remove controller from existing vault', async () => {
		await pool.query(
			`INSERT INTO vaults (vault, controllers) VALUES ($1, ARRAY[LOWER($2)])
 			 ON CONFLICT (vault) DO NOTHING`,
			[String(TEST_VAULT_1), TEST_ADDR_1]
		)

		const res = await pool.query(
			`UPDATE vaults SET controllers = array_remove(controllers, LOWER($2))
 			 WHERE vault = $1 RETURNING controllers`,
			[String(TEST_VAULT_1), TEST_ADDR_1]
		)

		expect(res.rows[0].controllers).toEqual([])

		// Removing again (no-op, still empty array)
		const res2 = await pool.query(
			`UPDATE vaults SET controllers = array_remove(controllers, LOWER($2))
 			 WHERE vault = $1 RETURNING controllers`,
			[String(TEST_VAULT_1), TEST_ADDR_1]
		)
		expect(res2.rows[0].controllers).toEqual([])
	})

	test('get vault IDs by controller (ANY on controllers array)', async () => {
		// Seed two vaults controlled by TEST_ADDR_1 (split into two separate statements)
		await pool.query(
			`INSERT INTO vaults (vault, controllers) VALUES ($1, ARRAY[LOWER($2)])
			 ON CONFLICT (vault) DO UPDATE SET controllers = EXCLUDED.controllers`,
			[String(TEST_VAULT_1), TEST_ADDR_1]
		)
		await pool.query(
			`INSERT INTO vaults (vault, controllers) VALUES ($1, ARRAY[LOWER($2)])
			 ON CONFLICT (vault) DO UPDATE SET controllers = EXCLUDED.controllers`,
			[String(TEST_VAULT_2), TEST_ADDR_1]
		)

		const res = await pool.query(
			'SELECT vault FROM vaults WHERE $1 = ANY(controllers) ORDER BY vault',
			[TEST_ADDR_1.toLowerCase()]
		)

		expect(res.rows.map((r) => r.vault)).toEqual([
			String(TEST_VAULT_1),
			String(TEST_VAULT_2),
		])
	})

	test('set and get rules for a vault (UPSERT rules)', async () => {
		// Set rules (insert new row)
		const setRes = await pool.query(
			`INSERT INTO vaults (vault, controllers, rules)
 			 VALUES ($1, ARRAY[]::TEXT[], $2)
 			 ON CONFLICT (vault)
 			 DO UPDATE SET rules = EXCLUDED.rules
 			 RETURNING rules`,
			[String(TEST_VAULT_1), 'ALLOW_ALL']
		)
		expect(setRes.rows[0].rules).toBe('ALLOW_ALL')

		// Get rules
		const getRes = await pool.query(
			'SELECT rules FROM vaults WHERE vault = $1',
			[String(TEST_VAULT_1)]
		)
		expect(getRes.rows[0].rules).toBe('ALLOW_ALL')

		// Clear rules (set to NULL)
		const clearRes = await pool.query(
			`INSERT INTO vaults (vault, controllers, rules)
 			 VALUES ($1, ARRAY[]::TEXT[], $2)
 			 ON CONFLICT (vault)
 			 DO UPDATE SET rules = EXCLUDED.rules
 			 RETURNING rules`,
			[String(TEST_VAULT_1), null]
		)
		expect(clearRes.rows[0].rules).toBeNull()
	})

	test('controllers are stored lowercased', async () => {
		await pool.query(
			`INSERT INTO vaults (vault, controllers)
 			 VALUES ($1, ARRAY[LOWER($2), LOWER($3)])
 			 ON CONFLICT (vault) DO UPDATE SET controllers = EXCLUDED.controllers`,
			[String(TEST_VAULT_1), TEST_ADDR_1, TEST_ADDR_2]
		)
		const res = await pool.query(
			'SELECT controllers FROM vaults WHERE vault = $1',
			[String(TEST_VAULT_1)]
		)
		expect(res.rows[0].controllers).toEqual([
			TEST_ADDR_1.toLowerCase(),
			TEST_ADDR_2.toLowerCase(),
		])
	})
})
