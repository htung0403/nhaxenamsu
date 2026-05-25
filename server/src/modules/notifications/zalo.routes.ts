import { Router } from 'express';
import { zaloService } from './zalo.service';
import type { SummaryDispatchType } from './zalo.service';
import { supabaseService } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { authMiddleware } from '../../middlewares/auth';
import { requireRolesOnly } from '../../middlewares/role';
import { successResponse, errorResponse } from '../../utils/response';

const router = Router();
router.use(authMiddleware);

const normalizePhoneForAuth = (phone: string): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('84')) return `+${digits}`;
  if (digits.startsWith('0')) return `+84${digits.slice(1)}`;
  return `+84${digits}`;
};

type SummaryDispatchInputType = SummaryDispatchType | 'grocery_receiver';

const isValidSummaryType = (type: string): type is SummaryDispatchInputType => {
  return type === 'grocery' || type === 'grocery_receiver' || type === 'supplier' || type === 'sender';
};

const normalizeSummaryType = (type: SummaryDispatchInputType): SummaryDispatchType => {
  return type === 'grocery_receiver' ? 'grocery' : type;
};

const normalizeSummaryDate = (rawDate: string): string | null => {
  const value = String(rawDate || '').trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slashMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  const dashMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) {
    const [, dd, mm, yyyy] = dashMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
};

// GET /api/notifications/zalo/qr
router.get('/qr', async (req, res) => {
  try {
    const qrBase64 = await zaloService.generateLoginQR(supabaseService);
    res.json({ qrBase64 });
  } catch (err) {
    logger.error('[ZaloRoutes] Failed to generate QR:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/notifications/zalo/status
router.get('/status', async (req, res) => {
  const qrState = zaloService.getQRStatus();
  
  // If not in QR flow, check the actual connection status
  if (qrState.status === 'idle' || qrState.status === 'success') {
    const connection = await zaloService.checkConnection();
    res.json({
      ...qrState,
      connected: connection.connected,
      connectionError: connection.error
    });
  } else {
    res.json(qrState);
  }
});

router.get('/summary-status', async (req, res) => {
  try {
    const inputType = String(req.query.type || '');
    const dateInput = String(req.query.date || '');

    if (!isValidSummaryType(inputType)) {
      return res.status(400).json(errorResponse('Loại tổng kết không hợp lệ'));
    }
    const type = normalizeSummaryType(inputType);
    const date = normalizeSummaryDate(dateInput);
    const withDebug = String(req.query.debug || '') === '1';
    if (!date) {
      return res.status(400).json(errorResponse('Ngày không hợp lệ, định dạng đúng: YYYY-MM-DD'));
    }

    const items = await zaloService.getSummaryDispatchStatusList(supabaseService, type, date);
    const summary = {
      total: items.length,
      sent: items.filter((item) => item.status === 'success').length,
      failed: items.filter((item) => item.status === 'failed').length,
      skipped: items.filter((item) => item.status === 'skipped').length,
      pending: items.filter((item) => item.status === 'pending').length,
    };

    const shouldAttachDebug = type === 'grocery' && (withDebug || items.length === 0);
    const debug =
      shouldAttachDebug
        ? await zaloService.getGrocerySummaryDiagnostics(supabaseService, date)
        : undefined;

    return res.json(successResponse({ type, date, summary, items, ...(debug ? { debug } : {}) }));
  } catch (err: any) {
    logger.error('[ZaloRoutes] Failed to get summary status list:', err);
    return res.status(500).json(errorResponse(err?.message || 'Lỗi lấy trạng thái tổng kết'));
  }
});

router.post('/send-summary', async (req, res) => {
  try {
    const inputType = String(req.body?.type || '');
    const targetId = String(req.body?.targetId || '');
    const dateInput = String(req.body?.date || '');

    if (!isValidSummaryType(inputType)) {
      return res.status(400).json(errorResponse('Loại tổng kết không hợp lệ'));
    }
    const type = normalizeSummaryType(inputType);
    if (!targetId) {
      return res.status(400).json(errorResponse('Thiếu targetId'));
    }
    const date = normalizeSummaryDate(dateInput);
    if (!date) {
      return res.status(400).json(errorResponse('Ngày không hợp lệ, định dạng đúng: YYYY-MM-DD'));
    }

    const result = await zaloService.sendSummaryForTarget(
      supabaseService,
      logger,
      normalizePhoneForAuth,
      {
        type,
        targetId,
        date,
        triggeredBy: 'manual',
      },
    );

    return res.json(successResponse(result));
  } catch (err: any) {
    logger.error('[ZaloRoutes] Failed to send summary:', err);
    return res.status(500).json(errorResponse(err?.message || 'Lỗi gửi tổng kết'));
  }
});

router.post('/send-vegetable-arrival', requireRolesOnly('admin'), async (req, res) => {
  try {
    const date = normalizeSummaryDate(String(req.body?.date || ''));
    const taiRank = Number(req.body?.taiRank);

    if (!date) {
      return res.status(400).json(errorResponse('Ngày không hợp lệ, định dạng đúng: YYYY-MM-DD'));
    }

    if (!Number.isInteger(taiRank) || taiRank < 1) {
      return res.status(400).json(errorResponse('Tài không hợp lệ'));
    }

    const result = await zaloService.sendVegetableArrivalNoticeForTai(
      supabaseService,
      logger,
      normalizePhoneForAuth,
      { date, taiRank },
    );

    return res.json(successResponse(result));
  } catch (err: any) {
    logger.error('[ZaloRoutes] Failed to send vegetable arrival notices:', err);
    return res.status(500).json(errorResponse(err?.message || 'Lỗi gửi thông báo Zalo cho vựa rau'));
  }
});

export default router;
