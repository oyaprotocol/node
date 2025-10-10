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
 * - PERMISSIVE: Most lenient tier (300 req/min default)
 * - STANDARD: Moderate tier (100 req/min default)
 * - STRICT: Most restrictive tier (50 req/min default)
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
 * const permissiveTier = rateLimitTiers.permissive
 * console.log(`Max: ${permissiveTier.max}, Window: ${permissiveTier.windowMs}ms`)
 * ```
 *
 * @public
 */
export const rateLimitTiers: Record<
	'permissive' | 'standard' | 'strict',
	RateLimitTierConfig
> = {
	permissive: {
		get max() {
			return getEnvConfig().RATE_LIMIT_PERMISSIVE
		},
		get windowMs() {
			return getEnvConfig().RATE_LIMIT_WINDOW_MS
		},
		description: 'Most lenient tier (300 req/min default)',
	},
	standard: {
		get max() {
			return getEnvConfig().RATE_LIMIT_STANDARD
		},
		get windowMs() {
			return getEnvConfig().RATE_LIMIT_WINDOW_MS
		},
		description: 'Moderate tier (100 req/min default)',
	},
	strict: {
		get max() {
			return getEnvConfig().RATE_LIMIT_STRICT
		},
		get windowMs() {
			return getEnvConfig().RATE_LIMIT_WINDOW_MS
		},
		description: 'Most restrictive tier (50 req/min default)',
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
