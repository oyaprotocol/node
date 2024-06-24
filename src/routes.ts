import { Router } from 'express';
import { saveBundle, getBundle, getAllBundles, saveCID, getCIDsByNonce } from './controllers';

const bundleRouter = Router();
const cidRouter = Router();

// Bundle routes
bundleRouter.post('/', saveBundle);
bundleRouter.get('/:nonce', getBundle);
bundleRouter.get('/', getAllBundles);

// CID routes
cidRouter.post('/', saveCID);
cidRouter.get('/:nonce', getCIDsByNonce);

export { bundleRouter, cidRouter };
