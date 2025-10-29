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
	createAssignmentEventTransactional,
} from '../../src/utils/deposits.js'

const TEST_TX = '0xtest-deposit-tx'
const TEST_UID = (n: number) => `${TEST_TX}:${n}`
const CTRL = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc'
const TOKEN = '0x1111111111111111111111111111111111111111'
const ZERO = '0x0000000000000000000000000000000000000000'

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
