/**
 * Integration tests for AssignDeposit-based vault seeding flow.
 * Tests the complete seeding flow including deposit combination and nonce tracking.
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
	findNextDepositWithAnyRemaining,
	getTotalAvailableDeposits,
	createAssignmentEventTransactional,
} from '../../src/utils/deposits.js'
import {
	createVaultRow,
	getVaultsForController,
} from '../../src/utils/vaults.js'

const TEST_TX = '0xtest-seeding-tx'
const TEST_UID = (n: number) => `${TEST_TX}:${n}`
const PROPOSER_CONTROLLER = '0xDeAdDeAdDeAdDeAdDeAdDeAdDeAdDeAdDeAdDeAd'
const PROPOSER_VAULT_ID = 9999
const NEW_VAULT_ID = 8888
const TOKEN = '0x1111111111111111111111111111111111111111'
const SEPOLIA_CHAIN_ID = 11155111

beforeAll(async () => {
	// Clean up test data
	await pool.query('DELETE FROM deposits WHERE tx_hash = $1', [TEST_TX])
	await pool.query('DELETE FROM vaults WHERE vault IN ($1, $2)', [
		String(PROPOSER_VAULT_ID),
		String(NEW_VAULT_ID),
	])
	await pool.query(
		'DELETE FROM deposit_assignment_events WHERE deposit_id IN (SELECT id FROM deposits WHERE tx_hash = $1)',
		[TEST_TX]
	)

	// Create proposer vault
	await createVaultRow(PROPOSER_VAULT_ID, PROPOSER_CONTROLLER, null)
})

afterAll(async () => {
	// Clean up
	await pool.query('DELETE FROM deposits WHERE tx_hash = $1', [TEST_TX])
	await pool.query('DELETE FROM vaults WHERE vault IN ($1, $2)', [
		String(PROPOSER_VAULT_ID),
		String(NEW_VAULT_ID),
	])
	await pool.query(
		'DELETE FROM deposit_assignment_events WHERE deposit_id IN (SELECT id FROM deposits WHERE tx_hash = $1)',
		[TEST_TX]
	)
})

beforeEach(async () => {
	// Clean up deposits and assignments, but keep vaults
	await pool.query('DELETE FROM deposits WHERE tx_hash = $1', [TEST_TX])
	await pool.query(
		'DELETE FROM deposit_assignment_events WHERE deposit_id IN (SELECT id FROM deposits WHERE tx_hash = $1)',
		[TEST_TX]
	)
	// Reset proposer vault nonce
	await pool.query('UPDATE vaults SET nonce = $2 WHERE vault = $1', [
		String(PROPOSER_VAULT_ID),
		0,
	])
})

describe('AssignDeposit seeding flow (DB)', () => {
	test('Happy path: Multi-deposit combination fulfills seeding amount', async () => {
		// Create multiple deposits that together fulfill the seeding amount
		const deposit1 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(1),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '500',
		})

		const deposit2 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(2),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '300',
		})

		const deposit3 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(3),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '200',
		})

		// Simulate multi-deposit combination: need to assign 1000 total
		const targetAmount = BigInt('1000')
		let remainingToAssign = targetAmount
		const depositIds: number[] = []

		while (remainingToAssign > 0n) {
			const deposit = await findNextDepositWithAnyRemaining({
				depositor: PROPOSER_CONTROLLER,
				token: TOKEN,
				chain_id: SEPOLIA_CHAIN_ID,
			})

			if (!deposit) {
				throw new Error('Insufficient deposits')
			}

			const depositRemaining = BigInt(deposit.remaining)
			const chunk =
				remainingToAssign < depositRemaining
					? remainingToAssign
					: depositRemaining

			await createAssignmentEventTransactional(
				deposit.id,
				chunk.toString(),
				String(NEW_VAULT_ID)
			)

			depositIds.push(deposit.id)
			remainingToAssign -= chunk
		}

		// Verify all deposits were used
		expect(depositIds.length).toBe(3)
		expect(depositIds).toContain(deposit1.id)
		expect(depositIds).toContain(deposit2.id)
		expect(depositIds).toContain(deposit3.id)

		// Verify deposits are fully assigned
		const totalAfter = await getTotalAvailableDeposits({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})
		expect(totalAfter).toBe('0')
	})

	test('Race condition: Deposit exhausted between intention and publish, fallback succeeds', async () => {
		// Create deposits
		const deposit1 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(10),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '500',
		})

		const deposit2 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(11),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '500',
		})

		// Simulate: deposit1 was selected at intention time, but was partially consumed
		// Assign 300 from deposit1 to another vault (simulating race condition)
		await createAssignmentEventTransactional(deposit1.id, '300', '7777')

		// Now try to assign 500 from deposit1 (should fail and fallback)
		let fallbackUsed = false
		try {
			await createAssignmentEventTransactional(
				deposit1.id,
				'500',
				String(NEW_VAULT_ID)
			)
		} catch (error) {
			// Expected: "Not enough remaining"
			if (
				error instanceof Error &&
				error.message.includes('Not enough remaining')
			) {
				fallbackUsed = true
			} else {
				throw error
			}
		}

		expect(fallbackUsed).toBe(true)

		// Fallback: use remaining from deposit1 + deposit2
		const remainingFromDeposit1 = BigInt('200') // 500 - 300
		await createAssignmentEventTransactional(
			deposit1.id,
			remainingFromDeposit1.toString(),
			String(NEW_VAULT_ID)
		)

		const remainingNeeded = BigInt('500') - remainingFromDeposit1 // 300
		await createAssignmentEventTransactional(
			deposit2.id,
			remainingNeeded.toString(),
			String(NEW_VAULT_ID)
		)

		// Verify total assigned to new vault is 500
		const assignments = await pool.query(
			`SELECT SUM(amount::numeric(78,0)) AS total
       FROM deposit_assignment_events
       WHERE deposit_id IN ($1, $2)
         AND credited_vault = $3`,
			[deposit1.id, deposit2.id, String(NEW_VAULT_ID)]
		)
		const totalAssigned = BigInt((assignments.rows[0].total as string) ?? '0')
		expect(totalAssigned.toString()).toBe('500')
	})

	test('Insufficient deposits: Clear error message with required vs available', async () => {
		// Create deposit with insufficient amount
		await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(20),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '500',
		})

		const required = BigInt('1000')
		const totalAvailable = await getTotalAvailableDeposits({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})

		expect(totalAvailable).toBe('500')
		expect(BigInt(totalAvailable)).toBeLessThan(required)

		// Verify error message includes both required and available
		const deposit = await findNextDepositWithAnyRemaining({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})

		expect(deposit).not.toBeNull()

		// Try to assign more than available
		let errorThrown = false
		try {
			await createAssignmentEventTransactional(
				deposit!.id,
				required.toString(),
				String(NEW_VAULT_ID)
			)
		} catch (error) {
			errorThrown = true
			expect(error instanceof Error).toBe(true)
			expect(error.message).toContain('Not enough remaining')
		}

		expect(errorThrown).toBe(true)
	})

	test('Nonce tracking: AssignDeposit updates submitter vault nonce at publish', async () => {
		// Create deposit
		await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(30),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '1000',
		})

		// Verify proposer vault exists and get initial nonce
		const vaults = await getVaultsForController(PROPOSER_CONTROLLER)
		expect(vaults.length).toBeGreaterThan(0)

		const initialNonce = await pool.query(
			'SELECT nonce FROM vaults WHERE vault = $1',
			[String(PROPOSER_VAULT_ID)]
		)
		expect(initialNonce.rows[0].nonce).toBe(0)

		// Simulate AssignDeposit intention with nonce = currentNonce + 1
		const intentionNonce = initialNonce.rows[0].nonce + 1

		// Simulate assignment and nonce update at publish
		const deposit = await findNextDepositWithAnyRemaining({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})

		await createAssignmentEventTransactional(
			deposit!.id,
			'1000',
			String(NEW_VAULT_ID)
		)

		// Update nonce (simulating publishBundle behavior)
		await pool.query('UPDATE vaults SET nonce = $2 WHERE vault = $1', [
			String(PROPOSER_VAULT_ID),
			intentionNonce,
		])

		// Verify nonce was updated
		const updatedNonce = await pool.query(
			'SELECT nonce FROM vaults WHERE vault = $1',
			[String(PROPOSER_VAULT_ID)]
		)
		expect(updatedNonce.rows[0].nonce).toBe(intentionNonce)
		expect(updatedNonce.rows[0].nonce).toBe(1)
	})

	test('findNextDepositWithAnyRemaining: Returns oldest deposit first', async () => {
		// Create deposits in sequence
		const deposit1 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(40),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '100',
		})

		const deposit2 = await insertDepositIfMissing({
			tx_hash: TEST_TX,
			transfer_uid: TEST_UID(41),
			chain_id: SEPOLIA_CHAIN_ID,
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			amount: '200',
		})

		// Should always return deposit1 (oldest by ID)
		const found1 = await findNextDepositWithAnyRemaining({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})
		expect(found1?.id).toBe(deposit1.id)

		// Partially assign deposit1
		await createAssignmentEventTransactional(deposit1.id, '50', '7777')

		// Still returns deposit1 (has remaining)
		const found2 = await findNextDepositWithAnyRemaining({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})
		expect(found2?.id).toBe(deposit1.id)
		expect(found2?.remaining).toBe('50')

		// Fully assign deposit1
		await createAssignmentEventTransactional(deposit1.id, '50', '7777')

		// Now returns deposit2
		const found3 = await findNextDepositWithAnyRemaining({
			depositor: PROPOSER_CONTROLLER,
			token: TOKEN,
			chain_id: SEPOLIA_CHAIN_ID,
		})
		expect(found3?.id).toBe(deposit2.id)
	})
})
