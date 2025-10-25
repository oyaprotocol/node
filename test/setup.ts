/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Test Setup                                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Global test setup that runs before all tests.
 * Loads test-specific environment variables.
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load test environment variables from test/.env.test
const testEnvPath = resolve(import.meta.dir, '.env.test')
dotenv.config({ path: testEnvPath, override: true })

// Set NODE_ENV before any other imports to ensure test database is used
process.env.NODE_ENV = 'test'

// Update logger min level after environment is loaded
// The logger is initialized at module load time, so we need to update it
import { logger } from '../src/utils/logger.js'
if (process.env.LOG_LEVEL) {
	logger.settings.minLevel = parseInt(process.env.LOG_LEVEL)
}
