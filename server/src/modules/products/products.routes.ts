import { Router } from 'express';
import { ProductController } from './products.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requirePolicy } from '../../middlewares/role';

const router = Router();

router.use(authMiddleware);
router.use(requirePolicy('PRODUCTS_CATALOG_ACCESS'));

router.get('/', ProductController.getAll);
router.get('/:id', ProductController.getById);
router.post('/', requirePolicy('PRODUCTS_CATALOG_MANAGE', 'PRODUCTS_CATALOG_CREATE'), ProductController.create);
router.put('/:id', requirePolicy('PRODUCTS_CATALOG_MANAGE'), ProductController.update);
router.delete('/:id', requirePolicy('PRODUCTS_CATALOG_MANAGE'), ProductController.delete);

export default router;
