/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                           Deposit Utilities                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Persistence helpers for the `deposits` table.
 * - Idempotent insertion by `transfer_uid`
 * - Querying exact, unassigned deposits
 * - Marking a deposit as assigned atomically
 *
 * @packageDocumentation
 */

import { pool } from '../db.js'
import { createLogger } from './logger.js'

const logger = createLogger('Deposits')

export interface InsertDepositParams {
	tx_hash: string
	transfer_uid: string
	chain_id: number
	depositor: string
	token: string
	amount: string // wei as decimal string
}

export async function insertDepositIfMissing(
	params: InsertDepositParams
): Promise<{ id: number }> {
	const txHash = params.tx_hash
	const uid = params.transfer_uid
	const chainId = params.chain_id
	const depositor = params.depositor.toLowerCase()
	const token = params.token.toLowerCase()
	const amount = params.amount

	const client = await pool.connect()
	try {
		const insert = await client.query(
			`INSERT INTO deposits (tx_hash, transfer_uid, chain_id, depositor, token, amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (transfer_uid) DO NOTHING
       RETURNING id`,
			[txHash, uid, chainId, depositor, token, amount]
		)

		if (insert.rows.length > 0) {
			return { id: insert.rows[0].id as number }
		}

		const select = await client.query(
			`SELECT id FROM deposits WHERE transfer_uid = $1`,
			[uid]
		)
		if (select.rows.length === 0) {
			logger.error(
				'insertDepositIfMissing: row not found after ON CONFLICT DO NOTHING',
				{
					transfer_uid: uid,
				}
			)
			throw new Error('Deposit insert failed')
		}
		return { id: select.rows[0].id as number }
	} finally {
		client.release()
	}
}

/**
 * Returns remaining (unassigned) amount for a deposit as a decimal string (wei).
 */
export async function getDepositRemaining(deposit_id: number): Promise<string> {
	const result = await pool.query(
		`SELECT d.amount::numeric(78,0) AS total,
                COALESCE(SUM(e.amount)::numeric(78,0), 0) AS assigned
         FROM deposits d
         LEFT JOIN deposit_assignment_events e ON e.deposit_id = d.id
         WHERE d.id = $1
         GROUP BY d.id`,
		[deposit_id]
	)
	if (result.rows.length === 0) {
		throw new Error('Deposit not found')
	}
	const total = BigInt((result.rows[0].total as string) ?? '0')
	const assigned = BigInt((result.rows[0].assigned as string) ?? '0')
	const remaining = total - assigned
	if (remaining < 0n) {
		// Should never happen; indicates historical inconsistency
		return '0'
	}
	return remaining.toString()
}

export interface FindDepositWithRemainingParams {
	depositor: string
	token: string
	chain_id: number
	minAmount: string // wei
}

/**
 * Finds the oldest deposit for a depositor/token/chain where remaining \>= minAmount.
 */
export async function findDepositWithSufficientRemaining(
	params: FindDepositWithRemainingParams
): Promise<{ id: number; remaining: string } | null> {
	const depositor = params.depositor.toLowerCase()
	const token = params.token.toLowerCase()
	const chainId = params.chain_id
	const minAmount = BigInt(params.minAmount)

	const result = await pool.query(
		`SELECT d.id,
                d.amount::numeric(78,0) AS total,
                COALESCE(SUM(e.amount)::numeric(78,0), 0) AS assigned
         FROM deposits d
         LEFT JOIN deposit_assignment_events e ON e.deposit_id = d.id
         WHERE d.depositor = $1
           AND LOWER(d.token) = LOWER($2)
           AND d.chain_id = $3
         GROUP BY d.id
         HAVING (d.amount::numeric(78,0) - COALESCE(SUM(e.amount)::numeric(78,0), 0)) >= 0
         ORDER BY d.id ASC`,
		[depositor, token, chainId]
	)

	for (const row of result.rows) {
		const total = BigInt((row.total as string) ?? '0')
		const assigned = BigInt((row.assigned as string) ?? '0')
		const remaining = total - assigned
		if (remaining >= minAmount) {
			return { id: row.id as number, remaining: remaining.toString() }
		}
	}
	return null
}

/**
 * Creates a partial/full assignment event for a deposit within a transaction.
 * Ensures we do not over-assign by locking the deposit row and recomputing remaining.
 * Returns the new assignment id and whether the deposit became fully assigned.
 */
export async function createAssignmentEventTransactional(
	deposit_id: number,
	amount: string,
	credited_vault: string
): Promise<{ assignmentId: number; fullyAssigned: boolean }> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')

		// Lock the deposit row
		const depRes = await client.query(
			`SELECT amount::numeric(78,0) AS total FROM deposits WHERE id = $1 FOR UPDATE`,
			[deposit_id]
		)
		if (depRes.rows.length === 0) {
			await client.query('ROLLBACK')
			throw new Error('Deposit not found')
		}
		const total = BigInt((depRes.rows[0].total as string) ?? '0')

		const assignedRes = await client.query(
			`SELECT COALESCE(SUM(amount)::numeric(78,0), 0) AS assigned
             FROM deposit_assignment_events WHERE deposit_id = $1`,
			[deposit_id]
		)
		const assigned = BigInt((assignedRes.rows[0].assigned as string) ?? '0')

		const req = BigInt(amount)
		const remaining = total - assigned
		if (req <= 0n) {
			await client.query('ROLLBACK')
			throw new Error('Assignment amount must be positive')
		}
		if (req > remaining) {
			await client.query('ROLLBACK')
			throw new Error('Not enough remaining to assign from deposit')
		}

		const ins = await client.query(
			`INSERT INTO deposit_assignment_events (deposit_id, amount, credited_vault)
             VALUES ($1, $2, $3)
             RETURNING id`,
			[deposit_id, amount, String(credited_vault)]
		)
		const assignmentId = ins.rows[0].id as number

		const newAssigned = assigned + req
		const fullyAssigned = newAssigned === total
		if (fullyAssigned) {
			await client.query(
				`UPDATE deposits SET assigned_at = CURRENT_TIMESTAMP WHERE id = $1`,
				[deposit_id]
			)
		}

		await client.query('COMMIT')
		return { assignmentId, fullyAssigned }
	} catch (error) {
		try {
			await client.query('ROLLBACK')
		} catch (rollbackError) {
			logger.warn(
				'Rollback failed during createAssignmentEventTransactional',
				rollbackError
			)
		}
		throw error
	} finally {
		client.release()
	}
}
