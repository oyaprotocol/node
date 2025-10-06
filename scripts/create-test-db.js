#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Test Database Creation Script                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * This script creates the test PostgreSQL database if it doesn't exist.
 * It connects to the 'postgres' default database to create the test database.
 *
 * Usage:
 *   bun run scripts/create-test-db.js                    # Creates test database using connection from TEST_DATABASE_URL or DATABASE_URL
 *   TEST_DATABASE_URL=postgres://... bun run scripts/create-test-db.js  # Override connection string
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
${chalk.cyan('Oya Node Test Database Creation Script')}

${chalk.yellow('Usage:')}
  bun run db:test:create                      # Creates test database
  bun run scripts/create-test-db.js --help    # Show this help message

${chalk.yellow('Environment:')}
  TEST_DATABASE_URL - PostgreSQL connection string for test database (optional)
  DATABASE_URL      - Used to derive test database if TEST_DATABASE_URL not set

${chalk.yellow('Examples:')}
  # Using .env file (with TEST_DATABASE_URL or DATABASE_URL set)
  bun run db:test:create

  # Override connection
  TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/oya_db_test bun run scripts/create-test-db.js

${chalk.yellow('Note:')} If TEST_DATABASE_URL is not set, this script will derive it from DATABASE_URL
by appending '_test' to the database name.
`)
	process.exit(0)
}

/**
 * Get test database connection string and name
 */
function getTestDatabaseConfig() {
	let testDatabaseUrl = process.env.TEST_DATABASE_URL

	// If not set, try to derive from DATABASE_URL
	if (!testDatabaseUrl && process.env.DATABASE_URL) {
		const prodUrl = process.env.DATABASE_URL
		// Replace database name with _test suffix
		testDatabaseUrl = prodUrl.replace(/\/([^/]+)(\?|$)/, '/$1_test$2')
		console.log(chalk.yellow(`ℹ️  TEST_DATABASE_URL not set, derived from DATABASE_URL`))
	}

	if (!testDatabaseUrl) {
		console.error(chalk.red('❌ Error: Neither TEST_DATABASE_URL nor DATABASE_URL is set'))
		console.log(chalk.yellow('Please set one of these in your .env file'))
		console.log(chalk.gray('Example: TEST_DATABASE_URL=postgresql://user:password@localhost:5432/oya_db_test'))
		process.exit(1)
	}

	// Extract database name from URL
	try {
		const url = new URL(testDatabaseUrl)
		const dbName = url.pathname.substring(1) // Remove leading '/'
		return { connectionString: testDatabaseUrl, dbName }
	} catch (e) {
		console.error(chalk.red('Error parsing connection URL:'), e.message)
		process.exit(1)
	}
}

// Get test database configuration
const { connectionString, dbName } = getTestDatabaseConfig()

// Run creation
createDatabase({
	dbName,
	connectionString,
	environment: 'test',
	nextStepCommand: 'bun run db:test:setup'
}).catch(error => {
	console.error(chalk.red('Unexpected error:'), error)
	process.exit(1)
})
