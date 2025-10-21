/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Core Type Definitions                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TypeScript type definitions for the Oya Protocol.
 * Defines the structure of intentions, bundles, and related data types.
 *
 * @packageDocumentation
 */

/**
 * Represents a user's intention in the Oya Protocol.
 */
export interface Intention {
	action: string
	nonce: number
	inputs: IntentionInput[]
	outputs: IntentionOutput[]
	totalFee: TotalFeeAmount[]
	tip: FeeAmount[]
	protocolFee: FeeAmount[]
}

/**
 * Represents the inputs of a user's intention.
 */
export interface IntentionInput {
	asset: string
	amount: string
	from?: number // vault ID
	data?: string // optional metadata
	chain_id: number
}

/**
 * Represents the outputs of a user's intention.
 */
export interface IntentionOutput {
	asset: string
	amount: string
	to?: number // vault ID - mutually exclusive with to_external
	to_external?: string // external address - mutually exclusive with to
	data?: string // may be hex-encoded bytes for external calldata, or string for in-protocol data
	chain_id: number
}

/**
 * Represents the total fees for a user's intention, the sum of the tip and protocol fee.
 */
export interface TotalFeeAmount {
	asset: string[] // human readable identifier, like WETH or AAVE, since underlying assets may have different addresses on different chains
	amount: string
}

/**
 * Represents the fees for a user's intention.
 */
export interface FeeAmount {
	asset: string // asset contract address, or zero address for base asset, like ETH on Ethereum
	amount: string
	to: number
	chain_id: number
}

/**
 * Represents a bundle of intentions with a unique nonce.
 */
export interface BundleData {
	bundle: unknown
	nonce: number
}

/**
 * Represents an executed intention with its proof.
 */
export interface Execution {
	intention: Intention
	signature?: string
	proof?: unknown[]
}

/**
 * Execution object that wraps verified intentions before bundling.
 * Used internally by the proposer to accumulate intentions.
 */
export interface ExecutionObject {
	execution: Array<{
		intention: Intention
		proof: unknown[]
	}>
}

/**
 * Request body structure for bundle submissions.
 */
export interface RequestBody {
	bundle?: unknown
	nonce?: unknown
}
