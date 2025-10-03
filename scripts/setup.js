#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                           Project Setup Script                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Installs dependencies and sets up the oya command globally.
 */

import { execSync } from 'child_process'

const chalk = await loadChalk()

console.log(chalk.cyan('\n🌪️  Oya Node Setup\n'))

try {
	console.log(chalk.yellow('📦 Installing dependencies...'))
	execSync('bun install --silent', { stdio: 'pipe' })
	console.log(chalk.green('✓ Dependencies installed\n'))

	console.log(chalk.yellow('📦 Downloading native modules...'))
	execSync('bun run scripts/download-native-modules.js', { stdio: 'inherit' })
	console.log(chalk.green('✓ Native modules downloaded\n'))

	console.log(chalk.yellow('🔗 Linking oya command globally...'))
	execSync('bun link', { stdio: 'pipe' })
	console.log(chalk.green('✓ oya command linked\n'))

	console.log(chalk.green.bold('🎉 Setup complete!\n'))
	console.log(chalk.cyan('Next steps:'))
	console.log(chalk.gray('  1. Copy .env.example to .env and configure'))
	console.log(chalk.gray('  2. Run: oya db:create'))
	console.log(chalk.gray('  3. Run: oya db:setup'))
	console.log(chalk.gray('  4. Run: oya start\n'))
} catch (error) {
	console.error(chalk.red('\n❌ Setup failed:'), error.message)
	process.exit(1)
}

/**
 * Loads chalk with fallback for when dependencies aren't installed yet
 */
async function loadChalk() {
	try {
		const module = await import('chalk')
		return module.default
	} catch {
		// Fallback to plain console if chalk not installed yet
		const identity = (s) => s
		identity.bold = identity
		return {
			cyan: identity,
			yellow: identity,
			green: identity,
			red: identity,
			gray: identity,
		}
	}
}
