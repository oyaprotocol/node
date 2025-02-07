// Need to add authorization to routes, so that only the blockr can call POST routes.
import { Router } from 'express';
import { saveBlock, getBlock, getAllBlocks, saveCID, getCIDsByNonce, updateBalanceForOneToken, getBalanceForOneToken, getBalanceForAllTokens, getVaultNonce, setVaultNonce } from './controllers.js';
const blockRouter = Router();
const cidRouter = Router();
const balanceRouter = Router();
const vaultNonceRouter = Router();
// Block routes
blockRouter.post('/', saveBlock);
blockRouter.get('/:nonce', getBlock);
blockRouter.get('/', getAllBlocks);
// CID routes
cidRouter.post('/', saveCID);
cidRouter.get('/:nonce', getCIDsByNonce);
// Balance routes
balanceRouter.post('/', updateBalanceForOneToken);
balanceRouter.get('/:vault/:token', getBalanceForOneToken);
balanceRouter.get('/:vault', getBalanceForAllTokens);
// Vault nonce routes
vaultNonceRouter.get('/:vault', getVaultNonce);
vaultNonceRouter.post('/:vault', setVaultNonce);
export { blockRouter, cidRouter, balanceRouter, vaultNonceRouter };
