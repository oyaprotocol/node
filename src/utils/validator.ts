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

	const validated: Intention = {
		action: intention.action,
		nonce: validateNonce(intention.nonce, 'intention.nonce'),
		expiry: validateTimestamp(intention.expiry, 'intention.expiry'),
		inputs: validateIntentionInputs(intention.inputs, 'intention.inputs'),
		outputs: validateIntentionOutputs(intention.outputs, 'intention.outputs'),
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
