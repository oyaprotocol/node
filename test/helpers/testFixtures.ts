/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Test Fixtures & Constants                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Shared test data and constants used across test suites.
 */

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
