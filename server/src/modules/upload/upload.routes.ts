import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './upload.controller';
import { authMiddleware } from '../../middlewares/auth';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  }
});

router.use(authMiddleware);

router.post('/signature', UploadController.createUploadSignature);
router.post('/', upload.single('file'), UploadController.uploadFile);

export default router;
