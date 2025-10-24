#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                      Filecoin Pin Setup Script                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Automates the setup process for Filecoin pinning integration.
 * This script checks balances, configures approvals, and deposits USDFC
 * into the Filecoin Pay system.
 *
 * Prerequisites:
 * - FILECOIN_PIN_PRIVATE_KEY in .env
 * - FILECOIN_PIN_RPC_URL in .env (or uses default Calibration testnet)
 * - Testnet FIL in your wallet (for gas)
 * - USDFC tokens in your wallet (for storage payments)
 *
 * Usage:
 *   bun run scripts/setup-filecoin.js
 *   oya filecoin:setup
 */

import { ethers } from 'ethers'
import { spawn } from 'child_process'
import dotenv from 'dotenv'
import chalk from 'chalk'

dotenv.config()

const FILECOIN_RPC_URL =
	process.env.FILECOIN_PIN_RPC_URL ||
	'https://api.calibration.node.glif.io/rpc/v1'
const FILECOIN_PRIVATE_KEY = process.env.FILECOIN_PIN_PRIVATE_KEY

// Calibration testnet contract addresses
const USDFC_ADDRESS = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0'

const erc20ABI = [
	'function balanceOf(address) view returns (uint256)',
	'function symbol() view returns (string)',
	'function decimals() view returns (uint8)',
]

/**
 * Run a command and return a promise that resolves with output or rejects with error
 * Cleans environment variables that might interfere with filecoin-pin CLI
 */
function runCommand(command, args) {
	return new Promise((resolve, reject) => {
		// Clean environment - remove variables that might interfere with filecoin-pin
		const cleanEnv = { ...process.env }
		delete cleanEnv.LOG_LEVEL  // filecoin-pin uses different log level format
		delete cleanEnv.DIAGNOSTIC_LOGGER

		const proc = spawn(command, args, {
			stdio: 'inherit',
			env: cleanEnv
		})

		proc.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`Command failed with exit code ${code}`))
			}
		})

		proc.on('error', (error) => {
			reject(error)
		})
	})
}

async function main() {
	console.log(chalk.cyan('\n🌪️  Oya Node - Filecoin Pin Setup\n'))
	console.log(chalk.gray('═'.repeat(60)))

	// Validate environment variables
	if (!FILECOIN_PRIVATE_KEY) {
		console.error(chalk.red('❌ Error: FILECOIN_PIN_PRIVATE_KEY not found in .env'))
		console.error(
			chalk.yellow('\nPlease add your Filecoin private key to .env:\n') +
			chalk.gray('FILECOIN_PIN_PRIVATE_KEY=your_private_key_here\n')
		)
		process.exit(1)
	}

	const provider = new ethers.JsonRpcProvider(FILECOIN_RPC_URL)
	const wallet = new ethers.Wallet(FILECOIN_PRIVATE_KEY, provider)

	console.log(chalk.gray(`\n📍 Network: Filecoin Calibration Testnet`))
	console.log(chalk.gray(`📍 RPC URL: ${FILECOIN_RPC_URL}`))
	console.log(chalk.gray(`📍 Wallet Address: ${wallet.address}\n`))

	// Step 1: Check FIL balance
	console.log(chalk.yellow('Step 1/3: Checking FIL balance (needed for gas)...'))
	const filBalance = await provider.getBalance(wallet.address)
	console.log(chalk.gray(`   FIL Balance: ${ethers.formatEther(filBalance)} FIL`))

	if (filBalance === 0n) {
		console.error(chalk.red('\n❌ Error: No FIL for gas!'))
		console.error(
			chalk.yellow('   Get testnet FIL from: https://faucet.calibration.fildev.network/\n')
		)
		process.exit(1)
	}
	console.log(chalk.green('   ✅ Sufficient FIL for gas\n'))

	// Step 2: Check USDFC balance
	console.log(chalk.yellow('Step 2/3: Checking USDFC balance (needed for storage)...'))
	const usdfc = new ethers.Contract(USDFC_ADDRESS, erc20ABI, provider)

	const symbol = await usdfc.symbol()
	const decimals = await usdfc.decimals()
	const balance = await usdfc.balanceOf(wallet.address)

	console.log(
		chalk.gray(`   ${symbol} Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`)
	)

	if (balance === 0n) {
		console.error(chalk.red(`\n❌ Error: No ${symbol} tokens!`))
		console.error(chalk.yellow('   Get testnet USDFC from:'))
		console.error(chalk.gray('   - https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc'))
		console.error(chalk.gray('   - Or trade tFIL for USDFC: https://app.usdfc.net/#/\n'))
		process.exit(1)
	}
	console.log(chalk.green(`   ✅ Have ${symbol} tokens\n`))

	// Step 3: Run filecoin-pin payments setup
	console.log(chalk.yellow('Step 3/3: Configuring Filecoin Pay system...'))
	console.log(chalk.gray('   This will:'))
	console.log(chalk.gray('   - Approve WARM_STORAGE contract to spend USDFC'))
	console.log(chalk.gray('   - Approve PAYMENTS contract to spend USDFC'))
	console.log(chalk.gray('   - Deposit 1 USDFC into Filecoin Pay system'))
	console.log(chalk.gray('   - Display your storage allowance\n'))

	try {
		await runCommand('npx', [
			'filecoin-pin',
			'payments',
			'setup',
			'--auto',
			'--private-key',
			FILECOIN_PRIVATE_KEY,
			'--rpc-url',
			FILECOIN_RPC_URL,
		])

		console.log(chalk.gray('\n' + '═'.repeat(60)))
		console.log(chalk.green.bold('\n✅ Filecoin Pin setup complete!\n'))
		console.log(chalk.cyan('Next steps:'))
		console.log(chalk.gray('1. Add FILECOIN_PIN_ENABLED=true to your .env file'))
		console.log(chalk.gray('2. Restart your Oya node'))
		console.log(chalk.gray('3. Bundles will now be automatically pinned to Filecoin\n'))
		console.log(chalk.cyan('To check your Filecoin Pay balance at any time:'))
		console.log(
			chalk.gray('  npx filecoin-pin payments balance --private-key YOUR_KEY --rpc-url ' +
				FILECOIN_RPC_URL +
				'\n')
		)
	} catch (error) {
		console.error(chalk.red('\n❌ Error running filecoin-pin setup:'), error.message)
		console.error(
			chalk.yellow('\nYou can try running the command manually to see more details:\n')
		)
		console.error(chalk.gray(`npx filecoin-pin payments setup --auto \\`))
		console.error(chalk.gray(`  --private-key "YOUR_PRIVATE_KEY" \\`))
		console.error(chalk.gray(`  --rpc-url "${FILECOIN_RPC_URL}"\n`))
		process.exit(1)
	}
}

main().catch((error) => {
	console.error(chalk.red('\n❌ Fatal error:'), error.message)
	process.exit(1)
})
