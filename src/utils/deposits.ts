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

export interface FindExactUnassignedParams {
	depositor: string
	token: string
	amount: string
	chain_id: number
}

export async function findExactUnassignedDeposit(
	params: FindExactUnassignedParams
): Promise<{ id: number } | null> {
	const depositor = params.depositor.toLowerCase()
	const token = params.token.toLowerCase()
	const amount = params.amount
	const chainId = params.chain_id

	const result = await pool.query(
		`SELECT id
     FROM deposits
     WHERE depositor = $1
       AND LOWER(token) = LOWER($2)
       AND amount = $3
       AND chain_id = $4
       AND assigned_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
		[depositor, token, amount, chainId]
	)

	if (result.rows.length === 0) return null
	return { id: result.rows[0].id as number }
}

export async function markDepositAssigned(
	deposit_id: number,
	credited_vault: string
): Promise<void> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const update = await client.query(
			`UPDATE deposits
       SET credited_vault = $2,
           assigned_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND assigned_at IS NULL
       RETURNING id`,
			[deposit_id, String(credited_vault)]
		)
		if (update.rows.length === 0) {
			await client.query('ROLLBACK')
			throw new Error('Deposit already assigned or not found')
		}
		await client.query('COMMIT')
	} catch (error) {
		try {
			await client.query('ROLLBACK')
		} catch (rollbackError) {
			logger.warn('Rollback failed during markDepositAssigned', rollbackError)
		}
		throw error
	} finally {
		client.release()
	}
}
