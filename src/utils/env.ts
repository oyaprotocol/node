/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                     Environment Configuration Utilities                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Provides utilities for validating, caching, and accessing environment
 * configuration. Ensures all required variables are present and valid at
 * startup, with cached access throughout the application lifecycle.
 *
 * @packageDocumentation
 */

import dotenv from 'dotenv'
import { logger, LogLevel } from './logger.js'
import { envSchema } from '../config/envSchema.js'
import type { EnvValidationResult, EnvironmentConfig } from '../types/setup.js'

/**
 * Obfuscates sensitive values based on the current log level.
 * Uses process.env.LOG_LEVEL directly to avoid circular dependency during validation.
 *
 * - SILLY (0): Shows full unobfuscated value
 * - TRACE/DEBUG (1-2): Shows partial obfuscation (last 4 chars)
 * - INFO and above (3+): Shows full obfuscation
 *
 * @param value - The sensitive value to obfuscate
 * @param isSensitive - Whether the value is marked as sensitive
 * @returns The obfuscated or original value based on log level
 * @public
 */
export function obfuscateSensitiveValue(
	value: string,
	isSensitive: boolean
): string {
	if (!isSensitive) {
		return value
	}

	// We use process.env directly here because this runs during env validation,
	// before getEnvConfig() is available
	const logLevel = parseInt(process.env.LOG_LEVEL || String(LogLevel.INFO))

	if (logLevel === LogLevel.SILLY) {
		// SILLY level: show full unobfuscated value for debugging
		return value
	} else if (logLevel <= LogLevel.DEBUG) {
		// TRACE/DEBUG level: partial obfuscation (show last 4 chars)
		return '***' + value.slice(-4)
	} else {
		// INFO and above: full obfuscation for security
		return '********'
	}
}

/**
 * Validates all environment variables against the schema.
 * @returns Validation result containing errors and processed config
 */
export function validateEnv(): EnvValidationResult {
	const errors: EnvValidationResult['errors'] = []
	const config: Record<string, unknown> = {}

	logger.info('🔍 Validating environment configuration...')

	for (const envVar of envSchema) {
		const value = process.env[envVar.name]
		const displayName = envVar.sensitive
			? `${envVar.name} (sensitive)`
			: envVar.name

		if (!value && envVar.required) {
			errors.push({
				variable: envVar.name,
				error: 'Missing required environment variable',
				description: envVar.description,
			})
			logger.error(`✗ ${displayName}: Missing`)
			continue
		}

		if (!value && !envVar.required) {
			config[envVar.name] = envVar.defaultValue
			logger.debug(`○ ${displayName}: Using default (${envVar.defaultValue})`)
			continue
		}

		if (value && envVar.validator) {
			const validationResult = envVar.validator(value)
			if (validationResult !== true) {
				errors.push({
					variable: envVar.name,
					error: validationResult as string,
					description: envVar.description,
				})
				logger.error(`✗ ${displayName}: ${validationResult}`)
				continue
			}
		}

		if (value) {
			config[envVar.name] = envVar.transformer
				? envVar.transformer(value)
				: value

			const transformedValue = envVar.transformer
				? String(envVar.transformer(value))
				: value
			const displayValue = obfuscateSensitiveValue(
				transformedValue,
				envVar.sensitive || false
			)

			logger.info(`✓ ${displayName}: ${displayValue}`)
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		config,
	}
}

/**
 * Prints a formatted validation report to the console.
 * @param result - The validation result to display
 */
export function printEnvValidationReport(result: EnvValidationResult): void {
	const separator = '═'.repeat(60)

	if (result.errors.length > 0) {
		// Build complete error message
		const errorDetails = result.errors
			.map(
				(error) =>
					`  • ${error.variable}:\n    Error: ${error.error}\n    Description: ${error.description}`
			)
			.join('\n\n')

		const errorMessage = `❌ Environment Validation Failed\n${separator}\nFound ${result.errors.length} error(s):\n\n${errorDetails}\n${separator}`
		logger.fatal(errorMessage)

		logger.warn('Please fix the errors above and restart the application.')
	} else {
		const successMessage = `✅ Environment configuration is valid!\n${separator}\nStarting application...`
		logger.info(successMessage)
	}
}

// Cache for validated configuration
let cachedConfig: EnvironmentConfig | null = null

/**
 * Sets the validated configuration cache.
 * Called by index.ts after successful validation.
 * @param config - The validated environment configuration
 */
export function setEnvConfigCache(config: EnvironmentConfig): void {
	cachedConfig = config
}

/**
 * Returns the cached environment configuration.
 * Validates as fallback if not already cached (with warning).
 * Exits the process if validation fails.
 * @returns Validated environment configuration
 */
export function getEnvConfig(): EnvironmentConfig {
	// Return cached config if already validated
	if (cachedConfig) {
		return cachedConfig
	}

	// Fallback validation - this shouldn't normally happen
	logger.warn(
		'⚠️  getEnvConfig() called before environment validation completed in index.ts'
	)
	logger.warn(
		'Running fallback validation - this may indicate an initialization order issue'
	)

	const result = validateEnv()
	if (!result.valid) {
		printEnvValidationReport(result)
		process.exit(1)
	}

	cachedConfig = result.config as unknown as EnvironmentConfig
	return cachedConfig
}

/**
 * Sets up and validates the environment configuration.
 * Loads .env file, validates all required variables, and caches the config.
 * @returns Validated environment configuration
 */
export function setupEnvironment(): EnvironmentConfig {
	// Load environment variables from .env file
	dotenv.config()

	// Validate environment configuration
	const result = validateEnv()
	printEnvValidationReport(result)

	if (!result.valid) {
		process.exit(1)
	}

	// Cache for use throughout application
	setEnvConfigCache(result.config as unknown as EnvironmentConfig)
	return result.config as unknown as EnvironmentConfig
}
