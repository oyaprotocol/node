/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                      Node Shutdown Type Definitions                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TypeScript type definitions for node graceful shutdown process.
 * Defines configuration and cleanup handler types.
 *
 * @packageDocumentation
 */

import type { Server } from 'http'
import type { Pool } from 'pg'
import type { DatabaseHealthMonitor } from '../utils/database.js'

/**
 * Configuration for graceful shutdown process.
 * Contains all resources that need to be cleaned up on shutdown.
 */
export interface ShutdownConfig {
	/** Express HTTP server instance */
	server: Server
	/** PostgreSQL connection pool */
	pool: Pool
	/** Database health monitor instance */
	dbHealthMonitor?: DatabaseHealthMonitor
	/** Bundle creation interval timer */
	bundleInterval?: NodeJS.Timeout
	/** Additional cleanup functions to run during shutdown */
	cleanupHandlers?: Array<() => Promise<void> | void>
}
