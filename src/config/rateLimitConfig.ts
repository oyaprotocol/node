/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                     Rate Limiting Configuration                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Defines rate limiting tiers and their configurations.
 * Configuration values are sourced from environment variables with sensible defaults.
 *
 * Tiers:
 * - READ: High-volume read operations (GET requests)
 * - WRITE: Moderate write operations (POST requests)
 * - CRITICAL: Low-volume critical operations (e.g., intention submission)
 *
 * @packageDocumentation
 */

import { getEnvConfig } from '../utils/env.js'

/**
 * Rate limit tier configuration interface
 * @public
 */
export interface RateLimitTierConfig {
	/** Maximum number of requests allowed per window */
	max: number
	/** Time window in milliseconds */
	windowMs: number
	/** Human-readable description */
	description: string
}

/**
 * All available rate limit tiers with their configurations.
 * Values are loaded from environment variables at runtime.
 *
 * @example
 * ```typescript
 * const readTier = rateLimitTiers.read
 * console.log(`Max: ${readTier.max}, Window: ${readTier.windowMs}ms`)
 * ```
 *
 * @public
 */
export const rateLimitTiers: Record<
	'read' | 'write' | 'critical',
	RateLimitTierConfig
> = {
	read: {
		get max() {
			return getEnvConfig().RATE_LIMIT_MAX_READ
		},
		get windowMs() {
			return getEnvConfig().RATE_LIMIT_WINDOW_MS
		},
		description: 'High-volume read operations (GET requests)',
	},
	write: {
		get max() {
			return getEnvConfig().RATE_LIMIT_MAX_WRITE
		},
		get windowMs() {
			return getEnvConfig().RATE_LIMIT_WINDOW_MS
		},
		description: 'Moderate write operations (POST requests)',
	},
	critical: {
		get max() {
			return getEnvConfig().RATE_LIMIT_MAX_CRITICAL
		},
		get windowMs() {
			return getEnvConfig().RATE_LIMIT_WINDOW_MS
		},
		description: 'Low-volume critical operations (intention submission)',
	},
}

/**
 * Logs the current rate limit configuration for debugging.
 * Only logs when LOG_LEVEL is DEBUG (2) or lower.
 *
 * @public
 */
export function logRateLimitConfig(): void {
	const { LOG_LEVEL } = getEnvConfig()
	if (LOG_LEVEL > 2) return

	console.log('Rate Limit Configuration:')
	for (const [tier, config] of Object.entries(rateLimitTiers)) {
		console.log(
			`  ${tier.toUpperCase().padEnd(10)}: ${config.max} req / ${config.windowMs}ms - ${config.description}`
		)
	}
}
