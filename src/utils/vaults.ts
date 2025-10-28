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

import { pool } from '../index.js'
import { createLogger } from './logger.js'

const logger = createLogger('Vaults')

/**
 * Inserts a new vault row with the provided controllers.
 * Insert-only: errors if the vault already exists.
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
		       VALUES ($1, $2)`,
			[String(vaultId), lowercasedControllers]
		)
		logger.info(
			`Inserted controllers for new vault ${vaultId}: [${lowercasedControllers.join(', ')}]`
		)
	} catch (error) {
		logger.error(`Failed to insert controllers for vault ${vaultId}:`, error)
		throw new Error('Database operation failed during vault insert')
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

/**
 * Retrieves the rules string for a given vault ID.
 * Returns undefined if the vault row does not exist, or null if rules is explicitly NULL.
 *
 * @param vaultId - The numeric ID of the vault.
 */
export async function getRulesForVault(
	vaultId: number
): Promise<string | null | undefined> {
	try {
		const result = await pool.query(
			'SELECT rules FROM vaults WHERE vault = $1',
			[String(vaultId)]
		)
		if (result.rows.length === 0) {
			return undefined
		}
		return result.rows[0].rules as string | null
	} catch (error) {
		logger.error(`Failed to get rules for vault ${vaultId}:`, error)
		throw new Error('Database operation failed while fetching rules')
	}
}

/**
 * Updates the rules for an existing vault (update-only). Returns persisted rules value.
 * Errors if the vault row does not exist.
 *
 * @param vaultId - The numeric ID of the vault.
 * @param rules - The rules string or null to clear.
 */
export async function setRulesForVault(
	vaultId: number,
	rules: string | null
): Promise<string | null> {
	try {
		const result = await pool.query(
			`UPDATE vaults SET rules = $2 WHERE vault = $1 RETURNING rules`,
			[String(vaultId), rules]
		)
		if (result.rows.length === 0) {
			throw new Error('Vault not found')
		}
		return result.rows[0].rules as string | null
	} catch (error) {
		logger.error(`Failed to set rules for vault ${vaultId}:`, error)
		throw new Error('Database operation failed while setting rules')
	}
}

/**
 * Adds a controller address to a vault's controllers array (idempotent). Update-only.
 * Returns the updated list of controllers in lowercase. Errors if the vault is missing.
 *
 * @param vaultId - The numeric ID of the vault.
 * @param controller - Controller Ethereum address.
 */
export async function addControllerToVault(
	vaultId: number,
	controller: string
): Promise<string[]> {
	const lower = controller.toLowerCase()
	try {
		const result = await pool.query(
			`UPDATE vaults
			 SET controllers = (
			   SELECT ARRAY(SELECT DISTINCT c FROM UNNEST(controllers || ARRAY[LOWER($2)]) AS c)
			 )
			 WHERE vault = $1
			 RETURNING controllers`,
			[String(vaultId), lower]
		)
		if (result.rows.length === 0) {
			throw new Error('Vault not found')
		}
		return (result.rows[0].controllers as string[]).map((c) => c.toLowerCase())
	} catch (error) {
		logger.error(
			`Failed to add controller ${controller} to vault ${vaultId}:`,
			error
		)
		throw new Error('Database operation failed while adding controller')
	}
}

/**
 * Removes a controller address from a vault's controllers array.
 * Throws an error if the vault row does not exist.
 * Returns the updated list of controllers in lowercase (may be unchanged if controller not present).
 *
 * @param vaultId - The numeric ID of the vault.
 * @param controller - Controller Ethereum address.
 */
export async function removeControllerFromVault(
	vaultId: number,
	controller: string
): Promise<string[]> {
	const lower = controller.toLowerCase()
	try {
		const result = await pool.query(
			`UPDATE vaults
			 SET controllers = array_remove(controllers, LOWER($2))
			 WHERE vault = $1
			 RETURNING controllers`,
			[String(vaultId), lower]
		)
		if (result.rows.length === 0) {
			throw new Error('Vault not found')
		}
		return (result.rows[0].controllers as string[]).map((c) => c.toLowerCase())
	} catch (error) {
		logger.error(
			`Failed to remove controller ${controller} from vault ${vaultId}:`,
			error
		)
		throw new Error('Database operation failed while removing controller')
	}
}
