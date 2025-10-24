/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Environment Variable Schema                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Defines the schema for all environment variables required by the Oya node.
 * This schema is used to validate configuration at startup.
 *
 * @packageDocumentation
 */

import { ethers } from 'ethers'
import type { EnvVariable } from '../types/setup.js'

/**
 * Environment variable schema defining all configuration requirements.
 * Each entry describes a variable's validation rules, transformations, and metadata.
 */
export const envSchema: EnvVariable[] = [
	{
		name: 'API_BEARER_TOKEN',
		required: true,
		type: 'string',
		description: 'Bearer token for POST endpoint authentication',
		sensitive: true,
		validator: (value) =>
			value.length >= 32 ||
			'Token should be at least 32 characters for security',
	},
	{
		name: 'DATABASE_URL',
		required: true,
		type: 'url',
		description: 'PostgreSQL connection string',
		sensitive: true,
		validator: (value) => {
			if (
				!value.startsWith('postgres://') &&
				!value.startsWith('postgresql://')
			) {
				return 'Must be a valid PostgreSQL connection string'
			}
			return true
		},
	},
	{
		name: 'TEST_DATABASE_URL',
		required: false,
		type: 'url',
		description:
			'Test database connection string (auto-derived from DATABASE_URL if not set)',
		sensitive: true,
		validator: (value) => {
			if (
				!value.startsWith('postgres://') &&
				!value.startsWith('postgresql://')
			) {
				return 'Must be a valid PostgreSQL connection string'
			}
			return true
		},
	},
	{
		name: 'DATABASE_SSL',
		required: false,
		type: 'boolean',
		description: 'Enable SSL for database connections',
		defaultValue: true,
		transformer: (value: string) => value.toLowerCase() !== 'false',
	},
	{
		name: 'ALCHEMY_API_KEY',
		required: true,
		type: 'string',
		description: 'Alchemy API key for blockchain interactions',
		sensitive: true,
		validator: (value) =>
			value.length === 32 || 'Alchemy API key should be 32 characters',
	},
	{
		name: 'BUNDLE_TRACKER_ADDRESS',
		required: true,
		type: 'address',
		description: 'BundleTracker contract address on Sepolia',
		validator: (value) => {
			try {
				ethers.getAddress(value)
				return true
			} catch {
				return 'Must be a valid Ethereum address'
			}
		},
		transformer: (value) => ethers.getAddress(value),
	},
	{
		name: 'VAULT_TRACKER_ADDRESS',
		required: true,
		type: 'address',
		description: 'VaultTracker contract address on Sepolia',
		validator: (value) => {
			try {
				ethers.getAddress(value)
				return true
			} catch {
				return 'Must be a valid Ethereum address'
			}
		},
		transformer: (value) => ethers.getAddress(value),
	},
	{
		name: 'PROPOSER_ADDRESS',
		required: true,
		type: 'address',
		description: 'Ethereum address of the bundle proposer',
		validator: (value) => {
			try {
				ethers.getAddress(value)
				return true
			} catch {
				return 'Must be a valid Ethereum address'
			}
		},
		transformer: (value) => ethers.getAddress(value),
	},
	{
		name: 'PROPOSER_VAULT_ID',
		required: false,
		type: 'number',
		description: 'The internal integer ID of the proposer vault',
		defaultValue: 1,
		validator: (value) => {
			const id = parseInt(value)
			if (isNaN(id) || id < 1) {
				return 'Vault ID must be a positive integer'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'PROPOSER_KEY',
		required: true,
		type: 'privateKey',
		description: "Block proposer's private key",
		sensitive: true,
		validator: (value) => {
			try {
				new ethers.Wallet(value)
				return true
			} catch {
				return 'Must be a valid Ethereum private key'
			}
		},
	},
	{
		name: 'PORT',
		required: false,
		type: 'number',
		description: 'Server port',
		defaultValue: 3000,
		validator: (value) => {
			const port = parseInt(value)
			if (isNaN(port) || port < 1 || port > 65535) {
				return 'Port must be between 1 and 65535'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'LOG_LEVEL',
		required: false,
		type: 'number',
		description:
			'Logging level (0=silly, 1=trace, 2=debug, 3=info, 4=warn, 5=error, 6=fatal)',
		defaultValue: 3,
		validator: (value) => {
			const level = parseInt(value)
			if (isNaN(level) || level < 0 || level > 6) {
				return 'Log level must be between 0 and 6'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'DIAGNOSTIC_LOGGER',
		required: false,
		type: 'boolean',
		description: 'Enable diagnostic logging',
		defaultValue: false,
		transformer: (value) => value === 'true',
	},
	{
		name: 'RATE_LIMIT_ENABLED',
		required: false,
		type: 'boolean',
		description: 'Enable rate limiting middleware',
		defaultValue: true,
		transformer: (value: string) => value.toLowerCase() !== 'false',
	},
	{
		name: 'RATE_LIMIT_WINDOW_MS',
		required: false,
		type: 'number',
		description: 'Rate limit window duration in milliseconds',
		defaultValue: 60000,
		validator: (value) => {
			const ms = parseInt(value)
			if (isNaN(ms) || ms < 1000) {
				return 'Window must be at least 1000ms (1 second)'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'RATE_LIMIT_PERMISSIVE',
		required: false,
		type: 'number',
		description: 'Max requests per window for permissive tier',
		defaultValue: 300,
		validator: (value) => {
			const max = parseInt(value)
			if (isNaN(max) || max < 1) {
				return 'Max must be at least 1'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'RATE_LIMIT_STANDARD',
		required: false,
		type: 'number',
		description: 'Max requests per window for standard tier',
		defaultValue: 100,
		validator: (value) => {
			const max = parseInt(value)
			if (isNaN(max) || max < 1) {
				return 'Max must be at least 1'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'RATE_LIMIT_STRICT',
		required: false,
		type: 'number',
		description: 'Max requests per window for strict tier',
		defaultValue: 50,
		validator: (value) => {
			const max = parseInt(value)
			if (isNaN(max) || max < 1) {
				return 'Max must be at least 1'
			}
			return true
		},
		transformer: (value) => parseInt(value),
	},
	{
		name: 'FILECOIN_PIN_ENABLED',
		required: false,
		type: 'boolean',
		description:
			'Enable Filecoin pinning for bundles (requires Calibration testnet wallet)',
		defaultValue: false,
		transformer: (value) => value === 'true',
	},
	{
		name: 'FILECOIN_PIN_PRIVATE_KEY',
		required: false,
		type: 'privateKey',
		description:
			'Filecoin wallet private key for Calibration testnet (required if FILECOIN_PIN_ENABLED=true)',
		sensitive: true,
		validator: (value) => {
			try {
				new ethers.Wallet(value)
				return true
			} catch {
				return 'Must be a valid Ethereum private key'
			}
		},
	},
	{
		name: 'FILECOIN_PIN_RPC_URL',
		required: false,
		type: 'url',
		description: 'Filecoin Calibration testnet RPC endpoint',
		defaultValue: 'https://api.calibration.node.glif.io/rpc/v1',
	},
	{
		name: 'WEBHOOK_URL',
		required: false,
		type: 'url',
		description: 'Webhook URL for sending notifications',
		sensitive: true,
		validator: (value) => {
			try {
				new URL(value)
				return true
			} catch {
				return 'Must be a valid URL'
			}
		},
	},
	{
		name: 'WEBHOOK_SECRET',
		required: false,
		type: 'string',
		description: 'Webhook secret for authentication',
		sensitive: true,
		validator: (value) => {
			if (typeof value !== 'string' || value.trim() === '') {
				return 'Must be a non-empty string'
			}
			return true
		},
	},
]
