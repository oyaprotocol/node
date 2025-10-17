/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         ENS Resolution Utility                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Resolves ENS names to Ethereum addresses with caching.
 * All ENS resolution happens on Ethereum mainnet, as that's where the canonical
 * ENS registry exists.
 *
 * Features:
 * - Resolves .eth names to addresses
 * - 1-hour TTL cache to reduce network calls
 * - Detailed logging and diagnostics
 *
 * @packageDocumentation
 */

import { getMainnetProvider } from './provider.js'
import { createLogger, diagnostic } from './logger.js'
import { Cache } from './cache.js'
import { ENS_CACHE_TTL } from '../config/cacheSettings.js'
import type { Intention } from '../types/core.js'

const logger = createLogger('ENS')

/** ENS resolution cache with 1-hour TTL */
const ensCache = new Cache<string>(ENS_CACHE_TTL)

/**
 * Resolve an ENS name to an Ethereum address.
 * Always resolves on Ethereum mainnet (the canonical ENS registry).
 *
 * @param name - ENS name to resolve (e.g., "vitalik.eth")
 * @returns Lowercase Ethereum address, or null if name doesn't exist
 * @throws Error if resolution fails due to network issues
 */
export async function resolveENS(name: string): Promise<string | null> {
	const startTime = Date.now()
	const nameLower = name.toLowerCase()

	// Check cache first
	const cached = ensCache.get(nameLower)
	if (cached) {
		diagnostic.debug('ENS cache hit', {
			name: nameLower,
			address: cached,
		})
		return cached
	}

	// Cache miss - resolve from network
	try {
		const provider = await getMainnetProvider()
		const resolved = await provider.resolveName(name)

		if (resolved) {
			const addressLower = resolved.toLowerCase()

			// Store in cache
			ensCache.set(nameLower, addressLower)

			diagnostic.debug('ENS resolved successfully', {
				name,
				address: addressLower,
				resolutionTime: Date.now() - startTime,
			})

			return addressLower
		}

		// Name exists but doesn't resolve to an address
		logger.warn(`ENS name not found or not configured: ${name}`)
		return null
	} catch (error) {
		diagnostic.error('ENS resolution failed', {
			name,
			error: error instanceof Error ? error.message : String(error),
			resolutionTime: Date.now() - startTime,
		})
		throw new Error(
			`Failed to resolve ENS name "${name}": ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

/**
 * Check if a string looks like an ENS name.
 * Currently supports .eth names only.
 *
 * @param address - String to check
 * @returns True if the string appears to be an ENS name
 */
export function isENSName(address: string): boolean {
	return address.includes('.') && address.toLowerCase().endsWith('.eth')
}

/**
 * Clear the ENS cache.
 * Useful for testing or forcing fresh resolutions.
 * @returns Number of entries cleared
 */
export function clearENSCache(): number {
	const cleared = ensCache.clear()
	logger.debug(`Cleared ENS cache (${cleared} entries)`)
	return cleared
}

/**
 * Get cache statistics for monitoring.
 */
export function getENSCacheStats() {
	return ensCache.getStats()
}

/**
 * Resolve all ENS names in an intention to Ethereum addresses.
 * Mutates the intention object in place, replacing ENS names with resolved addresses.
 *
 * @param intention - Intention object that may contain ENS names
 * @throws Error if any ENS name fails to resolve
 */
export async function resolveIntentionENS(intention: Intention): Promise<void> {
	// Resolve from field
	if (intention.from && isENSName(intention.from)) {
		const resolved = await resolveENS(intention.from)
		if (!resolved) {
			throw new Error(`ENS name could not be resolved: ${intention.from}`)
		}
		logger.debug(`Resolved intention.from: ${intention.from} -> ${resolved}`)
		intention.from = resolved
	}

	// Resolve to field
	if (intention.to && isENSName(intention.to)) {
		const resolved = await resolveENS(intention.to)
		if (!resolved) {
			throw new Error(`ENS name could not be resolved: ${intention.to}`)
		}
		logger.debug(`Resolved intention.to: ${intention.to} -> ${resolved}`)
		intention.to = resolved
	}

	// Resolve outputs[].externalAddress
	if (intention.outputs && Array.isArray(intention.outputs)) {
		for (let i = 0; i < intention.outputs.length; i++) {
			const output = intention.outputs[i]
			if (output.externalAddress && isENSName(output.externalAddress)) {
				const resolved = await resolveENS(output.externalAddress)
				if (!resolved) {
					throw new Error(
						`ENS name could not be resolved: ${output.externalAddress}`
					)
				}
				logger.debug(
					`Resolved outputs[${i}].externalAddress: ${output.externalAddress} -> ${resolved}`
				)
				intention.outputs[i].externalAddress = resolved
			}
		}
	}
}
