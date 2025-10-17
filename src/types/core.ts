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
 * Supports both legacy format and new inputs/outputs format.
 */
export interface Intention {
	action_type?: string
	action?: string
	from_token_address?: string
	amount_sent?: string
	to_token_address?: string
	amount_received?: string
	from_token_chainid?: string
	to_token_chainid?: string
	chainID?: number
	nonce?: number
	to?: string
	from?: string
	signature?: string
	assets?: IntentionAsset[]
	inputs?: IntentionInput[]
	outputs?: IntentionOutput[]
	totalFee?: (number | string)[]
	tip?: (number | string)[]
	protocolFee?: (number | string)[]
	[key: string]: unknown
}

/**
 * Represents a token amount with its contract address.
 * @deprecated Use IntentionInput for new-style intentions
 */
export interface TokenAmount {
	token: string
	amount: string
}

/**
 * Represents an asset reference in an intention.
 */
export interface IntentionAsset {
	asset: string
	assetName: string
}

/**
 * Represents an input specification for an intention.
 */
export interface IntentionInput {
	vault: string
	asset?: string
	token?: string
	assetName?: string
	amount: number | string
	digits?: number
	chain?: string
}

/**
 * Defines output specifications for an intention.
 */
export interface IntentionOutput {
	vault?: string
	asset?: string
	assetName?: string
	amount?: number | string
	externalAddress?: string
	digits?: number
	chain?: string
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
