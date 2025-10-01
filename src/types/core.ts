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
	from_token_address?: string
	amount_sent?: string
	to_token_address?: string
	amount_received?: string
	from_token_chainid?: string
	to_token_chainid?: string
	nonce?: number
	to?: string
	from?: string
	signature?: string
	inputs?: TokenAmount[]
	outputs?: IntentionOutput[]
	[key: string]: unknown
}

/**
 * Represents a token amount with its contract address.
 */
export interface TokenAmount {
	token: string
	amount: string
}

/**
 * Defines output specifications for an intention.
 */
export interface IntentionOutput {
	asset?: string
	amount?: number | string
	vault?: string
	externalAddress?: string
	digits?: number
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
 * Wrapper for execution objects that are cached before bundling.
 * Used internally by the proposer to accumulate intentions.
 */
export interface ExecutionWrapper {
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
