/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Graceful Shutdown Utility                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Handles graceful shutdown of the application, ensuring all resources
 * are properly cleaned up before process termination.
 *
 * @packageDocumentation
 */

import { logger } from './logger.js'
import type { ShutdownConfig } from '../types/shutdown.js'

/**
 * Performs graceful shutdown of all application resources.
 * Stops accepting new connections, cleans up resources, and exits cleanly.
 *
 * @param signal - The signal that triggered the shutdown
 * @param config - Configuration containing resources to clean up
 */
export async function gracefulShutdown(
	signal: string,
	config: ShutdownConfig
): Promise<void> {
	logger.info(`Received ${signal} signal, starting graceful shutdown...`)

	// Stop accepting new connections
	await new Promise<void>((resolve) => {
		config.server.close(() => {
			logger.info('HTTP server closed')
			resolve()
		})
	})

	// Stop bundle creation if configured
	if (config.bundleInterval) {
		clearInterval(config.bundleInterval)
		logger.info('Bundle creation stopped')
	}

	// Stop database health monitoring
	if (config.dbHealthMonitor) {
		config.dbHealthMonitor.stop()
		logger.info('Database health monitoring stopped')
	}

	// Run additional cleanup handlers
	if (config.cleanupHandlers) {
		for (const handler of config.cleanupHandlers) {
			try {
				await handler()
			} catch (error) {
				logger.error('Error in cleanup handler:', error)
			}
		}
	}

	// Close database pool
	try {
		await config.pool.end()
		logger.info('Database connections closed')
	} catch (error) {
		logger.error('Error closing database connections:', error)
	}

	logger.info('Graceful shutdown completed')
	process.exit(0)
}

/**
 * Registers process signal handlers for graceful shutdown.
 * Sets up handlers for SIGTERM and SIGINT signals.
 *
 * @param config - Configuration containing resources to clean up
 */
export function registerShutdownHandlers(config: ShutdownConfig): void {
	process.on('SIGTERM', () => gracefulShutdown('SIGTERM', config))
	process.on('SIGINT', () => gracefulShutdown('SIGINT', config))
	logger.debug('Shutdown handlers registered')
}
