import { Router } from 'express';
import { saveBundle, getBundle, getAllBundles, saveCID, getCIDsByNonce } from './controllers';

const router = Router();

router.post('/', saveBundle);
router.get('/:nonce', getBundle);
router.get('/', getAllBundles);
router.post('/cid', saveCID);
router.get('/cid/:nonce', getCIDsByNonce);

export { router as bundleRouter };
