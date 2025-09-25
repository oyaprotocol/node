/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Environment Configuration Validator                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Validates environment variables at startup to ensure all required
 * configuration is present and valid before the node begins operation.
 *
 * @packageDocumentation
 */

import chalk from 'chalk'
import { logger } from './logger.js'
import { envSchema } from '../config/envSchema.js'
import type { EnvVariable, EnvValidationResult, EnvironmentConfig } from '../types/setup.js'

/**
 * Validates all environment variables against the schema.
 * @returns Validation result containing errors and processed config
 */
export function validateEnv(): EnvValidationResult {
	const errors: EnvValidationResult['errors'] = []
	const config: Record<string, any> = {}

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
				description: envVar.description
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
					description: envVar.description
				})
				logger.error(`✗ ${displayName}: ${validationResult}`)
				continue
			}
		}

		if (value) {
			config[envVar.name] = envVar.transformer ? envVar.transformer(value) : value
			const displayValue = envVar.sensitive
				? '***' + value.slice(-4)
				: (envVar.transformer ? envVar.transformer(value) : value)
			logger.info(`✓ ${displayName}: ${displayValue}`)
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		config
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
		const errorDetails = result.errors.map(error =>
			`  • ${error.variable}:\n    Error: ${error.error}\n    Description: ${error.description}`
		).join('\n\n')

		const errorMessage = `❌ Environment Validation Failed\n${separator}\nFound ${result.errors.length} error(s):\n\n${errorDetails}\n${separator}`;
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
export function setConfigCache(config: EnvironmentConfig): void {
	cachedConfig = config
}

/**
 * Returns the cached environment configuration.
 * Validates as fallback if not already cached (with warning).
 * Exits the process if validation fails.
 * @returns Validated environment configuration
 */
export function getConfig(): EnvironmentConfig {
	// Return cached config if already validated
	if (cachedConfig) {
		return cachedConfig
	}

	// Fallback validation - this shouldn't normally happen
	logger.warn('⚠️  getConfig() called before environment validation completed in index.ts')
	logger.warn('Running fallback validation - this may indicate an initialization order issue')

	const result = validateEnv()
	if (!result.valid) {
		printEnvValidationReport(result)
		process.exit(1)
	}

	cachedConfig = result.config as EnvironmentConfig
	return cachedConfig
}