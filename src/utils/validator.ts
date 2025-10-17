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
	TokenAmount,
	IntentionInput,
	IntentionAsset,
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
 * Validates an intention object
 */
export function validateIntention(intention: Intention): Intention {
	const startTime = Date.now()
	const validated: Intention = { ...intention }

	try {
		// Validate addresses if present
		if (intention.from) {
			validated.from = validateAddress(intention.from, 'intention.from')
		}
		if (intention.to) {
			validated.to = validateAddress(intention.to, 'intention.to')
		}
		if (intention.from_token_address) {
			validated.from_token_address = validateAddress(
				intention.from_token_address,
				'intention.from_token_address'
			)
		}
		if (intention.to_token_address) {
			validated.to_token_address = validateAddress(
				intention.to_token_address,
				'intention.to_token_address'
			)
		}

		// Validate amounts if present
		if (intention.amount_sent) {
			validated.amount_sent = validateBalance(
				intention.amount_sent,
				'intention.amount_sent'
			)
		}
		if (intention.amount_received) {
			validated.amount_received = validateBalance(
				intention.amount_received,
				'intention.amount_received'
			)
		}

		// Validate nonce if present
		if (intention.nonce !== undefined) {
			validated.nonce = validateNonce(intention.nonce, 'intention.nonce')
		}

		// Validate signature if present
		if (intention.signature) {
			validated.signature = validateSignature(intention.signature)
		}

		// Validate new format assets if present
		if (intention.assets) {
			validated.assets = validateAssets(intention.assets, 'intention.assets')
		}

		// Validate new format inputs/outputs if present
		if (intention.inputs) {
			validated.inputs = validateIntentionInputs(
				intention.inputs,
				'intention.inputs'
			)
		}
		if (intention.outputs) {
			validated.outputs = intention.outputs.map((output, index) => {
				const validatedOutput = { ...output }
				if (output.vault) {
					validatedOutput.vault = validateAddress(
						output.vault,
						`intention.outputs[${index}].vault`
					)
				}
				if (output.externalAddress) {
					validatedOutput.externalAddress = validateAddress(
						output.externalAddress,
						`intention.outputs[${index}].externalAddress`
					)
				}
				if (output.asset) {
					validatedOutput.asset = validateAddress(
						output.asset,
						`intention.outputs[${index}].asset`
					)
				}
				return validatedOutput
			})
		}

		// Validate chainID if present
		if (intention.chainID !== undefined) {
			if (typeof intention.chainID !== 'number') {
				throw new ValidationError(
					'chainID must be a number',
					'intention.chainID',
					intention.chainID
				)
			}
			validated.chainID = intention.chainID
		}

		diagnostic.trace('Intention validation successful', {
			validationTime: Date.now() - startTime,
			hasInputs: !!intention.inputs,
			hasOutputs: !!intention.outputs,
			isLegacyFormat: !intention.inputs && !intention.outputs,
		})

		return validated
	} catch (error) {
		diagnostic.debug('Intention validation failed', {
			validationTime: Date.now() - startTime,
			error: error instanceof Error ? error.message : String(error),
		})
		throw error
	}
}

/**
 * Validates an array of token amounts
 * @deprecated Use validateIntentionInputs instead
 */
export function validateTokenAmounts(
	amounts: TokenAmount[],
	fieldName: string
): TokenAmount[] {
	return amounts.map((amount, index) => ({
		token: validateAddress(amount.token, `${fieldName}[${index}].token`),
		amount: validateBalance(amount.amount, `${fieldName}[${index}].amount`),
	}))
}

/**
 * Validates an array of intention assets
 */
function validateAssets(
	assets: IntentionAsset[],
	fieldName: string
): IntentionAsset[] {
	return assets.map((asset, index) => ({
		asset: validateAddress(asset.asset, `${fieldName}[${index}].asset`),
		assetName: asset.assetName,
	}))
}

/**
 * Validates an array of intention inputs
 */
function validateIntentionInputs(
	inputs: IntentionInput[],
	fieldName: string
): IntentionInput[] {
	return inputs.map((input, index) => {
		const validated: IntentionInput = {
			vault: validateAddress(input.vault, `${fieldName}[${index}].vault`),
			amount:
				typeof input.amount === 'string'
					? validateBalance(input.amount, `${fieldName}[${index}].amount`)
					: input.amount,
			digits: input.digits,
			chain: input.chain,
			assetName: input.assetName,
		}

		// Handle both 'asset' and 'token' fields for backwards compatibility
		if (input.asset) {
			validated.asset = validateAddress(
				input.asset,
				`${fieldName}[${index}].asset`
			)
		}
		if (input.token) {
			validated.token = validateAddress(
				input.token,
				`${fieldName}[${index}].token`
			)
		}

		return validated
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
