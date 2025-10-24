/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                     Filecoin Pin Configuration                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Configuration utilities for Filecoin Pin integration.
 * Handles Synapse SDK setup and logger bridging.
 *
 * @packageDocumentation
 */

import type { SynapseSetupConfig } from 'filecoin-pin/core/synapse'
import pino from 'pino'
import { getEnvConfig } from '../utils/env.js'
import { createLogger } from '../utils/logger.js'

/**
 * Create a Pino logger that bridges to our tslog logger.
 * Uses Pino's custom destination stream for proper integration.
 */
export function createFilecoinPinLogger() {
	const oyaLogger = createLogger('FilecoinPin')

	// Create a custom destination that writes to our logger
	const destination = {
		write(msg: string) {
			try {
				const logObject = JSON.parse(msg)
				const level = logObject.level
				const message = logObject.msg || ''
				const data = { ...logObject }
				delete data.level
				delete data.msg
				delete data.time
				delete data.pid
				delete data.hostname

				// Map Pino log levels to tslog methods
				// Pino levels: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
				if (level >= 50) {
					// error (50), fatal (60)
					oyaLogger.error(message, data)
				} else if (level >= 40) {
					// warn (40)
					oyaLogger.warn(message, data)
				} else if (level >= 30) {
					// info (30)
					oyaLogger.info(message, data)
				} else if (level >= 20) {
					// debug (20)
					oyaLogger.debug(message, data)
				} else {
					// trace (10)
					oyaLogger.trace(message, data)
				}
			} catch {
				// Fallback if JSON parsing fails
				oyaLogger.debug(msg)
			}
		},
	}

	return pino(
		{
			level: 'debug',
		},
		destination
	)
}

/**
 * Get Filecoin Pin configuration from environment.
 * Returns null if Filecoin pinning is not enabled.
 */
export function getFilecoinPinConfig(): SynapseSetupConfig | null {
	const env = getEnvConfig()

	// Return null if Filecoin pinning is disabled
	if (!env.FILECOIN_PIN_ENABLED) {
		return null
	}

	// Validate that private key is set if pinning is enabled
	if (!env.FILECOIN_PIN_PRIVATE_KEY) {
		throw new Error(
			'FILECOIN_PIN_PRIVATE_KEY is required when FILECOIN_PIN_ENABLED=true'
		)
	}

	return {
		privateKey: env.FILECOIN_PIN_PRIVATE_KEY,
		rpcUrl: env.FILECOIN_PIN_RPC_URL,
	}
}

/**
 * Check if Filecoin pinning is enabled in the current configuration.
 */
export function isFilecoinPinEnabled(): boolean {
	const env = getEnvConfig()
	return env.FILECOIN_PIN_ENABLED
}
