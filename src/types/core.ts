// Core types for the Oya Natural Language Protocol Node

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
	outputs?: TokenAmount[]
	[key: string]: unknown
}

export interface TokenAmount {
	token: string
	amount: string
}

export interface BundleData {
	bundle: Execution[] | unknown
	nonce: number
}

export interface Execution {
	intention: Intention
	signature?: string
	proof?: unknown[]
}

export interface RequestBody {
	bundle?: unknown
	nonce?: unknown
}
