/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         Provider Utility                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Provides singleton Ethereum provider instances for ENS resolution.
 * ENS is resolved on Ethereum mainnet regardless of the intention's target chain.
 *
 * @packageDocumentation
 */

import { ethers } from 'ethers'
import { getEnvConfig } from './env.js'
import { createLogger } from './logger.js'

const logger = createLogger('Provider')

let mainnetProvider: ethers.Provider | null = null

/**
 * Get Ethereum mainnet provider for ENS resolution.
 * ENS is canonical on Ethereum mainnet, so we always resolve there.
 *
 * @returns Ethereum mainnet provider instance
 */
export async function getMainnetProvider(): Promise<ethers.Provider> {
	if (!mainnetProvider) {
		const { ALCHEMY_API_KEY } = getEnvConfig()
		mainnetProvider = new ethers.AlchemyProvider('mainnet', ALCHEMY_API_KEY)
		logger.info('Initialized Ethereum mainnet provider for ENS resolution')
	}
	return mainnetProvider
}
