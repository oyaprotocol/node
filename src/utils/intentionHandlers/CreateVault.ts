/**
 * CreateVault intention handler
 */

import type { Intention } from '../../types/core.js'
import type { VaultTrackerContract } from '../../proposer.js'

export async function handleCreateVault(params: {
	intention: Intention
	validatedController: string
	deps: {
		vaultTrackerContract: VaultTrackerContract
		upsertVaultControllers: (
			vaultId: number,
			controllers: string[]
		) => Promise<void>
		createAndSubmitSeedingIntention: (newVaultId: number) => Promise<void>
		logger: {
			info: (...args: unknown[]) => void
			error: (...args: unknown[]) => void
		}
	}
}): Promise<void> {
	const { validatedController, deps } = params

	try {
		deps.logger.info('Processing CreateVault intention...')

		// 1. Call the on-chain contract to create the vault.
		const tx = await deps.vaultTrackerContract.createVault(validatedController)
		const receipt = await tx.wait()
		if (!receipt) {
			throw new Error('Transaction receipt is null, mining may have failed.')
		}

		// 2. Parse the VaultCreated event to get the new vault ID.
		let newVaultId: number | null = null
		for (const log of receipt.logs) {
			try {
				const parsedLog = deps.vaultTrackerContract.interface.parseLog(log)
				if (parsedLog && parsedLog.name === 'VaultCreated') {
					newVaultId = Number(parsedLog.args[0])
					break
				}
			} catch {
				// Ignore logs that are not from the VaultTracker ABI
			}
		}
		if (newVaultId === null) {
			throw new Error('Could not find VaultCreated event in transaction logs.')
		}

		deps.logger.info(`On-chain vault created with ID: ${newVaultId}`)

		// 3. Persist the new vault-to-controller mapping to the database.
		await deps.upsertVaultControllers(newVaultId, [validatedController])

		// 4. Submit an intention to seed it with initial balances.
		await deps.createAndSubmitSeedingIntention(newVaultId)
	} catch (error) {
		deps.logger.error('Failed to process CreateVault intention:', error)
		throw error
	}
}
