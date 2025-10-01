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
		name: 'TEST_PRIVATE_KEY',
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
]
