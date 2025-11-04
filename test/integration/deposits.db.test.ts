/**
 * Integration tests for deposits utils against a real database.
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
	insertDepositIfMissing,
	getDepositRemaining,
	findDepositWithSufficientRemaining,
	findNextDepositWithAnyRemaining,
	getTotalAvailableDeposits,
	createAssignmentEventTransactional,
} from '../../src/utils/deposits.js'
import {
	TEST_TX,
	TEST_UID,
	CTRL,
	TOKEN,
	ZERO,
} from '../helpers/testFixtures.js'

beforeAll(async () => {
	await pool.query('DELETE FROM deposits WHERE tx_hash = $1', [TEST_TX])
})

afterAll(async () => {
	await pool.query('DELETE FROM deposits WHERE tx_hash = $1', [TEST_TX])
})

beforeEach(async () => {
	await pool.query('DELETE FROM deposits WHERE tx_hash = $1', [TEST_TX])
})

describe('Deposits utils (DB)', () => {
	test('insertDepositIfMissing: idempotent by transfer_uid', async () => {
		const p = {
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(1),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '1000',
		}
		const r1 = await insertDepositIfMissing(p)
		const r2 = await insertDepositIfMissing(p)
		expect(r1.id).toBeDefined()
		expect(r2.id).toBe(r1.id)

		const row = await pool.query('SELECT * FROM deposits WHERE id = $1', [
			r1.id,
		])
		expect(row.rows[0].tx_hash).toBe(TEST_TX)
		expect(row.rows[0].depositor).toBe(CTRL.toLowerCase())
		expect(row.rows[0].token).toBe(TOKEN.toLowerCase())
		expect(row.rows[0].amount).toBe('1000')
		expect(row.rows[0].assigned_at).toBeNull()
	})

	test('sufficient-remaining selection and full assignment event', async () => {
		// two deposits, distinct amounts
		await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(2),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '123',
		})
		const ins = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(3),
			chain_id: 11155111,
			depositor: CTRL,
			token: ZERO, // ETH
			amount: '555',
		})

		const found1 = await findDepositWithSufficientRemaining({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
			minAmount: '123',
		})
		expect(found1?.id).toBeDefined()

		const found2 = await findDepositWithSufficientRemaining({
			depositor: CTRL,
			token: ZERO,
			chain_id: 11155111,
			minAmount: '555',
		})
		expect(found2?.id).toBe(ins.id)

		// full assignment via event
		await createAssignmentEventTransactional(found2!.id, '555', '9999')
		const remaining = await getDepositRemaining(found2!.id)
		expect(remaining).toBe('0')
		const reread = await pool.query(
			'SELECT assigned_at FROM deposits WHERE id = $1',
			[found2!.id]
		)
		expect(reread.rows[0].assigned_at).not.toBeNull()

		// no longer available for selection for any positive amount
		const notFound = await findDepositWithSufficientRemaining({
			depositor: CTRL,
			token: ZERO,
			chain_id: 11155111,
			minAmount: '1',
		})
		expect(notFound).toBeNull()
	})
})

describe('Partial assignment events (DB)', () => {
	test('remaining decreases with partial assignments and assigned_at set when fully assigned', async () => {
		const ins = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(100),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '1000',
		})

		const before = await getDepositRemaining(ins.id)
		expect(before).toBe('1000')

		// Assign 400
		await createAssignmentEventTransactional(ins.id, '400', '8001')
		const after400 = await getDepositRemaining(ins.id)
		expect(after400).toBe('600')

		// Not fully assigned yet
		const row1 = await pool.query(
			'SELECT assigned_at FROM deposits WHERE id = $1',
			[ins.id]
		)
		expect(row1.rows[0].assigned_at).toBeNull()

		// Assign remaining 600
		await createAssignmentEventTransactional(ins.id, '600', '8002')
		const afterFull = await getDepositRemaining(ins.id)
		expect(afterFull).toBe('0')

		const row2 = await pool.query(
			'SELECT assigned_at FROM deposits WHERE id = $1',
			[ins.id]
		)
		expect(row2.rows[0].assigned_at).not.toBeNull()
	})

	test('selection uses sufficient remaining and fails on over-assignment', async () => {
		const ins = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(101),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '700',
		})

		// Oldest deposit with remaining >= 500 should be this one initially
		const pick1 = await findDepositWithSufficientRemaining({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
			minAmount: '500',
		})
		expect(pick1?.id).toBe(ins.id)

		// Assign 650 (leave 50)
		await createAssignmentEventTransactional(ins.id, '650', '9001')
		const remaining = await getDepositRemaining(ins.id)
		expect(remaining).toBe('50')

		// Cannot assign 100 now
		await expect(
			createAssignmentEventTransactional(ins.id, '100', '9002')
		).rejects.toThrow()

		// But can assign 50
		await createAssignmentEventTransactional(ins.id, '50', '9003')
		const remaining2 = await getDepositRemaining(ins.id)
		expect(remaining2).toBe('0')
	})
})

describe('Multi-deposit combination helpers (DB)', () => {
	test('findNextDepositWithAnyRemaining: finds oldest deposit with any remaining', async () => {
		// Create multiple deposits for the same token
		const deposit1 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(200),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '1000',
		})

		const deposit2 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(201),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '500',
		})

		// Should find the oldest (first) deposit
		const found = await findNextDepositWithAnyRemaining({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(found?.id).toBe(deposit1.id)
		expect(found?.remaining).toBe('1000')

		// Partially assign deposit1
		await createAssignmentEventTransactional(deposit1.id, '300', '10001')
		const remaining1 = await getDepositRemaining(deposit1.id)
		expect(remaining1).toBe('700')

		// Still finds deposit1 (oldest with remaining > 0)
		const found2 = await findNextDepositWithAnyRemaining({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(found2?.id).toBe(deposit1.id)
		expect(found2?.remaining).toBe('700')

		// Fully assign deposit1
		await createAssignmentEventTransactional(deposit1.id, '700', '10002')
		const remaining1Final = await getDepositRemaining(deposit1.id)
		expect(remaining1Final).toBe('0')

		// Now should find deposit2 (oldest remaining)
		const found3 = await findNextDepositWithAnyRemaining({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(found3?.id).toBe(deposit2.id)
		expect(found3?.remaining).toBe('500')
	})

	test('findNextDepositWithAnyRemaining: returns null when no deposits available', async () => {
		const found = await findNextDepositWithAnyRemaining({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(found).toBeNull()
	})

	test('getTotalAvailableDeposits: sums all remaining deposits', async () => {
		// Create multiple deposits
		const deposit1 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(300),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '1000',
		})

		const deposit2 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(301),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '500',
		})

		const deposit3 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(302),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '200',
		})

		// Total should be sum of all deposits
		const total1 = await getTotalAvailableDeposits({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(total1).toBe('1700') // 1000 + 500 + 200

		// Partially assign deposit1
		await createAssignmentEventTransactional(deposit1.id, '300', '20001')
		const total2 = await getTotalAvailableDeposits({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(total2).toBe('1400') // 700 + 500 + 200

		// Fully assign deposit1
		await createAssignmentEventTransactional(deposit1.id, '700', '20002')
		const total3 = await getTotalAvailableDeposits({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(total3).toBe('700') // 0 + 500 + 200

		// Assign all remaining
		await createAssignmentEventTransactional(deposit2.id, '500', '20003')
		await createAssignmentEventTransactional(deposit3.id, '200', '20004')
		const total4 = await getTotalAvailableDeposits({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(total4).toBe('0')
	})

	test('getTotalAvailableDeposits: returns 0 for non-existent deposits', async () => {
		const total = await getTotalAvailableDeposits({
			depositor: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(total).toBe('0')
	})

	test('getTotalAvailableDeposits: handles multiple deposits with partial assignments', async () => {
		// Create deposits with different amounts
		const deposit1 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(400),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '1000',
		})

		const deposit2 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(401),
			chain_id: 11155111,
			depositor: CTRL,
			token: TOKEN,
			amount: '800',
		})

		// Partially assign both
		await createAssignmentEventTransactional(deposit1.id, '600', '30001')
		await createAssignmentEventTransactional(deposit2.id, '200', '30002')

		const total = await getTotalAvailableDeposits({
			depositor: CTRL,
			token: TOKEN,
			chain_id: 11155111,
		})
		expect(total).toBe('1000') // 400 + 600
	})
})
