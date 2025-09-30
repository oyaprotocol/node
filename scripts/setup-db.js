#!/usr/bin/env node
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
 *   node scripts/setup-db.js                    # Uses DATABASE_URL from .env
 *   DATABASE_URL=postgres://... node scripts/setup-db.js  # Override connection string
 *   node scripts/setup-db.js --drop-existing    # Drop and recreate all tables (DESTRUCTIVE!)
 */

import pg from 'pg'
import dotenv from 'dotenv'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config()

const { Pool } = pg

// Parse command line arguments
const args = process.argv.slice(2)
const shouldDropExisting = args.includes('--drop-existing')
const showHelp = args.includes('--help') || args.includes('-h')

if (showHelp) {
	console.log(`
${chalk.cyan('Oya Node Database Setup Script')}

${chalk.yellow('Usage:')}
  node scripts/setup-db.js                    # Uses DATABASE_URL from .env
  DATABASE_URL=postgres://... node scripts/setup-db.js  # Override connection string
  node scripts/setup-db.js --drop-existing    # Drop and recreate all tables (DESTRUCTIVE!)
  node scripts/setup-db.js --help            # Show this help message

${chalk.yellow('Required Environment:')}
  DATABASE_URL - PostgreSQL connection string

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

// Determine SSL setting
const DATABASE_SSL = process.env.DATABASE_SSL !== 'false'

// Create connection pool
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
})

/**
 * SQL statements for creating tables
 */
const createTablesSql = `
-- Create the bundles table (stores bundle data with IPFS CIDs)
CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  bundle BYTEA NOT NULL,
  nonce INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  signature TEXT NOT NULL,
  ipfs_cid TEXT,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the cids table (tracks submitted CIDs)
CREATE TABLE IF NOT EXISTS cids (
  id SERIAL PRIMARY KEY,
  cid TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the balances table (manages vault token balances)
CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  vault TEXT NOT NULL,
  token TEXT NOT NULL,
  balance NUMERIC(78, 18) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault, token)
);

-- Create the nonces table (tracks vault nonces)
CREATE TABLE IF NOT EXISTS nonces (
  id SERIAL PRIMARY KEY,
  vault TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vault)
);

-- Create the proposers table (records block proposers)
CREATE TABLE IF NOT EXISTS proposers (
  id SERIAL PRIMARY KEY,
  proposer TEXT NOT NULL UNIQUE,
  last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`

/**
 * SQL statements for creating indexes
 */
const createIndexesSql = `
-- Create case-insensitive unique indexes for vault/token lookups
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_nonces ON nonces (LOWER(vault));
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_token_balances ON balances (LOWER(vault), LOWER(token));
`

/**
 * SQL statements for dropping tables (when --drop-existing is used)
 */
const dropTablesSql = `
DROP TABLE IF EXISTS bundles CASCADE;
DROP TABLE IF EXISTS cids CASCADE;
DROP TABLE IF EXISTS balances CASCADE;
DROP TABLE IF EXISTS nonces CASCADE;
DROP TABLE IF EXISTS proposers CASCADE;
`

/**
 * Main setup function
 */
async function setupDatabase() {
	console.log(chalk.cyan('\n🌪️  Oya Node Database Setup\n'))
	console.log(chalk.gray(`Connection: ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@')}`))
	console.log(chalk.gray(`SSL: ${DATABASE_SSL ? 'enabled' : 'disabled'}\n`))

	try {
		// Test connection
		console.log(chalk.yellow('Testing database connection...'))
		await pool.query('SELECT NOW()')
		console.log(chalk.green('✓ Database connection successful\n'))

		// Drop existing tables if requested
		if (shouldDropExisting) {
			console.log(chalk.red('⚠️  Dropping existing tables...'))
			const confirmDrop = process.env.FORCE_DROP === 'true'

			if (!confirmDrop) {
				console.log(chalk.red('\n⚠️  WARNING: This will DELETE ALL DATA in the following tables:'))
				console.log(chalk.red('  - bundles, cids, balances, nonces, proposers'))
				console.log(chalk.yellow('\nTo confirm, set FORCE_DROP=true or remove --drop-existing flag'))
				process.exit(1)
			}

			await pool.query(dropTablesSql)
			console.log(chalk.green('✓ Existing tables dropped\n'))
		}

		// Create tables
		console.log(chalk.yellow('Creating tables...'))
		await pool.query(createTablesSql)
		console.log(chalk.green('✓ Tables created successfully'))

		// Create indexes
		console.log(chalk.yellow('Creating indexes...'))
		await pool.query(createIndexesSql)
		console.log(chalk.green('✓ Indexes created successfully'))

		// Verify tables were created
		console.log(chalk.yellow('\nVerifying database schema...'))
		const result = await pool.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			AND table_name IN ('bundles', 'cids', 'balances', 'nonces', 'proposers')
			ORDER BY table_name
		`)

		console.log(chalk.green('\n✓ Database setup complete!'))
		console.log(chalk.cyan('\nTables created:'))
		result.rows.forEach(row => {
			console.log(chalk.gray(`  • ${row.table_name}`))
		})

		// Check if we need to update existing data to lowercase
		const balancesCount = await pool.query('SELECT COUNT(*) FROM balances')
		const noncesCount = await pool.query('SELECT COUNT(*) FROM nonces')

		if (parseInt(balancesCount.rows[0].count) > 0 || parseInt(noncesCount.rows[0].count) > 0) {
			console.log(chalk.yellow('\nUpdating existing data to lowercase...'))
			await pool.query('UPDATE nonces SET vault = LOWER(vault)')
			await pool.query('UPDATE balances SET vault = LOWER(vault), token = LOWER(token)')
			console.log(chalk.green('✓ Existing data updated'))
		}

		console.log(chalk.green('\n✅ Database is ready for use!\n'))

	} catch (error) {
		console.error(chalk.red('\n❌ Database setup failed:'))
		console.error(chalk.red(error.message))

		if (error.code === 'ECONNREFUSED') {
			console.log(chalk.yellow('\nMake sure PostgreSQL is running and accessible'))
		} else if (error.code === '42P07') {
			console.log(chalk.yellow('\nTables already exist. Use --drop-existing to recreate them'))
		} else if (error.code === '3D000') {
			console.log(chalk.yellow('\nDatabase does not exist. Please create it first'))
		}

		process.exit(1)
	} finally {
		await pool.end()
	}
}

// Run the setup
setupDatabase().catch(error => {
	console.error(chalk.red('Unexpected error:'), error)
	process.exit(1)
})