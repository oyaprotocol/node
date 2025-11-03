/**
 * AssignDeposit intention handler
 *
 * Processes AssignDeposit intentions which assign existing on-chain deposits to vaults.
 *
 * Key features:
 * - Discovers deposits from on-chain events (ERC20 or ETH)
 * - Selects deposits with sufficient remaining balance
 * - Supports partial deposit assignments (can combine multiple deposits)
 * - AssignDeposit is a protocol-level action: always sets execution.from = 0 (protocol vault)
 * - Nonces are not relevant for AssignDeposit; conflicts resolved by bundle inclusion order
 *
 * At publish time, deposits are assigned and balances are credited to destination vaults.
 * If a selected deposit is exhausted, the system automatically falls back to combining
 * multiple deposits to fulfill the requirement.
 */

import type {
	Intention,
	ExecutionObject,
	IntentionInput,
	IntentionOutput,
} from '../../types/core.js'

type AssignDepositContext = {
	validateAssignDepositStructure: (intention: Intention) => Promise<void>
	discoverAndIngestErc20Deposits: (args: {
		token: string
		chainId: number
		fromBlockHex?: string
		toBlockHex?: string
	}) => Promise<void>
	discoverAndIngestEthDeposits: (args: {
		chainId: number
		fromBlockHex?: string
		toBlockHex?: string
	}) => Promise<void>
	findDepositWithSufficientRemaining: (args: {
		depositor: string
		token: string
		chain_id: number
		minAmount: string
	}) => Promise<{ id: number; remaining: string } | null>
	validateVaultIdOnChain: (vaultId: number) => Promise<void>
	logger: { info: (...args: unknown[]) => void }
	diagnostic: { info: (...args: unknown[]) => void }
}

export async function handleAssignDeposit(params: {
	intention: Intention
	validatedController: string
	validatedSignature: string
	context: AssignDepositContext
}): Promise<ExecutionObject> {
	const { intention, validatedController, validatedSignature, context } = params

	await context.validateAssignDepositStructure(intention)

	// AssignDeposit is a protocol-level action: always use from=0 (protocol vault)
	// Nonces are not relevant for AssignDeposit; conflicts resolved by bundle inclusion order
	const PROTOCOL_VAULT_ID = 0

	const zeroAddress = '0x0000000000000000000000000000000000000000'
	const proof: unknown[] = []

	for (let i = 0; i < intention.inputs.length; i++) {
		const input: IntentionInput = intention.inputs[i]
		const output: IntentionOutput = intention.outputs[i]

		// Optional discovery hints in input.data
		let fromBlockHex: string | undefined
		let toBlockHex: string | undefined
		if (input.data) {
			try {
				const parsed = JSON.parse(input.data)
				if (typeof parsed.fromBlock === 'string')
					fromBlockHex = parsed.fromBlock
				if (typeof parsed.toBlock === 'string') toBlockHex = parsed.toBlock
			} catch {
				// ignore malformed hints
			}
		}

		const isEth = input.asset.toLowerCase() === zeroAddress
		if (isEth) {
			await context.discoverAndIngestEthDeposits({
				chainId: input.chain_id,
				fromBlockHex,
				toBlockHex,
			})
		} else {
			await context.discoverAndIngestErc20Deposits({
				token: input.asset,
				chainId: input.chain_id,
				fromBlockHex,
				toBlockHex,
			})
		}

		const match = await context.findDepositWithSufficientRemaining({
			depositor: validatedController,
			token: isEth ? zeroAddress : input.asset,
			chain_id: input.chain_id,
			minAmount: input.amount,
		})
		if (!match) {
			throw new Error(
				`No deposit with sufficient remaining found for asset ${input.asset} amount ${input.amount}`
			)
		}

		proof.push({
			token: isEth ? zeroAddress : input.asset,
			to: output.to as number,
			amount: input.amount,
			depositor: validatedController,
		})
	}

	context.diagnostic.info('AssignDeposit intention processed', {
		controller: validatedController,
		count: intention.inputs.length,
		protocolVault: PROTOCOL_VAULT_ID,
	})
	context.logger.info(
		`AssignDeposit cached with proof count: ${proof.length}, protocol-level action (from=0)`
	)

	return {
		execution: [
			{
				intention,
				from: PROTOCOL_VAULT_ID,
				proof,
				signature: validatedSignature,
			},
		],
	}
}
