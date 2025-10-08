/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                           Logger Utility                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Centralized logging utility providing structured output with tslog.
 *
 * - Main logger: Branded console output controlled by LOG_LEVEL
 * - Diagnostic logger: JSON output with source locations via DIAGNOSTIC_LOGGER
 * - Child loggers: Module-specific loggers with name prefixes
 *
 * @packageDocumentation
 */

import { Logger, ILogObj } from 'tslog'
import type { RouteMount, RouterLayer } from '../types/routes.js'

/**
 * Base log template used by all loggers
 * @internal
 */
const BASE_LOG_TEMPLATE =
	'\x1b[35m[\x1b[1mOYA NODE 🌪️ \x1b[22m]\x1b[0m [{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}] [{{logLevelName}}] '

/**
 * Main application logger instance
 *
 * Provides structured logging with branded output format.
 * Log level controlled by LOG_LEVEL environment variable.
 *
 * @example
 * ```typescript
 * logger.info('Block created', { blockNumber: 123 })
 * // Output: [OYA NODE 🌪️] [2024-09-24 15:30:45] [INFO] Block created { blockNumber: 123 }
 * ```
 *
 * @public
 */
export const logger = new Logger<ILogObj>({
	type: 'pretty',
	prettyLogTemplate: BASE_LOG_TEMPLATE,
	minLevel: parseInt(process.env.LOG_LEVEL || '3'), // 0=silly, 1=trace, 2=debug, 3=info, 4=warn, 5=error, 6=fatal
	hideLogPositionForProduction: true,
	stylePrettyLogs: true,
	prettyLogTimeZone: 'UTC',
	prettyErrorTemplate: '\n{{errorName}} {{errorMessage}}\n{{errorStack}}',
	prettyErrorStackTemplate:
		'  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}',
	prettyErrorParentNamesSeparator: ' → ',
	prettyLogStyles: {
		logLevelName: {
			'*': ['bold', 'dim'],
			ERROR: ['bold', 'red'],
			WARN: ['bold', 'yellow'],
			INFO: ['bold', 'green'],
			DEBUG: ['bold', 'blue'],
			TRACE: ['bold', 'magenta'],
			FATAL: ['bold', 'bgRed', 'white'],
		},
	},
})

/**
 * Check if debug mode is enabled
 *
 * @internal
 */
const diagnosticEnabled = process.env.DIAGNOSTIC_LOGGER === 'true'

/**
 * Diagnostic logger for detailed output
 *
 * Outputs detailed JSON logs with source locations when DIAGNOSTIC_LOGGER
 * environment variable is set to 'true'. When disabled, all methods are no-ops
 * for zero performance overhead.
 *
 * @example
 * ```typescript
 * // Enable with: DIAGNOSTIC_LOGGER=true
 * diagnostic.trace('Entering processIntentions', { cache: intentionCache })
 * diagnostic.debug('Signature verification', { address, signature })
 * // Output (JSON): {"_meta": {"date": "...", "path": {...}}, "msg": "...", ...}
 * ```
 *
 * @public
 */
export const diagnostic = diagnosticEnabled
	? new Logger<ILogObj>({
			name: 'DIAGNOSTIC',
			type: 'json',
			minLevel: 0, // Show all levels
			hideLogPositionForProduction: false, // Always show source locations
			prettyInspectOptions: {
				depth: null, // Unlimited object inspection depth
				colors: false,
			},
		})
	: ({
			silly: () => {},
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
			fatal: () => {},
		} as Logger<ILogObj>)

/**
 * Create a child logger with additional context
 *
 * Creates a sub-logger that inherits configuration from the main logger
 * but includes additional contextual information in every log message.
 *
 * @param name - Name for the child logger (e.g., 'Proposer', 'Controller')
 * @param metadata - Optional metadata to include with every log
 * @returns Child logger instance
 *
 * @example
 * ```typescript
 * const proposerLogger = createLogger('Proposer', { nodeId: '0x123...' })
 * proposerLogger.info('Block submitted')
 * // Output: [OYA NODE 🌪️] [2024-09-24 15:30:45] [INFO] [Proposer] Block submitted
 * ```
 *
 * @public
 */
export function createLogger(
	name: string,
	metadata?: Record<string, unknown>
): Logger<ILogObj> {
	const childLogger = logger.getSubLogger({
		name,
		...(metadata && { defaultMeta: metadata }),
	})

	// Override the template to include the child name
	childLogger.settings.prettyLogTemplate = BASE_LOG_TEMPLATE + '[' + name + '] '

	return childLogger
}

/**
 * Log level enum for reference
 *
 * @public
 */
export enum LogLevel {
	SILLY = 0,
	TRACE = 1,
	DEBUG = 2,
	INFO = 3,
	WARN = 4,
	ERROR = 5,
	FATAL = 6,
}

/**
 * Log all available API endpoints
 *
 * Extracts and displays all registered routes with their HTTP methods
 * and protection status. Only runs when LOG_LEVEL is DEBUG (2) or lower.
 *
 * Note: Protection detection is currently hardcoded to assume all POST
 * endpoints are protected by bearer auth (matching the global middleware
 * in index.ts). If auth strategy changes, update the protection logic here.
 *
 * @param mounts - Array of route mount configurations
 *
 * @example
 * ```typescript
 * logAvailableEndpoints(routeMounts)
 * ```
 *
 * @public
 */
export function logAvailableEndpoints(mounts: RouteMount[]): void {
	const logLevel = parseInt(process.env.LOG_LEVEL || '3')

	// Only log in debug mode (2) or lower
	if (logLevel > 2) return

	const endpoints: Array<{
		method: string
		path: string
		protected: boolean
	}> = []

	// Extract all routes from mounted routers
	for (const { basePath, router } of mounts) {
		const stack = (router as { stack?: RouterLayer[] }).stack
		stack?.forEach((layer) => {
			if (layer.route) {
				const route = layer.route
				const methods = Object.keys(route.methods)
				methods.forEach((method) => {
					endpoints.push({
						method: method.toUpperCase(),
						path: basePath + route.path,
						// HARDCODED: Assumes all POST endpoints are protected
						// This matches the global middleware in index.ts that applies
						// bearerAuth to all POST requests. Update if auth strategy changes.
						protected: method.toUpperCase() === 'POST',
					})
				})
			}
		})
	}

	// Sort endpoints by path, then by method
	endpoints.sort((a, b) => {
		const pathCompare = a.path.localeCompare(b.path)
		return pathCompare !== 0 ? pathCompare : a.method.localeCompare(b.method)
	})

	endpoints.forEach(({ method, path, protected: isProtected }) => {
		const protection = isProtected ? ' 🔒 (protected)' : ''
		logger.debug(
			`☑️ Registered endpoint: ${method.padEnd(6)} ${path}${protection}`
		)
	})
}
