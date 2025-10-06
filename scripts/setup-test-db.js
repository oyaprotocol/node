#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Test Database Setup Script                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * This script creates all necessary database tables for testing.
 * It can be run safely multiple times as it uses IF NOT EXISTS clauses.
 *
 * Usage:
 *   bun run scripts/setup-test-db.js                    # Uses TEST_DATABASE_URL from .env
 *   TEST_DATABASE_URL=postgres://... bun run scripts/setup-test-db.js  # Override connection string
 *   bun run scripts/setup-test-db.js --drop-existing    # Drop and recreate all tables (DESTRUCTIVE!)
 */

import dotenv from 'dotenv'
import chalk from 'chalk'
import { setupDatabase } from './shared/db-setup.js'

// Load environment variables
dotenv.config()

// Parse command line arguments
const args = process.argv.slice(2)
const shouldDropExisting = args.includes('--drop-existing')
const showHelp = args.includes('--help') || args.includes('-h')

if (showHelp) {
	console.log(`
${chalk.cyan('Oya Node Test Database Setup Script')}

${chalk.yellow('Usage:')}
  bun run db:test:setup                       # Uses TEST_DATABASE_URL from .env
  bun run db:test:reset                       # Drop and recreate all tables (DESTRUCTIVE!)
  bun run scripts/setup-test-db.js --help     # Show this help message

${chalk.yellow('Direct usage:')}
  bun run scripts/setup-test-db.js                 # Uses TEST_DATABASE_URL from .env
  TEST_DATABASE_URL=postgres://... bun run scripts/setup-test-db.js  # Override connection string
  bun run scripts/setup-test-db.js --drop-existing # Drop and recreate all tables

${chalk.yellow('Required Environment:')}
  TEST_DATABASE_URL - PostgreSQL connection string for test database

${chalk.yellow('Environment Variables (optional):')}
  TEST_DATABASE_URL - Defaults to DATABASE_URL with '_test' appended to db name
  DATABASE_SSL      - Enable/disable SSL (default: false for tests)

${chalk.yellow('Tables Created:')}
  - bundles   : Stores bundle data with IPFS CIDs
  - cids      : Tracks submitted CIDs
  - balances  : Manages vault token balances
  - nonces    : Tracks vault nonces
  - proposers : Records block proposers

${chalk.red('Warning:')} Using --drop-existing will DELETE ALL EXISTING DATA!
`)
	process.exit(0)
}

// Get test database URL
let testDatabaseUrl = process.env.TEST_DATABASE_URL

// If not set, try to derive from DATABASE_URL
if (!testDatabaseUrl && process.env.DATABASE_URL) {
	const prodUrl = process.env.DATABASE_URL
	// Replace database name with _test suffix
	testDatabaseUrl = prodUrl.replace(/\/([^/]+)(\?|$)/, '/$1_test$2')
	console.log(chalk.yellow(`ℹ️  TEST_DATABASE_URL not set, using derived URL from DATABASE_URL`))
}

if (!testDatabaseUrl) {
	console.error(
		chalk.red('❌ Error: TEST_DATABASE_URL environment variable is not set')
	)
	console.log(
		chalk.yellow('Please set TEST_DATABASE_URL in your .env file or environment')
	)
	console.log(
		chalk.gray('Example: TEST_DATABASE_URL=postgresql://user:password@localhost:5432/oya_db_test')
	)
	console.log(
		chalk.gray('Or set DATABASE_URL and it will automatically append _test to the database name')
	)
	process.exit(1)
}

// Determine SSL setting (default to false for test databases)
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

// Run setup
setupDatabase({
	connectionString: testDatabaseUrl,
	ssl: DATABASE_SSL,
	dropExisting: shouldDropExisting,
	forceDropConfirm: process.env.FORCE_DROP === 'true',
	environment: 'test'
}).catch(error => {
	console.error(chalk.red('Unexpected error:'), error)
	process.exit(1)
})
