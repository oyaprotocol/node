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
import type { RouteMount } from './types/routes.js'
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
	detailedHealthCheck,
	getInfo,
	getMetrics,
	submitIntention,
	getFilecoinStatus,
	getVaultIdsByController,
	getControllersByVaultId,
	getRulesByVaultId,
	addControllerToVault,
	removeControllerFromVault,
	setRulesForVault,
} from './controllers.js'

/**
 * Route mount configuration
 *
 * Single source of truth for all route mounts. Used by:
 * - index.ts to mount routes on the Express app
 * - logger.ts to display available endpoints
 *
 * Each router is defined inline and configured with its routes.
 *
 * @public
 */
export const routeMounts: RouteMount[] = [
	{
		basePath: '/health',
		router: Router()
			.get('/', healthCheck)
			.get('/detailed', detailedHealthCheck),
	},
	{
		basePath: '/info',
		router: Router().get('/', getInfo),
	},
	{
		basePath: '/metrics',
		router: Router().get('/', getMetrics),
	},
	{
		basePath: '/intention',
		router: Router().post('/', submitIntention),
	},
	{
		basePath: '/bundle',
		router: Router()
			.post('/', saveBundle)
			.get('/:nonce', getBundle)
			.get('/', getAllBundles),
	},
	{
		basePath: '/cid',
		router: Router().post('/', saveCID).get('/:nonce', getCIDsByNonce),
	},
	{
		basePath: '/balance',
		router: Router()
			.post('/', updateBalanceForOneToken)
			.get('/:vault/:token', getBalanceForOneToken)
			.get('/:vault', getBalanceForAllTokens),
	},
	{
		basePath: '/nonce',
		router: Router()
			.get('/:vault', getVaultNonce)
			.post('/:vault', setVaultNonce),
	},
	{
		basePath: '/filecoin',
		router: Router().get('/status/:cid', getFilecoinStatus),
	},
	{
		basePath: '/vault',
		router: Router()
			.get('/by-controller/:address', getVaultIdsByController)
			.get('/:vaultId/controllers', getControllersByVaultId)
			.get('/:vaultId/rules', getRulesByVaultId)
			.post('/:vaultId/controllers/add', addControllerToVault)
			.post('/:vaultId/controllers/remove', removeControllerFromVault)
			.post('/:vaultId/rules', setRulesForVault),
	},
]
