/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                      Diagnostic Logging Middleware                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Middleware for diagnostic logging of HTTP requests and responses.
 * Tracks request metadata, timing, and response status for debugging.
 *
 * @packageDocumentation
 */

import type { Request, Response, NextFunction } from 'express'
import { diagnostic } from '../utils/logger.js'

/**
 * Diagnostic logging middleware for all HTTP requests.
 * Logs request details on receipt and response details on completion.
 */
export function diagnosticLogger(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	const startTime = Date.now()
	const requestId = Math.random().toString(36).substring(7)

	diagnostic.trace('HTTP request received', {
		requestId,
		method: req.method,
		path: req.path,
		query: req.query,
		headers: req.headers,
		bodySize: req.body ? JSON.stringify(req.body).length : 0,
	})

	// Capture response on finish
	res.on('finish', () => {
		diagnostic.debug('HTTP response sent', {
			requestId,
			method: req.method,
			path: req.path,
			statusCode: res.statusCode,
			responseTime: Date.now() - startTime,
		})
	})

	next()
}
