/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       POST Method Auth Middleware                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Middleware to protect all POST endpoints with Bearer token authorization.
 * Automatically applies authentication to state-modifying requests.
 *
 * @packageDocumentation
 */

import type { Request, Response, NextFunction } from 'express'
import { bearerAuth } from '../auth.js'

/**
 * Global middleware to protect all POST endpoints with Bearer token authorization.
 * Ensures that only authenticated requests can modify state.
 */
export function protectPostEndpoints(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	if (req.method === 'POST') {
		bearerAuth(req, res, next)
	} else {
		next()
	}
}
