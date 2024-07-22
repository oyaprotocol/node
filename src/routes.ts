import { Router } from 'express';
import { saveBundle, getBundle, getAllBundles, saveCID, getCIDsByNonce, updateBalanceForOneToken } from './controllers';

const bundleRouter = Router();
const cidRouter = Router();

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

export { bundleRouter, cidRouter };
