/**
 * AssignDeposit intention handler
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
	getVaultsForController: (controller: string) => Promise<string[]>
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

	// Determine submitter vault for nonce tracking
	// 1. If inputs have `from` field, use that (all inputs must have the same `from` value per validator)
	// 2. If no `from` field, determine from controller by querying vaults
	let submitterVaultId: number | 0 = 0
	const inputsWithFrom = intention.inputs.filter(
		(input) => input.from !== undefined
	)
	if (inputsWithFrom.length > 0) {
		// All inputs should have the same `from` value per validator, but double-check
		const fromValues = new Set(inputsWithFrom.map((input) => input.from))
		if (fromValues.size > 1) {
			throw new Error(
				'AssignDeposit requires all inputs to have the same `from` vault ID'
			)
		}
		submitterVaultId = inputsWithFrom[0].from as number
	} else {
		// No `from` field in inputs, determine from controller
		const vaults = await context.getVaultsForController(validatedController)
		if (vaults.length === 1) {
			submitterVaultId = parseInt(vaults[0])
		} else if (vaults.length > 1) {
			// Multiple vaults controlled by this controller - use the first one
			context.logger.info(
				`Controller ${validatedController} controls multiple vaults, using first vault ${vaults[0]} for nonce tracking`
			)
			submitterVaultId = parseInt(vaults[0])
		} else {
			// No vaults found - cannot determine submitter vault, use 0 (no nonce update)
			context.logger.info(
				`Controller ${validatedController} does not control any vaults, using from=0 (no nonce update)`
			)
			submitterVaultId = 0
		}
	}

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
			deposit_id: match.id,
			depositor: validatedController,
		})
	}

	context.diagnostic.info('AssignDeposit intention processed', {
		controller: validatedController,
		count: intention.inputs.length,
		submitterVaultId,
	})
	context.logger.info(
		`AssignDeposit cached with proof count: ${proof.length}, submitter vault: ${submitterVaultId}`
	)

	return {
		execution: [
			{
				intention,
				from: submitterVaultId,
				proof,
				signature: validatedSignature,
			},
		],
	}
}
