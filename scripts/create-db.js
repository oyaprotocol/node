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
 *   node scripts/create-db.js                    # Creates oya_db using connection from DATABASE_URL
 *   DATABASE_URL=postgres://... node scripts/create-db.js  # Override connection string
 */

import pg from 'pg'
import dotenv from 'dotenv'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config()

const { Client } = pg

// Parse command line arguments
const args = process.argv.slice(2)
const showHelp = args.includes('--help') || args.includes('-h')

if (showHelp) {
	console.log(`
${chalk.cyan('Oya Node Database Creation Script')}

${chalk.yellow('Usage:')}
  node scripts/create-db.js                    # Creates oya_db database
  node scripts/create-db.js --help            # Show this help message

${chalk.yellow('Environment:')}
  DATABASE_URL - PostgreSQL connection string (for connection details)

${chalk.yellow('Examples:')}
  # Using .env file (with DATABASE_URL set)
  node scripts/create-db.js

  # Override connection
  DATABASE_URL=postgresql://user:pass@localhost:5432/oya_db node scripts/create-db.js

${chalk.yellow('Note:')} This script will always create a database named 'oya_db'.
`)
	process.exit(0)
}

// Fixed database name for Oya
const DB_NAME = 'oya_db'

// Extract connection parameters from DATABASE_URL or use defaults
function getConnectionParams() {
	let host = 'localhost'
	let port = 5432
	let user = 'postgres'
	let password = 'postgres'

	if (process.env.DATABASE_URL) {
		try {
			const url = new URL(process.env.DATABASE_URL)
			host = url.hostname || host
			port = url.port ? parseInt(url.port) : port
			user = url.username || user
			password = url.password || password
		} catch (e) {
			console.warn(chalk.yellow('Warning: Could not parse DATABASE_URL, using defaults'))
		}
	}

	return { host, port, user, password }
}

/**
 * Main function to create the oya_db database
 */
async function createDatabase() {
	console.log(chalk.cyan('\n🌪️  Oya Node Database Creation\n'))

	const { host, port, user, password } = getConnectionParams()

	console.log(chalk.gray(`Target database: ${DB_NAME}`))
	console.log(chalk.gray(`Server: ${host}:${port}`))
	console.log(chalk.gray(`User: ${user}\n`))

	// Connect to the default 'postgres' database
	const client = new Client({
		host,
		port,
		user,
		password,
		database: 'postgres', // Connect to default database
	})

	try {
		// Test connection
		console.log(chalk.yellow('Connecting to PostgreSQL server...'))
		await client.connect()
		console.log(chalk.green('✓ Connected to PostgreSQL\n'))

		// Check if database already exists
		console.log(chalk.yellow(`Checking if database '${DB_NAME}' exists...`))
		const checkResult = await client.query(
			`SELECT 1 FROM pg_database WHERE datname = $1`,
			[DB_NAME]
		)

		if (checkResult.rows.length > 0) {
			console.log(chalk.green(`✓ Database '${DB_NAME}' already exists`))
			console.log(chalk.cyan('\nDatabase is ready! You can now run:'))
			console.log(chalk.gray(`  npm run db:setup`))
			console.log(chalk.gray(`\nTo create/update tables\n`))
			process.exit(0)
		}

		// Create the database
		console.log(chalk.yellow(`Creating database '${DB_NAME}'...`))
		await client.query(`CREATE DATABASE ${DB_NAME}`)
		console.log(chalk.green(`✓ Database '${DB_NAME}' created successfully!\n`))

		// Show next steps
		const suggestedUrl = `postgresql://${user}:${password}@${host}:${port}/${DB_NAME}`

		console.log(chalk.cyan('🎉 Database created successfully!\n'))
		console.log(chalk.yellow('Next steps:'))
		console.log(chalk.gray('1. Ensure your .env file has:'))
		console.log(chalk.gray(`   DATABASE_URL=${suggestedUrl}`))
		console.log(chalk.gray('\n2. Create the tables:'))
		console.log(chalk.gray(`   npm run db:setup\n`))

	} catch (error) {
		console.error(chalk.red('\n❌ Database creation failed:'))
		console.error(chalk.red(error.message))

		if (error.code === 'ECONNREFUSED') {
			console.log(chalk.yellow('\nMake sure PostgreSQL is running and accessible'))
			console.log(chalk.gray('You may need to:'))
			console.log(chalk.gray('  - Start PostgreSQL service'))
			console.log(chalk.gray('  - Check your connection settings'))
			console.log(chalk.gray('  - Verify user credentials'))
		} else if (error.code === '42P04') {
			console.log(chalk.yellow(`\nDatabase '${DB_NAME}' already exists`))
		} else if (error.code === '28P01') {
			console.log(chalk.yellow('\nAuthentication failed'))
			console.log(chalk.gray('Check your username and password'))
		}

		process.exit(1)
	} finally {
		await client.end()
	}
}

// Run the creation
createDatabase().catch(error => {
	console.error(chalk.red('Unexpected error:'), error)
	process.exit(1)
})