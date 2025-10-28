/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Vault Management Utilities                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Provides utilities for interacting with the 'vaults' table, which maps
 * vault IDs to their controller addresses.
 *
 * @packageDocumentation
 */

import { pool } from '../db.js'
import { createLogger } from './logger.js'

const logger = createLogger('Vaults')

/**
 * Inserts or updates the list of controllers for a given vault ID.
 *
 * @param vaultId - The numeric ID of the vault.
 * @param controllers - An array of controller Ethereum addresses.
 */
export async function upsertVaultControllers(
	vaultId: number,
	controllers: string[]
): Promise<void> {
	const lowercasedControllers = controllers.map((c) => c.toLowerCase())
	try {
		await pool.query(
			`INSERT INTO vaults (vault, controllers)
       VALUES ($1, $2)
       ON CONFLICT (vault)
       DO UPDATE SET controllers = EXCLUDED.controllers`,
			[String(vaultId), lowercasedControllers]
		)
		logger.info(
			`Upserted controllers for vault ${vaultId}: [${lowercasedControllers.join(', ')}]`
		)
	} catch (error) {
		logger.error(`Failed to upsert controllers for vault ${vaultId}:`, error)
		throw new Error('Database operation failed during vault upsert')
	}
}

/**
 * Retrieves the list of controller addresses for a given vault ID.
 *
 * @param vaultId - The numeric ID of the vault.
 * @returns A promise that resolves to an array of lowercase controller addresses.
 */
export async function getControllersForVault(
	vaultId: number
): Promise<string[]> {
	try {
		const result = await pool.query(
			'SELECT controllers FROM vaults WHERE vault = $1',
			[String(vaultId)]
		)
		if (result.rows.length === 0) {
			return []
		}
		// The database returns controllers as an array of strings
		return result.rows[0].controllers.map((c: string) => c.toLowerCase())
	} catch (error) {
		logger.error(`Failed to get controllers for vault ${vaultId}:`, error)
		throw new Error('Database operation failed while fetching controllers')
	}
}

/**
 * Finds all vault IDs associated with a given controller address.
 *
 * @param controller - The Ethereum address of the controller.
 * @returns A promise that resolves to an array of vault ID strings.
 */
export async function getVaultsForController(
	controller: string
): Promise<string[]> {
	try {
		const result = await pool.query(
			'SELECT vault FROM vaults WHERE $1 = ANY(controllers)',
			[controller.toLowerCase()]
		)
		return result.rows.map((row) => row.vault)
	} catch (error) {
		logger.error(`Failed to get vaults for controller ${controller}:`, error)
		throw new Error('Database operation failed while fetching vaults')
	}
}
