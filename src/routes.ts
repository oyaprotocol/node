/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                            Route Handlers                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Express route handlers for all API endpoints.
 * Defines RESTful routes for bundles, CIDs, balances, and vault nonces.
 *
 * Route groups:
 * - /bundle - Bundle management endpoints
 * - /cid - IPFS CID tracking endpoints
 * - /balance - Vault balance endpoints
 * - /nonce - Vault nonce management endpoints
 *
 * Note: POST routes are protected by bearer auth middleware applied globally.
 *
 * @packageDocumentation
 */

import { Router } from 'express'
import {
	saveBundle,
	getBundle,
	getAllBundles,
	saveCID,
	getCIDsByNonce,
	updateBalanceForOneToken,
	getBalanceForOneToken,
	getBalanceForAllTokens,
	getVaultNonce,
	setVaultNonce,
	healthCheck,
	getInfo,
} from './controllers.js'

const bundleRouter = Router()
const cidRouter = Router()
const balanceRouter = Router()
const vaultNonceRouter = Router()
const healthRouter = Router()
const infoRouter = Router()

// Bundle routes
bundleRouter.post('/', saveBundle)
bundleRouter.get('/:nonce', getBundle)
bundleRouter.get('/', getAllBundles)

// CID routes
cidRouter.post('/', saveCID)
cidRouter.get('/:nonce', getCIDsByNonce)

// Balance routes
balanceRouter.post('/', updateBalanceForOneToken)
balanceRouter.get('/:vault/:token', getBalanceForOneToken)
balanceRouter.get('/:vault', getBalanceForAllTokens)

// Vault nonce routes
vaultNonceRouter.get('/:vault', getVaultNonce)
vaultNonceRouter.post('/:vault', setVaultNonce)

// Health and info routes
healthRouter.get('/', healthCheck)
infoRouter.get('/', getInfo)

export {
	bundleRouter,
	cidRouter,
	balanceRouter,
	vaultNonceRouter,
	healthRouter,
	infoRouter,
}
