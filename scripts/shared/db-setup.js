/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Shared Database Setup Logic                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Shared functions for database setup used by both production and test scripts.
 */

import pg from 'pg'
import chalk from 'chalk'

const { Pool } = pg

/**
 * SQL statements for creating tables
 */
export const createTablesSql = `
-- Create the bundles table (stores bundle data with IPFS CIDs)
CREATE TABLE IF NOT EXISTS bundles (
  id SERIAL PRIMARY KEY,
  bundle BYTEA NOT NULL,
  nonce INTEGER NOT NULL,
  proposer TEXT NOT NULL,
  signature TEXT NOT NULL,
  ipfs_cid TEXT,
  filecoin_status TEXT DEFAULT 'pending',
  filecoin_tx_hash TEXT,
  filecoin_piece_cid TEXT,
  filecoin_confirmed_at TIMESTAMPTZ,
  filecoin_error TEXT,
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
export const createIndexesSql = `
-- Create case-insensitive unique indexes for vault/token lookups
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_nonces ON nonces (LOWER(vault));
CREATE UNIQUE INDEX IF NOT EXISTS unique_lower_vault_token_balances ON balances (LOWER(vault), LOWER(token));

-- Create indexes for Filecoin tracking
CREATE INDEX IF NOT EXISTS idx_bundles_filecoin_status ON bundles(filecoin_status);
CREATE INDEX IF NOT EXISTS idx_bundles_ipfs_cid ON bundles(ipfs_cid);
`

/**
 * SQL statements for dropping tables
 */
export const dropTablesSql = `
DROP TABLE IF EXISTS bundles CASCADE;
DROP TABLE IF EXISTS cids CASCADE;
DROP TABLE IF EXISTS balances CASCADE;
DROP TABLE IF EXISTS nonces CASCADE;
DROP TABLE IF EXISTS proposers CASCADE;
`

/**
 * Setup database tables and indexes
 *
 * @param {object} options - Setup options
 * @param {string} options.connectionString - PostgreSQL connection string
 * @param {boolean} options.ssl - Whether to use SSL
 * @param {boolean} options.dropExisting - Whether to drop existing tables first
 * @param {boolean} options.forceDropConfirm - Confirmation for dropping tables
 * @param {string} options.environment - Environment name (for display)
 */
export async function setupDatabase(options) {
	const {
		connectionString,
		ssl = true,
		dropExisting = false,
		forceDropConfirm = false,
		environment = 'production'
	} = options

	// Create connection pool
	const pool = new Pool({
		connectionString,
		ssl: ssl ? { rejectUnauthorized: false } : false,
	})

	console.log(chalk.cyan(`\n🌪️  Oya Node Database Setup (${environment})\n`))
	console.log(chalk.gray(`Connection: ${connectionString.replace(/:[^:@]*@/, ':****@')}`))
	console.log(chalk.gray(`SSL: ${ssl ? 'enabled' : 'disabled'}\n`))

	try {
		// Test connection
		console.log(chalk.yellow('Testing database connection...'))
		await pool.query('SELECT NOW()')
		console.log(chalk.green('✓ Database connection successful\n'))

		// Drop existing tables if requested
		if (dropExisting) {
			console.log(chalk.red('⚠️  Dropping existing tables...'))

			if (!forceDropConfirm) {
				console.log(chalk.red('\n⚠️  WARNING: This will DELETE ALL DATA in the following tables:'))
				console.log(chalk.red('  - bundles, cids, balances, nonces, proposers'))
				console.log(chalk.yellow('\nTo confirm, set FORCE_DROP=true or remove --drop-existing flag'))
				await pool.end()
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

		console.log(chalk.green(`\n✅ ${environment} database is ready for use!\n`))

		return true

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

		throw error

	} finally {
		await pool.end()
	}
}
