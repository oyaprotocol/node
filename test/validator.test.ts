/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                      Validator Unit Tests                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Comprehensive unit tests for validation utilities.
 * Tests all validation functions with edge cases and error conditions.
 */

import { describe, test, expect } from 'bun:test'
import {
	validateAddress,
	validateSignature,
	validateBalance,
	validateNonce,
	validateIntention,
	validateBundle,
	handleValidationError,
	ValidationError,
} from '../src/utils/validator.js'
import type { Intention } from '../src/types/core.js'

describe('validateAddress', () => {
	test('accepts valid ethereum address', () => {
		const result = validateAddress(
			'0xDB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
			'test'
		)
		expect(result).toBe('0xdb473d9716ac61dc4d4aea6e4d691239db84c77d')
	})

	test('normalizes address to lowercase', () => {
		const result = validateAddress(
			'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
			'test'
		)
		expect(result).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
	})

	test('accepts checksummed address', () => {
		const result = validateAddress(
			'0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
			'test'
		)
		expect(result).toBe('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
	})

	test('throws ValidationError for empty address', () => {
		expect(() => validateAddress('', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for invalid address format', () => {
		expect(() => validateAddress('invalid', 'test')).toThrow(ValidationError)
	})

	test('accepts address without 0x prefix and normalizes to lowercase', () => {
		const result = validateAddress(
			'DB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
			'test'
		)
		expect(result).toBe('db473d9716ac61dc4d4aea6e4d691239db84c77d')
	})

	test('throws ValidationError for address with wrong length', () => {
		expect(() => validateAddress('0x123', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for address with invalid characters', () => {
		expect(() =>
			validateAddress('0xGGGGGG6634C0532925a3b844Bc9e7595f0bEb', 'test')
		).toThrow(ValidationError)
	})

	test('throws ValidationError for null address', () => {
		expect(() => validateAddress(null as unknown as string, 'test')).toThrow(
			ValidationError
		)
	})

	test('throws ValidationError for undefined address', () => {
		expect(() =>
			validateAddress(undefined as unknown as string, 'test')
		).toThrow(ValidationError)
	})
})

describe('validateSignature', () => {
	test('accepts valid signature format', () => {
		// Valid 65-byte signature (130 hex chars)
		const sig = '0x' + '1234567890abcdef'.repeat(8) + '12'
		const result = validateSignature(sig)
		expect(result).toBe(sig)
	})

	test('accepts signature with uppercase hex', () => {
		const sig = '0x' + 'ABCDEF123456'.repeat(11).substring(0, 130)
		const result = validateSignature(sig)
		expect(result).toBe(sig)
	})

	test('throws ValidationError for empty signature', () => {
		expect(() => validateSignature('')).toThrow(ValidationError)
	})

	test('throws ValidationError for signature without 0x prefix', () => {
		expect(() => validateSignature('1234567890abcdef')).toThrow(ValidationError)
	})

	test('throws ValidationError for signature with invalid characters', () => {
		expect(() => validateSignature('0xGGGGGG')).toThrow(ValidationError)
	})

	test('throws ValidationError for signature with spaces', () => {
		expect(() => validateSignature('0x1234 5678')).toThrow(ValidationError)
	})

	test('accepts standard 65-byte signature', () => {
		// Standard Ethereum signature: 65 bytes = 130 hex chars + 0x prefix
		const standardSig = '0x' + 'a'.repeat(130)
		const result = validateSignature(standardSig)
		expect(result).toBe(standardSig)
	})

	test('throws ValidationError for signature that is too short', () => {
		expect(() => validateSignature('0x12')).toThrow(ValidationError)
	})

	test('throws ValidationError for signature that is too long', () => {
		const tooLong = '0x' + 'a'.repeat(200)
		expect(() => validateSignature(tooLong)).toThrow(ValidationError)
	})

	test('throws ValidationError for null signature', () => {
		expect(() => validateSignature(null as unknown as string)).toThrow(
			ValidationError
		)
	})

	test('throws ValidationError for undefined signature', () => {
		expect(() => validateSignature(undefined as unknown as string)).toThrow(
			ValidationError
		)
	})
})

describe('validateBalance', () => {
	test('accepts valid integer balance', () => {
		const result = validateBalance('1000', 'test')
		expect(result).toBe('1000')
	})

	test('accepts valid decimal balance', () => {
		const result = validateBalance('1000.123456789012345678', 'test')
		expect(result).toBe('1000.123456789012345678')
	})

	test('accepts zero balance', () => {
		const result = validateBalance('0', 'test')
		expect(result).toBe('0')
	})

	test('accepts balance with maximum decimals (18)', () => {
		const result = validateBalance('123.123456789012345678', 'test')
		expect(result).toBe('123.123456789012345678')
	})

	test('accepts very large balance (60 integer digits)', () => {
		const largeBalance = '1'.repeat(60)
		const result = validateBalance(largeBalance, 'test')
		expect(result).toBe(largeBalance)
	})

	test('throws ValidationError for empty balance', () => {
		expect(() => validateBalance('', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for negative balance', () => {
		expect(() => validateBalance('-100', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for balance with too many decimals', () => {
		expect(() => validateBalance('100.1234567890123456789', 'test')).toThrow(
			ValidationError
		)
	})

	test('throws ValidationError for balance with too many integer digits', () => {
		const tooLarge = '1'.repeat(61)
		expect(() => validateBalance(tooLarge, 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for non-numeric balance', () => {
		expect(() => validateBalance('abc', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for balance with letters', () => {
		expect(() => validateBalance('100.5a', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for scientific notation', () => {
		expect(() => validateBalance('1e18', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for scientific notation with decimals', () => {
		expect(() => validateBalance('1.5e10', 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for null balance', () => {
		expect(() => validateBalance(null as unknown as string, 'test')).toThrow(
			ValidationError
		)
	})

	test('throws ValidationError for undefined balance', () => {
		expect(() =>
			validateBalance(undefined as unknown as string, 'test')
		).toThrow(ValidationError)
	})
})

describe('validateNonce', () => {
	test('accepts valid nonce', () => {
		const result = validateNonce(42, 'test')
		expect(result).toBe(42)
	})

	test('accepts zero nonce', () => {
		const result = validateNonce(0, 'test')
		expect(result).toBe(0)
	})

	test('accepts large nonce', () => {
		const result = validateNonce(999999999, 'test')
		expect(result).toBe(999999999)
	})

	test('throws ValidationError for negative nonce', () => {
		expect(() => validateNonce(-1, 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for float nonce', () => {
		expect(() => validateNonce(42.5, 'test')).toThrow(ValidationError)
	})

	test('throws ValidationError for string nonce', () => {
		expect(() => validateNonce('42' as unknown as number, 'test')).toThrow(
			ValidationError
		)
	})

	test('throws ValidationError for null nonce', () => {
		expect(() => validateNonce(null as unknown as number, 'test')).toThrow(
			ValidationError
		)
	})

	test('throws ValidationError for undefined nonce', () => {
		expect(() => validateNonce(undefined as unknown as number, 'test')).toThrow(
			ValidationError
		)
	})
})

describe('validateIntention', () => {
	test('validates legacy format intention with all fields', () => {
		const intention: Intention = {
			text: 'send 100 USDC to bob',
			from: '0xDB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
			to: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
			from_token_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
			to_token_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
			amount_sent: '100.000000',
			amount_received: '100.000000',
			nonce: 1,
		}

		const result = validateIntention(intention)
		expect(result.from).toBe('0xdb473d9716ac61dc4d4aea6e4d691239db84c77d')
		expect(result.to).toBe('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')
		expect(result.nonce).toBe(1)
	})

	test('validates new format intention with inputs/outputs', () => {
		const intention: Intention = {
			text: 'swap 100 USDC for ETH',
			inputs: [
				{
					token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
					amount: '100.000000',
				},
			],
			outputs: [
				{
					vault: '0xDB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
					tokens: [
						{
							token: '0x0000000000000000000000000000000000000000',
							amount: '0.05',
						},
					],
				},
			],
		}

		const result = validateIntention(intention)
		expect(result.inputs).toBeDefined()
		expect(result.outputs).toBeDefined()
		expect(result.inputs![0].token).toBe(
			'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
		)
	})

	test('validates minimal intention with only text', () => {
		const intention: Intention = {
			text: 'send tokens',
		}

		const result = validateIntention(intention)
		expect(result.text).toBe('send tokens')
	})

	test('normalizes all addresses to lowercase', () => {
		const intention: Intention = {
			text: 'test',
			from: '0xDB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
			inputs: [
				{
					token: '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
					amount: '100',
				},
			],
		}

		const result = validateIntention(intention)
		expect(result.from).toBe('0xdb473d9716ac61dc4d4aea6e4d691239db84c77d')
		expect(result.inputs![0].token).toBe(
			'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
		)
	})

	test('throws ValidationError for invalid from address', () => {
		const intention: Intention = {
			text: 'test',
			from: 'invalid',
		}

		expect(() => validateIntention(intention)).toThrow(ValidationError)
	})

	test('throws ValidationError for invalid balance in amount_sent', () => {
		const intention: Intention = {
			text: 'test',
			amount_sent: 'abc',
		}

		expect(() => validateIntention(intention)).toThrow(ValidationError)
	})

	test('throws ValidationError for invalid nonce', () => {
		const intention: Intention = {
			text: 'test',
			nonce: -1,
		}

		expect(() => validateIntention(intention)).toThrow(ValidationError)
	})

	test('validates and normalizes externalAddress in outputs', () => {
		const intention: Intention = {
			text: 'withdraw to external address',
			outputs: [
				{
					externalAddress: '0xDB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
					tokens: [
						{
							token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
							amount: '100',
						},
					],
				},
			],
		}

		const result = validateIntention(intention)
		expect(result.outputs![0].externalAddress).toBe(
			'0xdb473d9716ac61dc4d4aea6e4d691239db84c77d'
		)
	})

	test('throws ValidationError for invalid externalAddress in outputs', () => {
		const intention: Intention = {
			text: 'test',
			outputs: [
				{
					externalAddress: 'invalid',
					tokens: [],
				},
			],
		}

		expect(() => validateIntention(intention)).toThrow(ValidationError)
	})
})

describe('validateBundle', () => {
	test('accepts valid bundle and nonce', () => {
		const bundle = { intentions: [], timestamp: Date.now() }
		const result = validateBundle(bundle, 42)
		expect(result.bundle).toBe(bundle)
		expect(result.nonce).toBe(42)
	})

	test('accepts nonce of zero', () => {
		const bundle = {}
		const result = validateBundle(bundle, 0)
		expect(result.nonce).toBe(0)
	})

	test('throws ValidationError for null bundle', () => {
		expect(() => validateBundle(null, 1)).toThrow(ValidationError)
	})

	test('throws ValidationError for undefined bundle', () => {
		expect(() => validateBundle(undefined, 1)).toThrow(ValidationError)
	})

	test('throws ValidationError for invalid nonce', () => {
		const bundle = {}
		expect(() => validateBundle(bundle, -1)).toThrow(ValidationError)
	})

	test('throws ValidationError for float nonce', () => {
		const bundle = {}
		expect(() => validateBundle(bundle, 1.5)).toThrow(ValidationError)
	})

	test('throws ValidationError for string nonce', () => {
		const bundle = {}
		expect(() => validateBundle(bundle, '42' as unknown as number)).toThrow(
			ValidationError
		)
	})
})

describe('handleValidationError', () => {
	test('handles ValidationError correctly', () => {
		const error = new ValidationError('Invalid address', 'from', '0xinvalid', {
			hint: 'use valid ethereum address',
		})

		const result = handleValidationError(error)

		expect(result.status).toBe(400)
		expect(result.error).toBe('Invalid address')
		expect(result.details).toBeDefined()
		expect(result.details.field).toBe('from')
		expect(result.details.context).toEqual({
			hint: 'use valid ethereum address',
		})
	})

	test('handles generic Error with 500 status', () => {
		const error = new Error('Database connection failed')

		const result = handleValidationError(error)

		expect(result.status).toBe(500)
		expect(result.error).toBe('Database connection failed')
		expect(result.details).toBeUndefined()
	})

	test('handles unknown error type', () => {
		const error = 'string error'

		const result = handleValidationError(error)

		expect(result.status).toBe(500)
		expect(result.error).toBe('Unknown validation error')
	})

	test('handles null error', () => {
		const result = handleValidationError(null)

		expect(result.status).toBe(500)
		expect(result.error).toBe('Unknown validation error')
	})
})
