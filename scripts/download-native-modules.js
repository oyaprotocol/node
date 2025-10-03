#!/usr/bin/env bun
/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                    Native Module Download Script                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Downloads prebuilt native modules for the current platform
 * Right now this is only @ipfs/node-datachannel
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'

const PACKAGE = '@ipshipyard/node-datachannel'
const VERSION = '0.26.6'
const NAPI_VERSION = 'napi-v8'
const targetDir = `node_modules/${PACKAGE}`

// Check if npx is available
let hasNpx = false
try {
	execSync('npx --version', { stdio: 'ignore' })
	hasNpx = true
} catch {
	console.log('⚠️  npx not available, using curl + tar fallback')
}

try {
	if (hasNpx) {
		// Use npx prebuild-install (faster, handles everything)
		execSync('npx -y prebuild-install -r napi', {
			stdio: 'inherit',
			cwd: targetDir,
		})
	} else {
		// Fallback: download with curl
		const platform =
			process.platform === 'linux'
				? 'linux'
				: process.platform === 'darwin'
					? 'darwin'
					: 'win32'
		const arch =
			process.arch === 'x64'
				? 'x64'
				: process.arch === 'arm64'
					? 'arm64'
					: 'arm'

		// For Linux, check if it's musl (Alpine) or glibc
		const isMusl = platform === 'linux' && existsSync('/etc/alpine-release')
		const platformVariant = isMusl ? 'linuxmusl' : platform

		const binaryUrl = `https://github.com/ipshipyard/js-node-datachannel/releases/download/v${VERSION}/node-datachannel-v${VERSION}-${NAPI_VERSION}-${platformVariant}-${arch}.tar.gz`

		execSync(`curl -sL ${binaryUrl} | tar -xz -C ${targetDir}`, {
			stdio: 'pipe',
		})
	}
} catch (error) {
	console.error('❌ Failed to download native modules:', error.message)
	process.exit(1)
}
