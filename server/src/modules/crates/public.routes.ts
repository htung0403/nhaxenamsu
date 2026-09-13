import { Router } from 'express';
import { successResponse, errorResponse } from '../../utils/response';
import { CratesService, CrateReceiptType } from './crates.service';

const router = Router();

router.get('/:type/:id/:token', async (req, res) => {
  try {
    const { type, id, token } = req.params;
    if (!['intake', 'allocation', 'delivery'].includes(type)) {
      return res.status(400).json(errorResponse('Loại phiếu két không hợp lệ'));
    }
    if (!CratesService.verifyReceiptToken(type, id, token)) {
      return res.status(403).json(errorResponse('Mã xác thực không hợp lệ'));
    }
    const data = await CratesService.getReceipt(type as CrateReceiptType, id);
    return res.status(200).json(successResponse(data));
  } catch (err: any) {
    return res.status(400).json(errorResponse(err.message));
  }
});

export default router;
