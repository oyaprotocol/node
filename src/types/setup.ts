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
	/** Enable SSL for database connections (default: true) */
	DATABASE_SSL: boolean
	/** Alchemy API key for blockchain RPC access */
	ALCHEMY_API_KEY: string
	/** Ethereum address of the BundleTracker smart contract */
	BUNDLE_TRACKER_ADDRESS: string
	/** Ethereum address of the bundle proposer */
	PROPOSER_ADDRESS: string
	/** Private key of the bundle proposer account */
	TEST_PRIVATE_KEY: string
	/** Port number for the Express server (default: 3000) */
	PORT: number
	/** Logging verbosity level 0-6 (default: 3/info) */
	LOG_LEVEL: number
	/** Whether to enable detailed diagnostic logging (default: false) */
	DIAGNOSTIC_LOGGER: boolean
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
