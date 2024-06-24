import { Router } from 'express';
import { saveBundle, getBundle, getAllBundles } from './controllers';

const router = Router();

router.post('/', saveBundle);
router.get('/:nonce', getBundle);
router.get('/', getAllBundles);

export { router as bundleRouter };
