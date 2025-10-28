/**
 * Integration tests for vault utilities against a real database.
 * Requires TEST_DATABASE_URL (or NODE_ENV=test with db.ts picking test DB).
 */

import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
} from 'bun:test'
import { pool } from '../../src/db.js'
import {
	createVaultRow,
	addControllerToVault,
	removeControllerFromVault,
	setRulesForVault,
	getRulesForVault,
	getControllersForVault,
	getVaultsForController,
} from '../../src/utils/vaults.js'

const TEST_VAULT_1 = 5001
const TEST_VAULT_2 = 5002
const CTRL_1 = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa'
const CTRL_2 = '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb'

beforeAll(async () => {
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
})

beforeEach(async () => {
	await pool.query('DELETE FROM vaults WHERE vault IN ($1, $2)', [
		String(TEST_VAULT_1),
		String(TEST_VAULT_2),
	])
})

describe('Vault utils (DB)', () => {
	test('createVaultRow: insert-only with pre-check; duplicate rejected', async () => {
		const row = await createVaultRow(TEST_VAULT_1, CTRL_1, null)
		expect(row.vault).toBe(String(TEST_VAULT_1))
		expect(row.controllers).toEqual([CTRL_1.toLowerCase()])

		let dup = false
		try {
			await createVaultRow(TEST_VAULT_1, CTRL_1, null)
		} catch (e) {
			dup = e instanceof Error && e.message === 'Vault already exists'
		}
		expect(dup).toBe(true)
	})

	test('addControllerToVault: update-only and dedupe', async () => {
		await createVaultRow(TEST_VAULT_1, CTRL_1, null)
		const controllers1 = await addControllerToVault(TEST_VAULT_1, CTRL_1)
		expect(controllers1).toEqual([CTRL_1.toLowerCase()])
		const controllers2 = await addControllerToVault(TEST_VAULT_1, CTRL_2)
		expect(new Set(controllers2)).toEqual(
			new Set([CTRL_1.toLowerCase(), CTRL_2.toLowerCase()])
		)
	})

	test('removeControllerFromVault: update-only', async () => {
		await createVaultRow(TEST_VAULT_1, CTRL_1, null)
		const removed = await removeControllerFromVault(TEST_VAULT_1, CTRL_1)
		expect(removed).toEqual([])
	})

	test('setRulesForVault and getRulesForVault: update-only', async () => {
		await createVaultRow(TEST_VAULT_1, CTRL_1, null)
		const persisted = await setRulesForVault(TEST_VAULT_1, 'ALLOW_ALL')
		expect(persisted).toBe('ALLOW_ALL')
		const read = await getRulesForVault(TEST_VAULT_1)
		expect(read).toBe('ALLOW_ALL')
		const cleared = await setRulesForVault(TEST_VAULT_1, null)
		expect(cleared).toBeNull()
	})

	test('getControllersForVault and getVaultsForController', async () => {
		await createVaultRow(TEST_VAULT_1, CTRL_1, null)
		await createVaultRow(TEST_VAULT_2, CTRL_1, null)
		const ctrls = await getControllersForVault(TEST_VAULT_1)
		expect(ctrls).toEqual([CTRL_1.toLowerCase()])
		const vaults = await getVaultsForController(CTRL_1)
		expect(new Set(vaults)).toEqual(
			new Set([String(TEST_VAULT_1), String(TEST_VAULT_2)])
		)
	})
})
