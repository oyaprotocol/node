import { Router } from 'express';
import { saveBundle, getBundle, getAllBundles, saveCID, getCIDsByNonce, updateBalanceForOneToken, getBalanceForOneToken, getBalanceForAllTokens, getAccountNonce, setAccountNonce } from './controllers';

const bundleRouter = Router();
const cidRouter = Router();
const balanceRouter = Router();
const accountNonceRouter = Router();

// Bundle routes
bundleRouter.post('/', saveBundle);
bundleRouter.get('/:nonce', getBundle);
bundleRouter.get('/', getAllBundles);

// CID routes
cidRouter.post('/', saveCID);
cidRouter.get('/:nonce', getCIDsByNonce);

// Balance routes
balanceRouter.post('/', updateBalanceForOneToken);
balanceRouter.get('/:account/:token', getBalanceForOneToken);
balanceRouter.get('/:account', getBalanceForAllTokens);

// Account nonce routes
accountNonceRouter.get('/:account', getAccountNonce);
accountNonceRouter.post('/:account', setAccountNonce);

export { bundleRouter, cidRouter, balanceRouter, accountNonceRouter };
