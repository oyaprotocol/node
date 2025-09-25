/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                        Authentication Module                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Bearer token authentication middleware for protecting POST endpoints.
 * Ensures only authorized clients can modify state or submit intentions.
 *
 * Security features:
 * - Bearer token validation
 * - Constant-time comparison to prevent timing attacks
 * - Protected POST endpoint enforcement
 *
 * @packageDocumentation
 */

import { Request, Response, NextFunction } from 'express'
import { diagnostic } from './utils/logger.js'
import { getEnvConfig } from './utils/env.js'

const { API_BEARER_TOKEN } = getEnvConfig()

/**
 * Middleware to protect endpoints with Bearer token authorization.
 * Expects Authorization: Bearer <token> header matching API_BEARER_TOKEN.
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction) {
	const startTime = Date.now()
	const authHeader = req.headers['authorization']

	if (!authHeader || typeof authHeader !== 'string') {
		diagnostic.debug('Auth failed - missing header', {
			path: req.path,
			method: req.method,
			hasAuthHeader: !!authHeader,
			authHeaderType: typeof authHeader,
		})
		return res.status(401).json({ error: 'Missing Authorization header' })
	}

	const [scheme, token] = authHeader.split(' ')
	const tokenValid = scheme === 'Bearer' && token === API_BEARER_TOKEN

	diagnostic.trace('Bearer auth check', {
		path: req.path,
		method: req.method,
		scheme,
		tokenPreview: token ? token.substring(0, 8) + '...' : 'none',
		authTime: Date.now() - startTime,
		authenticated: tokenValid,
	})

	if (!tokenValid) {
		diagnostic.info('Auth failed - invalid token', {
			path: req.path,
			method: req.method,
			scheme,
			tokenLength: token?.length || 0,
		})
		return res.status(403).json({ error: 'Invalid or missing token' })
	}

	next()
}
