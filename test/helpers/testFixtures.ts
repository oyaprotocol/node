/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Test Fixtures & Constants                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Shared test data and constants used across test suites.
 */

import type { Intention } from '../../src/types/core.js'

/**
 * Sample vault ID for testing (valid 32-byte hex string with 0x prefix).
 */
export const TEST_VAULT_ID =
	'0x1234567890123456789012345678901234567890123456789012345678901234'

/**
 * Sample Ethereum address for testing (lowercase to avoid checksum validation).
 */
export const TEST_ADDRESS = '0x742d35cc6634c0532925a3b844bc9e7595f0beb'

/**
 * Additional test addresses for multi-party scenarios.
 */
export const TEST_ADDRESS_2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
export const TEST_ADDRESS_3 = '0xcccccccccccccccccccccccccccccccccccccccc'

/**
 * Real mainnet token addresses for testing (lowercase, always valid).
 */
export const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
export const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

/**
 * Sample CID for testing.
 */
export const TEST_CID =
	'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

/**
 * All POST endpoints that require authentication.
 * Only /intention is publicly accessible via POST.
 * Other write operations are internal-only (not exposed via HTTP).
 */
export const POST_ENDPOINTS = ['/intention']

/**
 * All GET endpoints that should NOT require authentication.
 * Used for testing that public endpoints remain accessible.
 */
export const GET_ENDPOINTS = [
	'/health',
	'/info',
	'/metrics',
	'/bundle',
	'/bundle/0',
	'/cid/0',
	`/balance/${TEST_VAULT_ID}`,
	`/nonce/${TEST_VAULT_ID}`,
	`/vault/${TEST_VAULT_ID}/controllers`,
	`/vault/${TEST_VAULT_ID}/rules`,
	'/vault/by-controller/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
	`/filecoin/status/${TEST_CID}`,
]

/**
 * Sample valid intention payload for testing.
 */
export const SAMPLE_INTENTION = {
	from: TEST_ADDRESS,
	to: TEST_ADDRESS,
	intention: 'test intention',
	vaultId: TEST_VAULT_ID,
	signature: '0x' + '0'.repeat(130), // Dummy signature
}

/**
 * Test transaction hash for deposits tests.
 */
export const TEST_TX = '0xtest-deposit-tx'

/**
 * Generate test UID for deposits tests.
 */
export const TEST_UID = (n: number) => `${TEST_TX}:${n}`

/**
 * Controller address for deposits tests.
 */
export const CTRL = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc'

/**
 * Token address for deposits tests.
 */
export const TOKEN = '0x1111111111111111111111111111111111111111'

/**
 * Zero address (ETH address).
 */
export const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Creates a mock valid intention object for testing.
 * Returns a new intention object each time it's called with a fresh expiry timestamp.
 */
export const createMockValidIntention = (): Intention => ({
	action: 'Swap 1,000 USDC for 0.3 WETH with .016 WETH in fees',
	nonce: 1,
	expiry: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
	inputs: [
		{
			asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
			amount: '1000.0',
			chain_id: 1,
		},
	],
	outputs: [
		{
			asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
			amount: '0.3',
			to_external: '0xDB473D9716ac61dc4D4aeA6e4d691239DB84C77D',
			chain_id: 1,
		},
	],
	totalFee: [
		{
			asset: ['WETH'],
			amount: '0.016',
		},
	],
	proposerTip: [
		{
			asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
			amount: '0.01',
			to: 123, // Some vault ID
			chain_id: 1,
		},
	],
	agentTip: [
		{
			asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
			amount: '0.005',
			to: 456, // Some other vault ID
			chain_id: 1,
		},
	],
	protocolFee: [
		{
			asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
			amount: '0.001',
			to: 0, // Oya vault ID
			chain_id: 1,
		},
	],
})
