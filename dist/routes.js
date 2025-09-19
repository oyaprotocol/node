// Need to add authorization to routes, so that only the bundle proposer can call POST routes.
import { Router } from 'express';
import { saveBundle, getBundle, getAllBundles, saveCID, getCIDsByNonce, updateBalanceForOneToken, getBalanceForOneToken, getBalanceForAllTokens, getVaultNonce, setVaultNonce } from './controllers.js';
const bundleRouter = Router();
const cidRouter = Router();
const balanceRouter = Router();
const vaultNonceRouter = Router();
// Bundle routes
bundleRouter.post('/', saveBundle);
bundleRouter.get('/:nonce', getBundle);
bundleRouter.get('/', getAllBundles);
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
export { bundleRouter, cidRouter, balanceRouter, vaultNonceRouter };
