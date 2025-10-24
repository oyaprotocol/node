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
 * Configuration for the specific ERC20 tokens and amounts to be transferred
 * from the proposer's vault to a new user's vault upon creation.
 * @internal
 */
export const SEED_CONFIG = [
	{
		address: '0xe0Ab3BaC84Af1f63719fE4B2e96d16505EC68842', // OTWETH
		amount: '1.0',
	},
	{
		address: '0x69dB14C05d012ff97a0F41e37E327970dea4F5eA', // OTUSDC
		amount: '1000.0',
	},
	{
		address: '0x897292EaEc4Ef49948a36727a02FA0388E46C692', // OTUSDT
		amount: '1000.0',
	},
	{
		address: '0xaCe171bf775107B491D9F4d4Daa808Be6515B2d0', // OTOYA
		amount: '5000.0',
	},
	{
		address: '0xF55c9c1060E0B00b6Feca4CF7fF7aC89b7DBdE07', // OTBTC
		amount: '1.0',
	},
]
