"use strict";
// Need to add authorization to routes, so that only the blockr can call POST routes.
Object.defineProperty(exports, "__esModule", { value: true });
exports.vaultNonceRouter = exports.balanceRouter = exports.cidRouter = exports.blockRouter = void 0;
const express_1 = require("express");
const controllers_1 = require("./controllers");
const blockRouter = (0, express_1.Router)();
exports.blockRouter = blockRouter;
const cidRouter = (0, express_1.Router)();
exports.cidRouter = cidRouter;
const balanceRouter = (0, express_1.Router)();
exports.balanceRouter = balanceRouter;
const vaultNonceRouter = (0, express_1.Router)();
exports.vaultNonceRouter = vaultNonceRouter;
// Block routes
blockRouter.post('/', controllers_1.saveBlock);
blockRouter.get('/:nonce', controllers_1.getBlock);
blockRouter.get('/', controllers_1.getAllBlocks);
// CID routes
cidRouter.post('/', controllers_1.saveCID);
cidRouter.get('/:nonce', controllers_1.getCIDsByNonce);
// Balance routes
balanceRouter.post('/', controllers_1.updateBalanceForOneToken);
balanceRouter.get('/:vault/:token', controllers_1.getBalanceForOneToken);
balanceRouter.get('/:vault', controllers_1.getBalanceForAllTokens);
// Vault nonce routes
vaultNonceRouter.get('/:vault', controllers_1.getVaultNonce);
vaultNonceRouter.post('/:vault', controllers_1.setVaultNonce);
