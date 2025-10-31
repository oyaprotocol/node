/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Node Setup Type Definitions                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TypeScript type definitions for node setup and configuration.
 * Includes environment validation, configuration schemas, and initialization types.
 *
 * @packageDocumentation
 */

/**
 * Defines the schema for an environment variable.
 * Used to validate and transform environment configuration at startup.
 */
export interface EnvVariable {
	/** The environment variable name (e.g., 'DATABASE_URL') */
	name: string
	/** Whether this variable is required for the node to function */
	required: boolean
	/** The expected data type of the variable */
	type: 'string' | 'number' | 'boolean' | 'url' | 'address' | 'privateKey'
	/** Human-readable description of what this variable configures */
	description: string
	/** Optional validation function that returns true or an error message */
	validator?: (value: string) => boolean | string
	/** Optional transformer to convert the string value to the appropriate type */
	transformer?: (value: string) => string | number | boolean
	/** Default value if the environment variable is not set (only for optional vars) */
	defaultValue?: string | number | boolean
	/** Whether this value should be masked in logs (e.g., private keys, tokens) */
	sensitive?: boolean
}

/**
 * Result of environment validation process.
 * Contains validation status, errors, and the processed configuration.
 */
export interface EnvValidationResult {
	/** Whether all required environment variables passed validation */
	valid: boolean
	/** List of validation errors that must be fixed before startup */
	errors: Array<{
		/** The environment variable that failed validation */
		variable: string
		/** The specific error that occurred */
		error: string
		/** Description of what this variable is used for */
		description: string
	}>
	/** The validated and transformed configuration object */
	config: Record<string, unknown>
}

/**
 * Strongly-typed environment configuration after validation.
 * All values are guaranteed to exist and be the correct type.
 */
export interface EnvironmentConfig {
	/** Bearer token for authenticating POST requests to the node */
	API_BEARER_TOKEN: string
	/** PostgreSQL connection string for the node's database */
	DATABASE_URL: string
	/** PostgreSQL connection string for test database (optional, auto-derived if not set) */
	TEST_DATABASE_URL?: string
	/** Enable SSL for database connections (default: true) */
	DATABASE_SSL: boolean
	/** Alchemy API key for blockchain RPC access */
	ALCHEMY_API_KEY: string
	/** Ethereum address of the BundleTracker smart contract */
	BUNDLE_TRACKER_ADDRESS: string
	/** Ethereum address of the VaultTracker smart contract */
	VAULT_TRACKER_ADDRESS: string
	/** Ethereum address of the bundle proposer */
	PROPOSER_ADDRESS: string
	/** The internal integer ID of the proposer vault */
	PROPOSER_VAULT_ID: number
	/** Enable vault seeding using AssignDeposit (default: false) */
	VAULT_SEEDING: boolean
	/** Private key of the bundle proposer account */
	PROPOSER_KEY: string
	/** Port number for the Express server (default: 3000) */
	PORT: number
	/** Logging verbosity level 0-6 (default: 3/info) */
	LOG_LEVEL: number
	/** Whether to enable detailed diagnostic logging (default: false) */
	DIAGNOSTIC_LOGGER: boolean
	/** Enable or disable rate limiting middleware (default: true) */
	RATE_LIMIT_ENABLED: boolean
	/** Rate limit window duration in milliseconds (default: 60000) */
	RATE_LIMIT_WINDOW_MS: number
	/** Maximum requests per window for permissive tier (default: 300) */
	RATE_LIMIT_PERMISSIVE: number
	/** Maximum requests per window for standard tier (default: 100) */
	RATE_LIMIT_STANDARD: number
	/** Maximum requests per window for strict tier (default: 50) */
	RATE_LIMIT_STRICT: number
	/** Webhook URL for sending notifications (optional) */
	WEBHOOK_URL?: string
	/** Secret token for authenticating webhook requests (optional) */
	WEBHOOK_SECRET?: string
	/** Webhook request timeout in milliseconds (default: 6000) */
	WEBHOOK_TIMEOUT_MS: number
	/** Maximum number of webhook retry attempts (default: 6) */
	WEBHOOK_MAX_RETRIES: number
	/** Enable Filecoin pinning for bundles (default: false) */
	FILECOIN_PIN_ENABLED: boolean
	/** Filecoin wallet private key for Calibration testnet */
	FILECOIN_PIN_PRIVATE_KEY?: string
	/** Filecoin Calibration testnet RPC endpoint */
	FILECOIN_PIN_RPC_URL: string
}

/**
 * Node initialization configuration.
 * Extended configuration for setting up various node services.
 */
export interface NodeConfig extends EnvironmentConfig {
	/** The network the node is operating on (e.g., 'sepolia', 'mainnet') */
	network?: string
	/** Maximum number of intentions to include in a single bundle */
	maxBundleSize?: number
	/** Interval in milliseconds between bundle creation attempts */
	bundleInterval?: number
}

/**
 * Database pool configuration for PostgreSQL connection.
 */
export interface DatabaseConfig {
	/** PostgreSQL connection string */
	connectionString: string
	/** Maximum number of clients in the pool */
	max?: number
	/** Idle timeout in milliseconds */
	idleTimeoutMillis?: number
	/** Connection timeout in milliseconds */
	connectionTimeoutMillis?: number
}
