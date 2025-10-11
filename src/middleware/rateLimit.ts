/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                        Rate Limiting Middleware                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Express middleware for rate limiting API requests using PostgreSQL storage.
 * Provides tiered rate limiting (permissive/standard/strict) with dual-key strategy
 * (IP address + Bearer token) for layered protection.
 *
 * Features:
 * - PostgreSQL-backed storage for persistence across restarts
 * - Dual-key rate limiting: IP-based AND token-based
 * - Configurable tiers: permissive, standard, strict
 * - Standards-compliant headers (X-RateLimit-*)
 * - Global enable/disable via environment variable
 *
 * @packageDocumentation
 */

import rateLimit, {
	type RateLimitRequestHandler,
	ipKeyGenerator,
} from 'express-rate-limit'
import { PostgresStore } from '@acpr/rate-limit-postgresql'
import type { Request } from 'express'
import { getEnvConfig } from '../utils/env.js'
import { logger } from '../utils/logger.js'

/**
 * Rate limit tier definitions
 * @public
 */
export type RateLimitTier = 'permissive' | 'standard' | 'strict'

/**
 * Custom rate limit configuration
 * @public
 */
export interface CustomRateLimitConfig {
	max: number
	windowMs: number
}

/**
 * Generates a unique rate limit key based on both IP address and Bearer token.
 * This provides layered protection:
 * - IP-based limiting prevents broad abuse
 * - Token-based limiting prevents per-user abuse
 *
 * Uses express-rate-limit's ipKeyGenerator helper to handle IPv6 addresses correctly.
 *
 * @param req - Express request object
 * @returns Unique key for rate limiting
 * @internal
 */
function generateRateLimitKey(req: Request): string {
	const authHeader = req.headers.authorization

	// If Bearer token exists, use it for per-user rate limiting
	if (authHeader && typeof authHeader === 'string') {
		const [scheme, token] = authHeader.split(' ')
		if (scheme === 'Bearer' && token) {
			// Rate limit by token (per-user)
			return `token:${token.substring(0, 16)}` // Use first 16 chars to avoid huge keys
		}
	}

	// Fallback to IP-based rate limiting using IPv6-safe helper
	const ip = req.ip || req.socket.remoteAddress || 'unknown'
	return `ip:${ipKeyGenerator(String(ip))}`
}

/**
 * Creates a rate limiter middleware with specified configuration.
 *
 * @param tierOrConfig - Rate limit tier ('permissive', 'standard', 'strict') or custom config
 * @returns Express rate limit middleware
 *
 * @example
 * ```typescript
 * // Use predefined tier
 * app.use(createRateLimiter('permissive'))
 *
 * // Use custom config
 * app.use(createRateLimiter({ max: 50, windowMs: 30000 }))
 * ```
 *
 * @public
 */
export function createRateLimiter(
	tierOrConfig?: RateLimitTier | CustomRateLimitConfig
): RateLimitRequestHandler {
	const config = getEnvConfig()

	// If rate limiting is disabled, return a no-op middleware
	if (!config.RATE_LIMIT_ENABLED) {
		logger.info('⚠️  Rate limiting is disabled (RATE_LIMIT_ENABLED=false)')
		return ((req, res, next) => next()) as RateLimitRequestHandler
	}

	// Determine rate limit configuration
	let max: number
	let windowMs: number

	if (!tierOrConfig) {
		// Default: use 'permissive' tier
		max = config.RATE_LIMIT_PERMISSIVE
		windowMs = config.RATE_LIMIT_WINDOW_MS
	} else if (typeof tierOrConfig === 'string') {
		// Tier-based configuration
		switch (tierOrConfig) {
			case 'permissive':
				max = config.RATE_LIMIT_PERMISSIVE
				break
			case 'standard':
				max = config.RATE_LIMIT_STANDARD
				break
			case 'strict':
				max = config.RATE_LIMIT_STRICT
				break
		}
		windowMs = config.RATE_LIMIT_WINDOW_MS
	} else {
		// Custom configuration
		max = tierOrConfig.max
		windowMs = tierOrConfig.windowMs
	}

	logger.debug(`Rate limiter created: ${max} requests per ${windowMs}ms`, {
		tier: typeof tierOrConfig === 'string' ? tierOrConfig : 'custom',
		max,
		windowMs,
	})

	return rateLimit({
		windowMs,
		max,
		standardHeaders: true, // Return rate limit info in RateLimit-* headers
		legacyHeaders: false, // Disable X-RateLimit-* headers (use standardHeaders instead)
		store: new PostgresStore(
			{ connectionString: config.DATABASE_URL },
			'oya-rate-limit' // session prefix
		),
		keyGenerator: generateRateLimitKey,
		handler: (req, res) => {
			logger.warn('Rate limit exceeded', {
				key: generateRateLimitKey(req),
				path: req.path,
				method: req.method,
			})
			res.status(429).json({
				error: 'Too many requests',
				message: 'Rate limit exceeded. Please try again later.',
				retryAfter: Math.ceil(windowMs / 1000), // seconds
			})
		},
	})
}
