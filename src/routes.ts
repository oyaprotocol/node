import { Router } from 'express';
import { saveBundle, getBundle } from './controllers';

const router = Router();

router.post('/', saveBundle);
router.get('/:nonce', getBundle);

export { router as bundleRouter };
