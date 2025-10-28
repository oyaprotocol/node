/**
 * Integration tests for deposits utils against a real database.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { pool } from '../../src/db.js'
import {
  insertDepositIfMissing,
  findExactUnassignedDeposit,
  markDepositAssigned,
} from '../../src/utils/deposits.js'

const TEST_TX = '0xtest-deposit-tx'
const TEST_UID = (n: number) => `${TEST_TX}:${n}`
const CTRL = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc'
const TOKEN = '0x1111111111111111111111111111111111111111'
const ZERO = '0x0000000000000000000000000000000000000000'

beforeAll(async () => {
  await pool.query("DELETE FROM deposits WHERE tx_hash = $1", [TEST_TX])
})

afterAll(async () => {
  await pool.query("DELETE FROM deposits WHERE tx_hash = $1", [TEST_TX])
})

beforeEach(async () => {
  await pool.query("DELETE FROM deposits WHERE tx_hash = $1", [TEST_TX])
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

    const row = await pool.query('SELECT * FROM deposits WHERE id = $1', [r1.id])
    expect(row.rows[0].tx_hash).toBe(TEST_TX)
    expect(row.rows[0].depositor).toBe(CTRL.toLowerCase())
    expect(row.rows[0].token).toBe(TOKEN.toLowerCase())
    expect(row.rows[0].amount).toBe('1000')
    expect(row.rows[0].assigned_at).toBeNull()
  })

  test('findExactUnassignedDeposit then markDepositAssigned', async () => {
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

    const found1 = await findExactUnassignedDeposit({
      depositor: CTRL,
      token: TOKEN,
      amount: '123',
      chain_id: 11155111,
    })
    expect(found1?.id).toBeDefined()

    const found2 = await findExactUnassignedDeposit({
      depositor: CTRL,
      token: ZERO,
      amount: '555',
      chain_id: 11155111,
    })
    expect(found2?.id).toBe(ins.id)

    // mark assigned
    await markDepositAssigned(found2!.id, '9999')
    const reread = await pool.query('SELECT credited_vault, assigned_at FROM deposits WHERE id = $1', [found2!.id])
    expect(reread.rows[0].credited_vault).toBe('9999')
    expect(reread.rows[0].assigned_at).not.toBeNull()

    // no longer available for selection
    const notFound = await findExactUnassignedDeposit({
      depositor: CTRL,
      token: ZERO,
      amount: '555',
      chain_id: 11155111,
    })
    expect(notFound).toBeNull()
  })
})


