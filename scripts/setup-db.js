#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Database Setup Script                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * This script creates all necessary database tables for the Oya node.
 * It can be run safely multiple times as it uses IF NOT EXISTS clauses.
 *
 * Usage:
 *   bun run scripts/setup-db.js                    # Uses DATABASE_URL from .env
 *   DATABASE_URL=postgres://... bun run scripts/setup-db.js  # Override connection string
 *   bun run scripts/setup-db.js --drop-existing    # Drop and recreate all tables (DESTRUCTIVE!)
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
${chalk.cyan('Oya Node Database Setup Script')}

${chalk.yellow('Usage:')}
  bun run db:setup                            # Uses DATABASE_URL from .env
  bun run db:reset                            # Drop and recreate all tables (DESTRUCTIVE!)
  bun run scripts/setup-db.js --help          # Show this help message

${chalk.yellow('Direct usage:')}
  bun run scripts/setup-db.js                 # Uses DATABASE_URL from .env
  DATABASE_URL=postgres://... bun run scripts/setup-db.js  # Override connection string
  bun run scripts/setup-db.js --drop-existing # Drop and recreate all tables

${chalk.yellow('Required Environment:')}
  DATABASE_URL - PostgreSQL connection string

${chalk.yellow('Environment Variables (optional):')}
  DATABASE_SSL - Enable/disable SSL (default: true for production)

${chalk.yellow('Tables Created:')}
  - bundles   : Stores bundle data with IPFS CIDs
  - cids      : Tracks submitted CIDs
  - balances  : Manages vault token balances
  - proposers : Records block proposers
  - vaults    : Maps vault IDs to controllers and rules; stores nonce

${chalk.red('Warning:')} Using --drop-existing will DELETE ALL EXISTING DATA!
`)
	process.exit(0)
}

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
	console.error(
		chalk.red('❌ Error: DATABASE_URL environment variable is not set')
	)
	console.log(
		chalk.yellow('Please set DATABASE_URL in your .env file or environment')
	)
	console.log(
		chalk.gray('Example: DATABASE_URL=postgresql://user:password@localhost:5432/oya_db')
	)
	process.exit(1)
}

// Determine SSL setting (default to true for production)
const DATABASE_SSL = process.env.DATABASE_SSL !== 'false'

// Run setup
setupDatabase({
	connectionString: process.env.DATABASE_URL,
	ssl: DATABASE_SSL,
	dropExisting: shouldDropExisting,
	forceDropConfirm: process.env.FORCE_DROP === 'true',
	environment: 'production'
}).catch(error => {
	console.error(chalk.red('Unexpected error:'), error)
	process.exit(1)
})