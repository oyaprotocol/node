#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         Database Creation Script                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * This script creates the oya_db PostgreSQL database if it doesn't exist.
 * It connects to the 'postgres' default database to create oya_db.
 *
 * Usage:
 *   bun run scripts/create-db.js                    # Creates oya_db using connection from DATABASE_URL
 *   DATABASE_URL=postgres://... bun run scripts/create-db.js  # Override connection string
 */

import dotenv from 'dotenv'
import chalk from 'chalk'
import { createDatabase } from './shared/db-create.js'

// Load environment variables
dotenv.config()

// Parse command line arguments
const args = process.argv.slice(2)
const showHelp = args.includes('--help') || args.includes('-h')

if (showHelp) {
	console.log(`
${chalk.cyan('Oya Node Database Creation Script')}

${chalk.yellow('Usage:')}
  bun run db:create                           # Creates oya_db database
  bun run scripts/create-db.js --help         # Show this help message

${chalk.yellow('Environment:')}
  DATABASE_URL - PostgreSQL connection string (for connection details)

${chalk.yellow('Examples:')}
  # Using .env file (with DATABASE_URL set)
  bun run db:create

  # Override connection
  DATABASE_URL=postgresql://user:pass@localhost:5432/oya_db bun run scripts/create-db.js

${chalk.yellow('Note:')} This script will always create a database named 'oya_db'.
`)
	process.exit(0)
}

// Fixed database name for Oya
const DB_NAME = 'oya_db'

// Run creation
createDatabase({
	dbName: DB_NAME,
	connectionString: process.env.DATABASE_URL,
	environment: 'production',
	nextStepCommand: 'bun run db:setup'
}).catch(error => {
	console.error(chalk.red('Unexpected error:'), error)
	process.exit(1)
})