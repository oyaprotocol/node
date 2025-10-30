/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Validation Utility                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Lightweight Input validation for Oya Protocol operations.
 * Provides type-safe validation with detailed error reporting.
 *
 * Features:
 * - Ethereum address validation
 * - Numeric precision validation for balances
 * - Signature format validation
 * - Intention structure validation
 *
 * @packageDocumentation
 */

import { ethers } from 'ethers'
import { createLogger, diagnostic } from './logger.js'
import type {
	Intention,
	IntentionInput,
	IntentionOutput,
	FeeAmount,
	TotalFeeAmount,
} from '../types/core.js'

/** Logger instance for validation module */
const logger = createLogger('Validator')

/**
 * Validation error with detailed context
 */
export class ValidationError extends Error {
	constructor(
		message: string,
		public field: string,
		public value: unknown,
		public context?: Record<string, unknown>
	) {
		super(message)
		this.name = 'ValidationError'
	}
}

/**
 * Validates an Ethereum address
 */
export function validateAddress(address: string, fieldName: string): string {
	const startTime = Date.now()

	if (!address) {
		throw new ValidationError('Address is required', fieldName, address)
	}

	if (!ethers.isAddress(address)) {
		diagnostic.debug('Invalid Ethereum address', {
			field: fieldName,
			value: address,
			validationTime: Date.now() - startTime,
		})
		throw new ValidationError('Invalid Ethereum address', fieldName, address)
	}

	// Return normalized lowercase address (matching your DB storage pattern)
	return address.toLowerCase()
}

/**
 * Validates a signature format
 * Ethereum signatures are 65 bytes: r (32) + s (32) + v (1) = 130 hex chars + 0x prefix
 */
export function validateSignature(signature: string): string {
	if (!signature) {
		throw new ValidationError('Signature is required', 'signature', signature)
	}

	// Standard Ethereum signature: 0x + 130 hex chars = 132 total
	const signatureRegex = /^0x[a-fA-F0-9]{130}$/
	if (!signatureRegex.test(signature)) {
		throw new ValidationError(
			'Invalid signature format or length',
			'signature',
			signature,
			{ expectedFormat: '0x + 130 hex characters (65 bytes)' }
		)
	}

	return signature
}

/**
 * Validates a numeric balance with precision matching NUMERIC(78,18)
 */
export function validateBalance(
	balance: string,
	fieldName: string = 'balance'
): string {
	if (!balance) {
		throw new ValidationError('Balance is required', fieldName, balance)
	}

	// Match database NUMERIC(78,18) precision
	const balanceRegex = /^\d{1,60}(\.\d{0,18})?$/
	if (!balanceRegex.test(balance)) {
		throw new ValidationError(
			'Invalid balance format or precision',
			fieldName,
			balance,
			{ maxIntegerDigits: 60, maxDecimalDigits: 18 }
		)
	}

	// Check for negative values
	if (parseFloat(balance) < 0) {
		throw new ValidationError('Balance cannot be negative', fieldName, balance)
	}

	return balance
}

/**
 * Validates a nonce value
 */
export function validateNonce(
	nonce: unknown,
	fieldName: string = 'nonce'
): number {
	if (typeof nonce !== 'number') {
		throw new ValidationError('Nonce must be a number', fieldName, nonce, {
			receivedType: typeof nonce,
		})
	}

	if (!Number.isInteger(nonce)) {
		throw new ValidationError('Nonce must be an integer', fieldName, nonce)
	}

	if (nonce < 0) {
		throw new ValidationError('Nonce cannot be negative', fieldName, nonce)
	}

	return nonce
}

/**
 * Validates a numeric ID (e.g., chain_id, vault_id)
 */
export function validateId(id: unknown, fieldName: string): number {
	if (typeof id !== 'number') {
		throw new ValidationError('ID must be a number', fieldName, id, {
			receivedType: typeof id,
		})
	}

	if (!Number.isInteger(id)) {
		throw new ValidationError('ID must be an integer', fieldName, id)
	}

	if (id < 0) {
		throw new ValidationError('ID must not be negative', fieldName, id)
	}

	return id
}

/**
 * Validates a Unix timestamp
 */
function validateTimestamp(timestamp: unknown, fieldName: string): number {
	if (typeof timestamp !== 'number') {
		throw new ValidationError(
			'Timestamp must be a number',
			fieldName,
			timestamp,
			{
				receivedType: typeof timestamp,
			}
		)
	}

	if (!Number.isInteger(timestamp)) {
		throw new ValidationError(
			'Timestamp must be an integer',
			fieldName,
			timestamp
		)
	}

	if (timestamp < 0) {
		throw new ValidationError(
			'Timestamp cannot be negative',
			fieldName,
			timestamp
		)
	}

	return timestamp
}

/**
 * Validates an intention object
 */
export function validateIntention(intention: Intention): Intention {
	const startTime = Date.now()

	if (typeof intention.action !== 'string' || intention.action === '') {
		throw new ValidationError(
			'Action is required and must be a non-empty string',
			'intention.action',
			intention.action
		)
	}

	// CreateVault allows empty inputs/outputs
	const isCreateVault = intention.action === 'CreateVault'

	const validated: Intention = {
		action: intention.action,
		nonce: validateNonce(intention.nonce, 'intention.nonce'),
		expiry: validateTimestamp(intention.expiry, 'intention.expiry'),
		inputs: isCreateVault
			? validateIntentionInputsOptional(intention.inputs, 'intention.inputs')
			: validateIntentionInputs(intention.inputs, 'intention.inputs'),
		outputs: isCreateVault
			? validateIntentionOutputsOptional(intention.outputs, 'intention.outputs')
			: validateIntentionOutputs(intention.outputs, 'intention.outputs'),
		totalFee: validateTotalFeeAmounts(intention.totalFee, 'intention.totalFee'),
		proposerTip: validateFeeAmounts(
			intention.proposerTip,
			'intention.proposerTip'
		),
		protocolFee: validateFeeAmounts(
			intention.protocolFee,
			'intention.protocolFee'
		),
	}

	if (intention.agentTip) {
		validated.agentTip = validateFeeAmounts(
			intention.agentTip,
			'intention.agentTip'
		)
	}

	diagnostic.trace('Intention validation successful', {
		validationTime: Date.now() - startTime,
		hasInputs: !!intention.inputs,
		hasOutputs: !!intention.outputs,
		isLegacyFormat: !intention.inputs && !intention.outputs,
	})

	return validated
}

/**
 * Validates an array of intention inputs
 */
function validateIntentionInputs(
	inputs: IntentionInput[],
	fieldName: string
): IntentionInput[] {
	if (!Array.isArray(inputs) || inputs.length === 0) {
		throw new ValidationError(
			'Inputs must be a non-empty array',
			fieldName,
			inputs
		)
	}
	return inputs.map((input, index) => {
		const fieldPath = `${fieldName}[${index}]`
		const validated: IntentionInput = {
			asset: validateAddress(input.asset, `${fieldPath}.asset`),
			amount: validateBalance(input.amount, `${fieldPath}.amount`),
			chain_id: validateId(input.chain_id, `${fieldPath}.chain_id`),
		}

		if (input.from !== undefined) {
			validated.from = validateId(input.from, `${fieldPath}.from`)
		}

		if (input.data !== undefined) {
			validated.data = input.data
		}

		return validated
	})
}

/**
 * Validates an array of intention outputs
 */
function validateIntentionOutputs(
	outputs: IntentionOutput[],
	fieldName: string
): IntentionOutput[] {
	if (!Array.isArray(outputs) || outputs.length === 0) {
		throw new ValidationError(
			'Outputs must be a non-empty array',
			fieldName,
			outputs
		)
	}
	return outputs.map((output, index) => {
		const fieldPath = `${fieldName}[${index}]`
		const validated: IntentionOutput = {
			asset: validateAddress(output.asset, `${fieldPath}.asset`),
			amount: validateBalance(output.amount, `${fieldPath}.amount`),
			chain_id: validateId(output.chain_id, `${fieldPath}.chain_id`),
		}

		const hasTo = output.to !== undefined
		const hasToExternal =
			output.to_external !== undefined && output.to_external !== ''

		if (hasTo && hasToExternal) {
			throw new ValidationError(
				'Fields "to" and "to_external" are mutually exclusive',
				fieldPath,
				output
			)
		}

		if (!hasTo && !hasToExternal) {
			throw new ValidationError(
				'Either "to" or "to_external" must be provided',
				fieldPath,
				output
			)
		}

		if (hasTo) {
			validated.to = validateId(output.to, `${fieldPath}.to`)
		}

		if (hasToExternal) {
			validated.to_external = validateAddress(
				output.to_external as string,
				`${fieldPath}.to_external`
			)
		}

		if (output.data !== undefined) {
			validated.data = output.data
		}

		return validated
	})
}

/**
 * Validates an array of intention inputs (allows empty arrays for CreateVault)
 */
function validateIntentionInputsOptional(
	inputs: IntentionInput[],
	fieldName: string
): IntentionInput[] {
	if (!Array.isArray(inputs)) {
		throw new ValidationError('Inputs must be an array', fieldName, inputs)
	}
	if (inputs.length === 0) {
		return []
	}
	return inputs.map((input, index) => {
		const fieldPath = `${fieldName}[${index}]`
		const validated: IntentionInput = {
			asset: validateAddress(input.asset, `${fieldPath}.asset`),
			amount: validateBalance(input.amount, `${fieldPath}.amount`),
			chain_id: validateId(input.chain_id, `${fieldPath}.chain_id`),
		}

		if (input.from !== undefined) {
			validated.from = validateId(input.from, `${fieldPath}.from`)
		}

		if (input.data !== undefined) {
			validated.data = input.data
		}

		return validated
	})
}

/**
 * Validates an array of intention outputs (allows empty arrays for CreateVault)
 */
function validateIntentionOutputsOptional(
	outputs: IntentionOutput[],
	fieldName: string
): IntentionOutput[] {
	if (!Array.isArray(outputs)) {
		throw new ValidationError('Outputs must be an array', fieldName, outputs)
	}
	if (outputs.length === 0) {
		return []
	}
	return outputs.map((output, index) => {
		const fieldPath = `${fieldName}[${index}]`
		const validated: IntentionOutput = {
			asset: validateAddress(output.asset, `${fieldPath}.asset`),
			amount: validateBalance(output.amount, `${fieldPath}.amount`),
			chain_id: validateId(output.chain_id, `${fieldPath}.chain_id`),
		}

		const hasTo = output.to !== undefined
		const hasToExternal =
			output.to_external !== undefined && output.to_external !== ''

		if (hasTo && hasToExternal) {
			throw new ValidationError(
				'Fields "to" and "to_external" are mutually exclusive',
				fieldPath,
				output
			)
		}

		if (!hasTo && !hasToExternal) {
			throw new ValidationError(
				'Either "to" or "to_external" must be provided',
				fieldPath,
				output
			)
		}

		if (hasTo) {
			validated.to = validateId(output.to, `${fieldPath}.to`)
		}

		if (hasToExternal) {
			validated.to_external = validateAddress(
				output.to_external!,
				`${fieldPath}.to_external`
			)
		}

		if (output.data !== undefined) {
			validated.data = output.data
		}

		return validated
	})
}

/**
 * Validates an array of fee amounts
 */
function validateFeeAmounts(fees: FeeAmount[], fieldName: string): FeeAmount[] {
	if (!Array.isArray(fees)) {
		throw new ValidationError(`${fieldName} must be an array`, fieldName, fees)
	}
	return fees.map((fee, index) => {
		const validatedFee: FeeAmount = {
			asset: validateAddress(fee.asset, `${fieldName}[${index}].asset`),
			amount: validateBalance(fee.amount, `${fieldName}[${index}].amount`),
			chain_id: validateId(fee.chain_id, `${fieldName}[${index}].chain_id`),
		}

		if (fee.to !== undefined) {
			validatedFee.to = validateId(fee.to, `${fieldName}[${index}].to`)
		}

		return validatedFee
	})
}

/**
 * Validates an array of total fee amounts
 */
function validateTotalFeeAmounts(
	fees: TotalFeeAmount[],
	fieldName: string
): TotalFeeAmount[] {
	if (!Array.isArray(fees)) {
		throw new ValidationError(`${fieldName} must be an array`, fieldName, fees)
	}
	return fees.map((fee, index) => {
		if (
			!Array.isArray(fee.asset) ||
			fee.asset.some((a) => typeof a !== 'string')
		) {
			throw new ValidationError(
				`Asset must be an array of strings`,
				`${fieldName}[${index}].asset`,
				fee.asset
			)
		}
		return {
			asset: fee.asset,
			amount: validateBalance(fee.amount, `${fieldName}[${index}].amount`),
		}
	})
}

/**
 * Validates bundle data
 */
export function validateBundle(
	bundle: unknown,
	nonce: unknown
): { bundle: unknown; nonce: number } {
	if (!bundle) {
		throw new ValidationError('Bundle is required', 'bundle', bundle)
	}

	const validatedNonce = validateNonce(nonce, 'nonce')

	return { bundle, nonce: validatedNonce }
}

/**
 * Middleware for validation error handling
 */
export function handleValidationError(error: unknown): {
	status: number
	error: string
	details?: unknown
} {
	if (error instanceof ValidationError) {
		logger.debug('Validation error:', {
			field: error.field,
			value: error.value,
			context: error.context,
		})
		return {
			status: 400,
			error: error.message,
			details: {
				field: error.field,
				context: error.context,
			},
		}
	}

	return {
		status: 500,
		error: error instanceof Error ? error.message : 'Unknown validation error',
	}
}

/**
 * Validates that a vault ID exists on-chain by checking it is within range
 * [0, nextVaultId - 1]. Throws if invalid or out of range.
 * Accepts a dependency to fetch nextVaultId to avoid coupling to contract code.
 */
export async function validateVaultIdOnChain(
	vaultId: number,
	getNextVaultId: () => Promise<number>
): Promise<void> {
	if (!Number.isInteger(vaultId) || vaultId < 0) {
		throw new ValidationError('Invalid vault ID', 'vaultId', vaultId)
	}

	const nextIdNumber = await getNextVaultId()
	if (!Number.isFinite(nextIdNumber)) {
		throw new ValidationError(
			'Could not determine nextVaultId from chain',
			'nextVaultId',
			nextIdNumber
		)
	}
	if (vaultId >= nextIdNumber) {
		throw new ValidationError(
			'Vault ID does not exist on-chain',
			'vaultId',
			vaultId,
			{ nextVaultId: nextIdNumber }
		)
	}
}

/**
 * Validates structural and fee constraints for AssignDeposit intentions.
 * Rules:
 * - inputs.length === outputs.length
 * - For each index i: asset/amount/chain_id must match between input and output
 * - outputs[i].to must be provided (no to_external) and must be a valid on-chain vault ID
 * - Fees must be zero (totalFee empty or amounts zero; proposerTip/protocolFee empty; agentTip empty)
 * Accepts a dependency to validate vault IDs on-chain.
 */
export async function validateAssignDepositStructure(
	intention: Intention,
	validateVaultId: (vaultId: number) => Promise<void>
): Promise<void> {
	if (!Array.isArray(intention.inputs) || !Array.isArray(intention.outputs)) {
		throw new ValidationError(
			'AssignDeposit requires inputs and outputs arrays',
			'intention',
			intention
		)
	}
	if (intention.inputs.length !== intention.outputs.length) {
		throw new ValidationError(
			'AssignDeposit requires 1:1 mapping between inputs and outputs',
			'intention',
			{ inputs: intention.inputs.length, outputs: intention.outputs.length }
		)
	}

	if (!Array.isArray(intention.totalFee)) {
		throw new ValidationError(
			'AssignDeposit totalFee must be an array',
			'intention.totalFee',
			intention.totalFee
		)
	}
	// If totalFee is not empty, all amounts must be zero
	if (intention.totalFee.length > 0) {
		const allTotalZero = intention.totalFee.every((f) => f.amount === '0')
		if (!allTotalZero) {
			throw new ValidationError(
				'AssignDeposit totalFee must be zero',
				'intention.totalFee',
				intention.totalFee
			)
		}
	}
	if (
		Array.isArray(intention.proposerTip) &&
		intention.proposerTip.length > 0
	) {
		throw new ValidationError(
			'AssignDeposit proposerTip must be empty',
			'intention.proposerTip',
			intention.proposerTip
		)
	}
	if (
		Array.isArray(intention.protocolFee) &&
		intention.protocolFee.length > 0
	) {
		throw new ValidationError(
			'AssignDeposit protocolFee must be empty',
			'intention.protocolFee',
			intention.protocolFee
		)
	}
	if (Array.isArray(intention.agentTip) && intention.agentTip.length > 0) {
		throw new ValidationError(
			'AssignDeposit agentTip must be empty if provided',
			'intention.agentTip',
			intention.agentTip
		)
	}

	for (let i = 0; i < intention.inputs.length; i++) {
		const input = intention.inputs[i]
		const output = intention.outputs[i]

		if (!output || (output.to === undefined && !output.to_external)) {
			throw new ValidationError(
				'AssignDeposit requires outputs[].to (vault ID)',
				`intention.outputs[${i}].to`,
				output
			)
		}
		if (output.to_external !== undefined) {
			throw new ValidationError(
				'AssignDeposit does not support to_external',
				`intention.outputs[${i}].to_external`,
				output.to_external
			)
		}

		if (input.asset.toLowerCase() !== output.asset.toLowerCase()) {
			throw new ValidationError(
				'AssignDeposit input/output asset mismatch',
				`intention.inputs[${i}].asset`,
				{ input: input.asset, output: output.asset }
			)
		}
		if (input.amount !== output.amount) {
			throw new ValidationError(
				'AssignDeposit input/output amount mismatch',
				`intention.inputs[${i}].amount`,
				{ input: input.amount, output: output.amount }
			)
		}
		if (input.chain_id !== output.chain_id) {
			throw new ValidationError(
				'AssignDeposit input/output chain_id mismatch',
				`intention.inputs[${i}].chain_id`,
				{ input: input.chain_id, output: output.chain_id }
			)
		}

		await validateVaultId(Number(output.to))
	}
}

/**
 * Validates structural and fee constraints for CreateVault intentions.
 * Rules:
 * - inputs must be empty (CreateVault doesn't transfer assets)
 * - outputs must be empty (CreateVault doesn't transfer assets)
 * - All fee arrays must be empty (totalFee, proposerTip, protocolFee, agentTip)
 */
export function validateCreateVaultStructure(intention: Intention): void {
	if (!Array.isArray(intention.inputs)) {
		throw new ValidationError(
			'CreateVault inputs must be an array',
			'intention.inputs',
			intention.inputs
		)
	}
	if (intention.inputs.length > 0) {
		throw new ValidationError(
			'CreateVault inputs must be empty',
			'intention.inputs',
			intention.inputs
		)
	}

	if (!Array.isArray(intention.outputs)) {
		throw new ValidationError(
			'CreateVault outputs must be an array',
			'intention.outputs',
			intention.outputs
		)
	}
	if (intention.outputs.length > 0) {
		throw new ValidationError(
			'CreateVault outputs must be empty',
			'intention.outputs',
			intention.outputs
		)
	}

	if (!Array.isArray(intention.totalFee)) {
		throw new ValidationError(
			'CreateVault totalFee must be an array',
			'intention.totalFee',
			intention.totalFee
		)
	}
	if (intention.totalFee.length > 0) {
		throw new ValidationError(
			'CreateVault totalFee must be empty',
			'intention.totalFee',
			intention.totalFee
		)
	}

	if (
		Array.isArray(intention.proposerTip) &&
		intention.proposerTip.length > 0
	) {
		throw new ValidationError(
			'CreateVault proposerTip must be empty',
			'intention.proposerTip',
			intention.proposerTip
		)
	}

	if (
		Array.isArray(intention.protocolFee) &&
		intention.protocolFee.length > 0
	) {
		throw new ValidationError(
			'CreateVault protocolFee must be empty',
			'intention.protocolFee',
			intention.protocolFee
		)
	}

	if (Array.isArray(intention.agentTip) && intention.agentTip.length > 0) {
		throw new ValidationError(
			'CreateVault agentTip must be empty if provided',
			'intention.agentTip',
			intention.agentTip
		)
	}
}

/**
 * Contract interface for vault ID validation.
 * Provides a method to get the next unassigned vault ID from the chain.
 */
export interface VaultIdValidator {
	getNextVaultId: () => Promise<number>
}

/**
 * Creates configured validator functions that use the provided contract for on-chain validation.
 * Returns validators that can check vault IDs and validate AssignDeposit structures.
 *
 * @param contract - Contract interface that provides nextVaultId
 * @returns Configured validator functions
 */
export function createValidators(contract: VaultIdValidator) {
	/**
	 * Validates that a vault ID exists on-chain using the provided contract.
	 */
	const vaultIdValidator = async (vaultId: number): Promise<void> => {
		await validateVaultIdOnChain(vaultId, contract.getNextVaultId)
	}

	/**
	 * Validates AssignDeposit intention structure with on-chain vault ID validation.
	 */
	const assignDepositValidator = async (
		intention: Intention
	): Promise<void> => {
		await validateAssignDepositStructure(intention, vaultIdValidator)
	}

	return {
		validateVaultIdOnChain: vaultIdValidator,
		validateAssignDepositStructure: assignDepositValidator,
	}
}
