/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Environment Utility Tests                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Tests for environment configuration utilities, focusing on sensitive
 * value obfuscation based on log levels.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { obfuscateSensitiveValue } from '../src/utils/env.js'

describe('Environment Utilities', () => {
	// Store original LOG_LEVEL to restore after tests
	let originalLogLevel: string | undefined

	beforeEach(() => {
		originalLogLevel = process.env.LOG_LEVEL
	})

	afterEach(() => {
		// Restore original LOG_LEVEL
		if (originalLogLevel === undefined) {
			delete process.env.LOG_LEVEL
		} else {
			process.env.LOG_LEVEL = originalLogLevel
		}
	})

	describe('obfuscateSensitiveValue', () => {
		const testValue = 'my-secret-api-key-1234'

		describe('Non-sensitive values', () => {
			test('should return value unchanged when not sensitive', () => {
				process.env.LOG_LEVEL = '3' // INFO level

				const result = obfuscateSensitiveValue(testValue, false)

				expect(result).toBe(testValue)
			})

			test('should return value unchanged regardless of log level', () => {
				// Test at different log levels
				const logLevels = ['0', '1', '2', '3', '4', '5', '6']

				for (const level of logLevels) {
					process.env.LOG_LEVEL = level
					const result = obfuscateSensitiveValue(testValue, false)
					expect(result).toBe(testValue)
				}
			})
		})

		describe('Sensitive values - SILLY level (0)', () => {
			test('should show full value at SILLY level', () => {
				process.env.LOG_LEVEL = '0'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe(testValue)
			})
		})

		describe('Sensitive values - TRACE level (1)', () => {
			test('should show partial obfuscation at TRACE level', () => {
				process.env.LOG_LEVEL = '1'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('***1234')
			})

			test('should show last 4 characters', () => {
				process.env.LOG_LEVEL = '1'

				const testCases = [
					{ input: 'abcdefgh', expected: '***efgh' },
					{ input: '12345678', expected: '***5678' },
					{ input: 'short', expected: '***hort' },
					{ input: 'abc', expected: '***abc' }, // Shorter than 4 chars
				]

				for (const { input, expected } of testCases) {
					const result = obfuscateSensitiveValue(input, true)
					expect(result).toBe(expected)
				}
			})
		})

		describe('Sensitive values - DEBUG level (2)', () => {
			test('should show partial obfuscation at DEBUG level', () => {
				process.env.LOG_LEVEL = '2'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('***1234')
			})
		})

		describe('Sensitive values - INFO level (3) and above', () => {
			test('should fully obfuscate at INFO level', () => {
				process.env.LOG_LEVEL = '3'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('********')
			})

			test('should fully obfuscate at WARN level', () => {
				process.env.LOG_LEVEL = '4'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('********')
			})

			test('should fully obfuscate at ERROR level', () => {
				process.env.LOG_LEVEL = '5'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('********')
			})

			test('should fully obfuscate at FATAL level', () => {
				process.env.LOG_LEVEL = '6'

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('********')
			})
		})

		describe('Default behavior (no LOG_LEVEL set)', () => {
			test('should default to INFO level (full obfuscation)', () => {
				delete process.env.LOG_LEVEL

				const result = obfuscateSensitiveValue(testValue, true)

				expect(result).toBe('********')
			})
		})

		describe('Edge cases', () => {
			test('should handle empty string', () => {
				process.env.LOG_LEVEL = '1'

				const result = obfuscateSensitiveValue('', true)

				expect(result).toBe('***')
			})

			test('should handle single character', () => {
				process.env.LOG_LEVEL = '1'

				const result = obfuscateSensitiveValue('x', true)

				expect(result).toBe('***x')
			})

			test('should handle very long values at TRACE level', () => {
				process.env.LOG_LEVEL = '1'
				const longValue = 'a'.repeat(1000) + 'test'

				const result = obfuscateSensitiveValue(longValue, true)

				expect(result).toBe('***test')
			})

			test('should handle invalid LOG_LEVEL gracefully', () => {
				process.env.LOG_LEVEL = 'invalid'

				// parseInt('invalid') returns NaN, which should default to INFO behavior
				const result = obfuscateSensitiveValue(testValue, true)

				// NaN comparisons are always false, so it goes to full obfuscation
				expect(result).toBe('********')
			})

			test('should handle negative LOG_LEVEL', () => {
				process.env.LOG_LEVEL = '-1'

				const result = obfuscateSensitiveValue(testValue, true)

				// -1 <= 2 (DEBUG) is true, so partial obfuscation
				expect(result).toBe('***1234')
			})

			test('should handle very high LOG_LEVEL', () => {
				process.env.LOG_LEVEL = '999'

				const result = obfuscateSensitiveValue(testValue, true)

				// 999 > 2, so full obfuscation
				expect(result).toBe('********')
			})
		})

		describe('Security - ensuring no leaks', () => {
			test('should never show sensitive values in production (INFO+)', () => {
				const sensitiveValues = [
					'0x1234567890abcdef',
					'sk-1234567890abcdef',
					'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
					'postgres://user:password@localhost:5432/db',
				]

				const productionLevels = ['3', '4', '5', '6']

				for (const level of productionLevels) {
					process.env.LOG_LEVEL = level

					for (const secret of sensitiveValues) {
						const result = obfuscateSensitiveValue(secret, true)
						expect(result).toBe('********')
						expect(result).not.toContain(secret)
					}
				}
			})

			test('should not leak sensitive data in partial obfuscation', () => {
				process.env.LOG_LEVEL = '1' // TRACE

				const privateKey = '0x1234567890abcdef1234567890abcdef12345678'
				const result = obfuscateSensitiveValue(privateKey, true)

				// Should only show last 4 chars
				expect(result).toBe('***5678')
				expect(result.length).toBe(7) // *** + 4 chars
				expect(result).not.toContain('1234567890abcdef')
			})
		})
	})
})
