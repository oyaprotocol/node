/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       Vault Seeding Configuration                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Centralized configuration for seeding new user vaults with initial testnet tokens.
 *
 * @packageDocumentation
 */

import { getEnvConfig } from '../utils/env.js'

/**
 * The vault ID assigned to this proposer node.
 * This vault must be funded via on-chain deposits and `AssignDeposit` intentions
 * before it has the funds to seed new user vaults.
 * @internal
 */
export const PROPOSER_VAULT_ID = {
	get value() {
		return getEnvConfig().PROPOSER_VAULT_ID
	},
}

/**
 * Configuration for the specific ERC20 tokens and amounts to be assigned
 * to new user vaults upon creation via AssignDeposit intentions.
 *
 * These tokens are assigned directly from on-chain deposits made by PROPOSER_ADDRESS
 * to the VaultTracker contract. The proposer must have sufficient deposits for each
 * token/amount listed here before seeding will work.
 *
 * When VAULT_SEEDING=true, a CreateVault intention automatically triggers an
 * AssignDeposit intention that assigns these deposits to the new vault.
 *
 * @internal
 */
export const SEED_CONFIG = [
	{
		address: '0xe0Ab3BaC84Af1f63719fE4B2e96d16505EC68842', // OTWETH
		amount: '1.0',
		symbol: 'OTWETH',
	},
	{
		address: '0x69dB14C05d012ff97a0F41e37E327970dea4F5eA', // OTUSDC
		amount: '1000.0',
		symbol: 'OTUSDC',
	},
	{
		address: '0x897292EaEc4Ef49948a36727a02FA0388E46C692', // OTUSDT
		amount: '1000.0',
		symbol: 'OTUSDT',
	},
	{
		address: '0xaCe171bf775107B491D9F4d4Daa808Be6515B2d0', // OTOYA
		amount: '5000.0',
		symbol: 'OTOYA',
	},
	{
		address: '0xF55c9c1060E0B00b6Feca4CF7fF7aC89b7DBdE07', // OTBTC
		amount: '1.0',
		symbol: 'OTBTC',
	},
]
