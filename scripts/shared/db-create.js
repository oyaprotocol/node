/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                  Shared Database Creation Logic                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Shared functions for database creation used by both production and test scripts.
 */

import pg from 'pg'
import chalk from 'chalk'

const { Client } = pg

/**
 * Extract connection parameters from a connection string
 *
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {object} Connection parameters (host, port, user, password)
 */
export function parseConnectionParams(connectionString) {
	const defaults = {
		host: 'localhost',
		port: 5432,
		user: 'postgres',
		password: 'postgres',
	}

	if (!connectionString) {
		return defaults
	}

	try {
		const url = new URL(connectionString)
		return {
			host: url.hostname || defaults.host,
			port: url.port ? parseInt(url.port) : defaults.port,
			user: url.username || defaults.user,
			password: url.password || defaults.password,
		}
	} catch (e) {
		console.warn(chalk.yellow('Warning: Could not parse connection URL, using defaults'))
		return defaults
	}
}

/**
 * Create a PostgreSQL database if it doesn't exist
 *
 * @param {object} options - Creation options
 * @param {string} options.dbName - Name of the database to create
 * @param {string} options.connectionString - PostgreSQL connection string (for extracting connection params)
 * @param {boolean} options.ssl - Whether to use SSL for the connection (default: true)
 * @param {string} options.environment - Environment name (for display)
 * @param {string} options.nextStepCommand - Command to run after creation (e.g., 'bun run db:setup')
 */
export async function createDatabase(options) {
	const {
		dbName,
		connectionString,
		ssl = true,
		environment = 'production',
		nextStepCommand = 'bun run db:setup'
	} = options

	console.log(chalk.cyan(`\n🌪️  Oya Node ${environment === 'test' ? 'Test ' : ''}Database Creation\n`))

	const { host, port, user, password } = parseConnectionParams(connectionString)

	console.log(chalk.gray(`Target database: ${dbName}`))
	console.log(chalk.gray(`Server: ${host}:${port}`))
	console.log(chalk.gray(`User: ${user}`))
	console.log(chalk.gray(`SSL: ${ssl ? 'enabled' : 'disabled'}\n`))

	// Connect to the default 'postgres' database
	const client = new Client({
		host,
		port,
		user,
		password,
		database: 'postgres', // Connect to default database to create the target database
		ssl: ssl ? { rejectUnauthorized: false } : false,
	})

	try {
		// Test connection
		console.log(chalk.yellow('Connecting to PostgreSQL server...'))
		await client.connect()
		console.log(chalk.green('✓ Connected to PostgreSQL\n'))

		// Check if database already exists
		console.log(chalk.yellow(`Checking if database '${dbName}' exists...`))
		const checkResult = await client.query(
			`SELECT 1 FROM pg_database WHERE datname = $1`,
			[dbName]
		)

		if (checkResult.rows.length > 0) {
			console.log(chalk.green(`✓ Database '${dbName}' already exists`))
			console.log(chalk.cyan('\nDatabase is ready! You can now run:'))
			console.log(chalk.gray(`  ${nextStepCommand}`))
			console.log(chalk.gray(`\nTo create/update tables\n`))
			return true
		}

		// Create the database
		console.log(chalk.yellow(`Creating database '${dbName}'...`))
		await client.query(`CREATE DATABASE ${dbName}`)
		console.log(chalk.green(`✓ Database '${dbName}' created successfully!\n`))

		// Show next steps
		const suggestedUrl = `postgresql://${user}:${password}@${host}:${port}/${dbName}`

		console.log(chalk.cyan(`🎉 ${environment === 'test' ? 'Test ' : ''}Database created successfully!\n`))
		console.log(chalk.yellow('Next steps:'))
		console.log(chalk.gray('1. Ensure your .env file has:'))
		console.log(chalk.gray(`   ${environment === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'}=${suggestedUrl}`))
		console.log(chalk.gray('\n2. Create the tables:'))
		console.log(chalk.gray(`   ${nextStepCommand}\n`))

		return true

	} catch (error) {
		console.error(chalk.red(`\n❌ ${environment === 'test' ? 'Test ' : ''}Database creation failed:`))
		console.error(chalk.red(error.message))

		if (error.code === 'ECONNREFUSED') {
			console.log(chalk.yellow('\nMake sure PostgreSQL is running and accessible'))
			console.log(chalk.gray('You may need to:'))
			console.log(chalk.gray('  - Start PostgreSQL service'))
			console.log(chalk.gray('  - Check your connection settings'))
			console.log(chalk.gray('  - Verify user credentials'))
		} else if (error.code === '42P04') {
			console.log(chalk.yellow(`\nDatabase '${dbName}' already exists`))
		} else if (error.code === '28P01') {
			console.log(chalk.yellow('\nAuthentication failed'))
			console.log(chalk.gray('Check your username and password'))
		}

		throw error

	} finally {
		await client.end()
	}
}
