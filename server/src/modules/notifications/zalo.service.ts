import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { format } from 'date-fns';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { DeliveryNoteGenerator } from '../../utils/deliveryNoteGenerator';
import {
  assignVegetableTaiRanksByDate,
  buildVegetableDailyDriverRankMap,
  getVegetableTaiRank,
} from '../../utils/vegetableTaiRank';

// zca-js exports vary by module mode; require() keeps this service compatible in this codebase.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Zalo, ThreadType } = require('zca-js') as {
  Zalo: new (options?: Record<string, unknown>) => any;
  ThreadType: { User: number; Group: number };
};

const VEGETABLE_SUMMARY_IMAGE_HINT = 'Nhấn vào ảnh để xem chi tiết mối rau, tài , số xe, tài xế';

type ZcaApi = any;
type ZcaCredentials = {
  imei: string;
  cookie: unknown;
  userAgent: string;
  language?: string;
};
type ZcaAttachmentSource = {
  data: Buffer;
  filename: `${string}.${string}`;
  metadata: {
    totalSize: number;
    width?: number;
    height?: number;
  };
};

export interface SendImageMessageOptions {
  recipientPhone: string;
  imageUrls: string[];
  caption?: string;
  retryCount?: number;
  attachments?: ZcaAttachmentSource[];
}

export interface SendImageMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
  recipientPhone: string;
}

export type SummaryDispatchType = 'grocery' | 'supplier' | 'sender';
type SummaryDispatchStatus = 'success' | 'failed' | 'skipped';
type SummaryDispatchTrigger = 'scheduler' | 'manual';

type SummaryDispatchLogPayload = {
  summaryType: SummaryDispatchType | 'vegetable_arrival';
  summaryDate: string;
  targetCustomerId: string;
  targetName: string;
  targetPhone: string | null;
  publicLink: string;
  status: SummaryDispatchStatus;
  errorMessage?: string | null;
  messageId?: string | null;
  triggeredBy: SummaryDispatchTrigger;
};

type SummaryRecipient = {
  id: string;
  name: string;
  phone: string | null;
};

type SummaryStatusListItem = {
  targetId: string;
  targetName: string;
  targetPhone: string | null;
  orderCount: number;
  itemRowCount: number;
  publicLink: string;
  status: 'pending' | SummaryDispatchStatus;
  lastError: string | null;
  messageId: string | null;
  lastSentAt: string | null;
  triggeredBy: SummaryDispatchTrigger | null;
};

type VegetableArrivalNoticeStatus = 'success' | 'failed' | 'skipped';

type VegetableArrivalNoticeTarget = {
  id: string;
  name: string;
  phone: string | null;
  orders: any[];
};

type VegetableArrivalNoticeItem = {
  targetId: string;
  targetName: string;
  targetPhone: string | null;
  orderCount: number;
  status: VegetableArrivalNoticeStatus;
  error?: string | null;
  messageId?: string | null;
};

type VegetableArrivalNoticeResult = {
  date: string;
  taiRank: number;
  totalTargets: number;
  sent: number;
  failed: number;
  skipped: number;
  items: VegetableArrivalNoticeItem[];
};

type VegetableArrivalNoticeStatusItem = {
  targetId: string;
  targetName: string;
  targetPhone: string | null;
  orderCount: number;
  status: 'pending' | VegetableArrivalNoticeStatus;
  lastError: string | null;
  messageId: string | null;
  lastSentAt: string | null;
  triggeredBy: SummaryDispatchTrigger | null;
};

export class ZaloService {
  private zaloClient: any;
  private api: ZcaApi | null = null;
  private loginPromise: Promise<ZcaApi> | null = null;
  private readonly enableSends: boolean;

  private qrLoginState: {
    status: 'idle' | 'generating' | 'waiting' | 'success' | 'failed';
    qrBase64?: string;
    error?: string;
  } = { status: 'idle' };

  constructor() {
    this.zaloClient = new Zalo({
      logging: false,
      checkUpdate: false,
      selfListen: false,
    });
    this.enableSends = process.env.ZALO_ENABLE_SENDS === 'true';
  }

  private async notifyAdmins(
    supabaseService: any,
    title: string,
    description: string,
    type: 'info' | 'warning' | 'success' = 'warning',
  ): Promise<void> {
    try {
      const { data: admins } = await supabaseService
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (!admins || admins.length === 0) return;

      const notifications = admins.map((admin: { id: string }) => ({
        user_id: admin.id,
        title,
        description,
        type,
        is_read: false,
        created_at: new Date().toISOString(),
      }));

      await supabaseService.from('notifications').insert(notifications);
    } catch (err) {
      logger.error('[ZaloService] Failed to notify admins:', err);
    }
  }

  private getPublicClientUrl(): string {
    const normalizeUrl = (value: string) => value.replace(/\/+$/, '');
    const configuredUrl = (process.env.CLIENT_URL || env.CLIENT_URL || '').trim();
    const isLocalhostUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredUrl);

    if (configuredUrl && !(process.env.NODE_ENV === 'production' && isLocalhostUrl)) {
      return normalizeUrl(configuredUrl);
    }

    const vercelHost = (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '').trim();
    if (vercelHost) {
      const host = vercelHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      if (host) return `https://${host}`;
    }

    return 'https://nhaxenamsu.vercel.app';
  }

  private formatDisplayDate(date: string): string {
    const value = new Date(`${date}T00:00:00`);
    if (Number.isNaN(value.getTime())) return date;
    return format(value, 'dd/MM/yyyy');
  }

  private buildSummaryPublicLink(type: SummaryDispatchType, targetId: string, date: string): string {
    const token = this.generatePublicToken(type, targetId, date);
    const path = type === 'grocery' ? 'summary/grocery' : `vegetable-orders/${type}`;
    return `${this.getPublicClientUrl()}/public/${path}/${targetId}/${date}/${token}`;
  }

  private async upsertSummaryDispatchLog(supabaseService: any, payload: SummaryDispatchLogPayload): Promise<void> {
    const row = {
      summary_type: payload.summaryType,
      summary_date: payload.summaryDate,
      target_customer_id: payload.targetCustomerId,
      target_name: payload.targetName,
      target_phone: payload.targetPhone,
      public_link: payload.publicLink,
      status: payload.status,
      error_message: payload.errorMessage || null,
      message_id: payload.messageId || null,
      triggered_by: payload.triggeredBy,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseService
      .from('zalo_summary_dispatch_logs')
      .upsert(row, { onConflict: 'summary_type,summary_date,target_customer_id' });

    if (error) {
      logger.error('[ZaloService] Failed to upsert summary dispatch log:', error);
    }
  }

  private normalizePhoneSafe(
    normalizePhoneForAuth: (phone: string) => string | null,
    phone: string | null | undefined,
  ): string | null {
    if (!phone) return null;
    try {
      return normalizePhoneForAuth(phone);
    } catch {
      return null;
    }
  }

  /**
   * Generates a secure HMAC token for public summary access
   */
  generatePublicToken(type: string, id: string, date: string): string {
    const data = `${type}:${id}:${date}`;
    return crypto.createHmac('sha256', env.JWT_SECRET).update(data).digest('hex');
  }

  /**
   * Verifies a public summary token
   */
  verifyPublicToken(type: string, id: string, date: string, token: string): boolean {
    const expected = this.generatePublicToken(type, id, date);
    return expected === token;
  }

  async refreshAccessToken(): Promise<boolean> {
    return true;
  }

  async sendImageMessage(options: SendImageMessageOptions): Promise<SendImageMessageResult> {
    const { recipientPhone, imageUrls, caption = '', attachments: providedAttachments } = options;

    if (!this.enableSends) {
      return {
        success: false,
        error: 'Zalo send is disabled by config (ZALO_ENABLE_SENDS !== true)',
        recipientPhone,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const api = await this.ensureApi();
      const threadId = await this.resolveUserThreadIdByPhone(api, recipientPhone);

      if (!threadId) {
        return {
          success: false,
          error: `Cannot resolve Zalo user from phone ${recipientPhone}`,
          recipientPhone,
          timestamp: new Date().toISOString(),
        };
      }

      const fetchedAttachments = await this.buildImageAttachments(imageUrls);
      const attachments = [...(providedAttachments || []), ...fetchedAttachments];

      if (attachments.length === 0) {
        if (!caption || !caption.trim()) {
          return {
            success: false,
            error: 'No image attachments provided and empty text message',
            recipientPhone,
            timestamp: new Date().toISOString(),
          };
        }

        const response = await api.sendMessage(
          { msg: caption.trim() },
          threadId,
          ThreadType.User,
        );

        const messageId = response?.message?.msgId
          ? String(response.message.msgId)
          : undefined;

        logger.info(`[ZaloService] Text message sent to ${recipientPhone} (thread ${threadId})`);

        return {
          success: true,
          messageId,
          recipientPhone,
          timestamp: new Date().toISOString(),
        };
      }

      const response = await api.sendMessage(
        {
          msg: caption || 'Hình ảnh từ đơn hàng của bạn',
          attachments,
        },
        threadId,
        ThreadType.User,
      );

      const messageId = response?.message?.msgId
        ? String(response.message.msgId)
        : response?.attachment?.[0]?.msgId
          ? String(response.attachment[0].msgId)
          : undefined;

      logger.info(`[ZaloService] Message sent to ${recipientPhone} (thread ${threadId})`);

      return {
        success: true,
        messageId,
        recipientPhone,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown error';
      logger.error(`[ZaloService] Failed to send to ${recipientPhone}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        recipientPhone,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async generateLoginQR(supabaseService: any): Promise<string> {
    if (this.qrLoginState.status === 'generating' || this.qrLoginState.status === 'waiting') {
      if (this.qrLoginState.qrBase64) return this.qrLoginState.qrBase64;
    }

    this.qrLoginState = { status: 'generating' };

    try {
      const qrPath = path.resolve(process.cwd(), 'tmp', `qr-${Date.now()}.png`);
      const qrDir = path.dirname(qrPath);
      if (!require('node:fs').existsSync(qrDir)) {
        require('node:fs').mkdirSync(qrDir, { recursive: true });
      }

      const userAgent =
        process.env.ZCA_USER_AGENT ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

      this.zaloClient
        .loginQR(
          {
            qrPath,
            userAgent,
          },
          async (event: any) => {
            logger.info(`[ZaloService] QR Login Event: Type ${event?.type}`);

            if (event?.type === 0) {
              // QR Generated
              if (event.actions?.saveToFile) {
                await event.actions.saveToFile(qrPath);
              }
              const qrBuffer = await require('node:fs/promises').readFile(qrPath);
              this.qrLoginState.qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
              this.qrLoginState.status = 'waiting';
              // Clean up temp file
              try {
                require('node:fs').unlinkSync(qrPath);
              } catch (e) { }
            } else if (event?.type === 2) {
              this.qrLoginState.status = 'waiting';
            } else if (event?.type === 4) {
              this.qrLoginState.status = 'success';
            } else if (event?.type === 1 || event?.type === 3) {
              this.qrLoginState.status = 'failed';
              this.qrLoginState.error = 'QR Expired or Declined';
            }
          },
        )
        .then(async (api: any) => {
          this.api = api;
          const context = api.getContext();
          const credentials = {
            cookie: context.cookie.toJSON()?.cookies || [],
            imei: context.imei,
            userAgent: context.userAgent,
            language: context.language || 'vi',
          };

          await supabaseService.from('general_settings').upsert({
            setting_key: 'ZCA_CREDENTIALS',
            setting_value: JSON.stringify(credentials),
            updated_at: new Date().toISOString(),
          });

          logger.info('[ZaloService] QR Login successful and credentials saved to DB');
        })
        .catch((err: any) => {
          logger.error('[ZaloService] QR Login failed:', err);
          this.qrLoginState.status = 'failed';
          this.qrLoginState.error = String(err);
        });

      let attempts = 0;
      while (attempts < 30) {
        if (this.qrLoginState.qrBase64) return this.qrLoginState.qrBase64;
        if (this.qrLoginState.status === 'failed') throw new Error(this.qrLoginState.error);
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
      }

      throw new Error('Timeout waiting for QR generation');
    } catch (err) {
      this.qrLoginState.status = 'failed';
      this.qrLoginState.error = String(err);
      throw err;
    }
  }

  getQRStatus() {
    return this.qrLoginState;
  }

  /**
   * Proactively checks if the current/saved credentials are valid.
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const api = await this.ensureApi();
      if (api && typeof api === 'object') {
        return { connected: true };
      }
      return { connected: false, error: 'API not initialized' };
    } catch (err) {
      this.api = null;
      this.loginPromise = null;
      return { connected: false, error: String(err) };
    }
  }

  private async ensureApi(): Promise<ZcaApi> {
    if (this.api) return this.api;
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = (async () => {
      try {
        let credentials: any = null;

        const { supabaseService } = require('../../config/supabase');
        const { data: dbCreds } = await supabaseService
          .from('general_settings')
          .select('setting_value')
          .eq('setting_key', 'ZCA_CREDENTIALS')
          .maybeSingle();

        if (dbCreds?.setting_value) {
          credentials = JSON.parse(dbCreds.setting_value);
          logger.info('[ZaloService] Loading credentials from Database');
        } else if (process.env.ZCA_CREDENTIALS_JSON) {
          credentials = JSON.parse(process.env.ZCA_CREDENTIALS_JSON);
          logger.info('[ZaloService] Loading credentials from ENV JSON');
        } else if (process.env.ZCA_CREDENTIALS_PATH) {
          const credPath = path.resolve(process.cwd(), process.env.ZCA_CREDENTIALS_PATH);
          if (require('node:fs').existsSync(credPath)) {
            const content = require('node:fs').readFileSync(credPath, 'utf8');
            credentials = JSON.parse(content);
            logger.info('[ZaloService] Loading credentials from File');
          }
        }

        if (!credentials) {
          throw new Error('No Zalo credentials found in DB, ENV, or File. Please login via QR.');
        }

        try {
          const api = await this.zaloClient.login(credentials);
          this.api = api;
          return api;
        } catch (loginErr: any) {
          // Credentials exist in DB but are invalid/expired - clear them so user can re-login
          const errorMsg = String(loginErr?.message || loginErr);
          logger.warn(`[ZaloService] Stored credentials invalid: ${errorMsg}. Clearing from DB.`);

          if (dbCreds?.setting_value) {
            try {
              await supabaseService
                .from('general_settings')
                .delete()
                .eq('setting_key', 'ZCA_CREDENTIALS');
              logger.info('[ZaloService] Cleared invalid ZCA_CREDENTIALS from database');
            } catch (deleteErr) {
              logger.error('[ZaloService] Failed to clear invalid credentials:', deleteErr);
            }
          }

          throw new Error(`Zalo session expired or invalid. Please login via QR code. (${errorMsg})`);
        }
      } catch (err) {
        this.loginPromise = null;
        throw err;
      } finally {
        this.loginPromise = null;
      }
    })();

    return this.loginPromise;
  }

  async sendDeliveryImagesImmediate(
    deliveryId: string,
    supabaseService: any,
    logger: any,
    normalizePhoneForAuth: (phone: string) => string | null,
    newAssignmentIds?: string[],
  ): Promise<void> {
    try {
      if (process.env.ZALO_ENABLE_SENDS !== 'true') {
        logger.info(`[ZaloService] Sends disabled (ZALO_ENABLE_SENDS != true), skipping delivery ${deliveryId}`);
        return;
      }

      const { data: shopNameSetting } = await supabaseService
        .from('general_settings')
        .select('setting_value')
        .eq('setting_key', 'SHOP_NAME')
        .maybeSingle();
      const shopName = shopNameSetting?.setting_value || 'Năm Sự';

      const { data: delivery, error } = await supabaseService
        .from('delivery_orders')
        .select(
          `
          *,
          import_orders (
            id, created_at, receiver_phone, customer_id, customers:customers!import_orders_customer_id_fkey (id, phone, name), selected_alias
          ),
          vegetable_orders (
            id, receiver_phone, customer_id, customers:customers!vegetable_orders_customer_id_fkey (id, phone, name), selected_alias
          ),
          delivery_vehicles (
            id, assigned_quantity, expected_amount, delivery_time, delivery_date, image_urls,
            profiles (full_name),
            vehicles (license_plate)
          )
        `,
        )
        .eq('id', deliveryId)
        .single();

      if (error || !delivery) {
        logger.error(`[ZaloService] Failed to fetch delivery ${deliveryId}:`, error);
        return;
      }

      // Skip immediate notification for vegetable orders as they only get end-of-day summary
      if (delivery.order_category === 'vegetable') {
        logger.info(`[ZaloService] Skipping immediate notification for vegetable delivery ${deliveryId}`);
        return;
      }

      const deliveryNoteBuffers: Buffer[] = [];
      const customerName =
        delivery.import_orders?.customers?.name ||
        delivery.import_orders?.selected_alias ||
        delivery.vegetable_orders?.customers?.name ||
        delivery.vegetable_orders?.selected_alias ||
        'Khách hàng';

      let assignmentsToNotify = (delivery.delivery_vehicles || []);
      if (newAssignmentIds && newAssignmentIds.length > 0) {
        assignmentsToNotify = assignmentsToNotify.filter((dv: any) => newAssignmentIds.includes(dv.id));
      } else if (newAssignmentIds) {
        logger.info(`[ZaloService] No new/modified assignments for delivery ${deliveryId}, skipping`);
        return;
      }

      for (const dv of assignmentsToNotify) {
        try {
          const noteBuffer = await DeliveryNoteGenerator.generatePng({
            shopName,
            customerName,
            deliveryTime:
              dv.delivery_time || delivery.delivery_time || format(new Date(), 'HH:mm'),
            quantity: dv.assigned_quantity || 0,
            productName: this.formatGroceryProductNameWithImportDate(delivery),
            price: dv.unit_price || delivery.unit_price || 0,
            total: dv.expected_amount || 0,
            deliveryDate:
              dv.delivery_date ||
              delivery.delivery_date ||
              format(new Date(), 'dd/MM/yyyy'),
            staffName: dv.profiles?.full_name || 'NV Giao hàng',
            licensePlate: dv.vehicles?.license_plate || '-',
          });
          deliveryNoteBuffers.push(noteBuffer);
        } catch (genErr) {
          logger.error(`[ZaloService] Failed to generate delivery note for assignment:`, genErr);
        }
      }

      const noteAttachments: ZcaAttachmentSource[] = deliveryNoteBuffers.map((buf, i) => ({
        data: buf,
        filename: `phieu-giao-hang-${deliveryId}-${Date.now()}-${i}.png`,
        metadata: {
          totalSize: buf.length,
        },
      }));

      const recipientPhone = this.buildRecipientPhoneForDelivery(delivery);
      if (!recipientPhone) {
        logger.warn(`[ZaloService] Delivery ${deliveryId}: no recipient phone found, skipping`);
        return;
      }

      const normalizedPhone = normalizePhoneForAuth(recipientPhone);
      if (!normalizedPhone) {
        logger.warn(`[ZaloService] Delivery ${deliveryId}: phone normalization failed for ${recipientPhone}`);
        return;
      }

      const clientUrl = this.getPublicClientUrl();

      const result = await this.sendImageMessage({
        recipientPhone: normalizedPhone,
        imageUrls: [],
        attachments: noteAttachments,
        caption: `Xem chi tiết: ${clientUrl}/don-giao/${delivery.id}`,
      });

      if (result.success) {
        logger.info(`[ZaloService] Immediate send successful for delivery ${deliveryId}, message ${result.messageId}`);
      } else {
        logger.error(`[ZaloService] Immediate send failed for delivery ${deliveryId}: ${result.error}`);
      }
    } catch (err) {
      logger.error(`[ZaloService] Exception in sendDeliveryImagesImmediate:`, err);
    }
  }

  private async resolveUserThreadIdByPhone(api: ZcaApi, phone: string): Promise<string | null> {
    const overrideMapJson = process.env.ZCA_RECIPIENT_MAP_JSON;
    if (overrideMapJson) {
      try {
        const mapped = JSON.parse(overrideMapJson) as Record<string, string>;
        if (mapped[phone]) return mapped[phone];
      } catch (err) {
        logger.warn('[ZaloService] Invalid ZCA_RECIPIENT_MAP_JSON:', err);
      }
    }

    const result: any = await api.findUser(phone);
    // Prefer direct uid fields from findUser response for deterministic resolution.
    const directId = result?.uid || result?.userId || result?.data?.uid || result?.data?.userId || result?.data?.id;
    if (directId) {
      return String(directId);
    }

    // Fallback only when direct uid is unavailable.
    const changedProfiles = result?.changed_profiles as Record<string, unknown> | undefined;
    if (changedProfiles && typeof changedProfiles === 'object') {
      const keys = Object.keys(changedProfiles);
      if (keys.length > 0) {
        return String(keys[0]).split('_')[0] || null;
      }
    }

    return null;
  }

  private async buildImageAttachments(imageUrls: string[]): Promise<ZcaAttachmentSource[]> {
    const limitedUrls = imageUrls.slice(0, 5);
    const attachments: ZcaAttachmentSource[] = [];

    for (let i = 0; i < limitedUrls.length; i++) {
      const url = limitedUrls[i];
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        const data = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const ext = this.extensionFromContentType(contentType);

        attachments.push({
          data,
          filename: `delivery-${Date.now()}-${i}.${ext}`,
          metadata: {
            totalSize: data.length,
          },
        });
      } catch (err) {
        logger.warn(`[ZaloService] Failed to fetch attachment from URL ${url}:`, err);
      }
    }

    return attachments;
  }

  private extensionFromContentType(contentType: string): string {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    return 'jpg';
  }

  async sendDailySummaries(supabaseService: any, logger: any, normalizePhoneForAuth: (phone: string) => string | null, targetCustomerId?: string): Promise<void> {
    try {
      if (process.env.ZALO_ENABLE_SENDS !== 'true') return;

      const today = format(new Date(), 'yyyy-MM-dd');
      
      // 0. Distributed Lock: Check if already run today to avoid double sending from multiple instances
      const { data: lastRun } = await supabaseService
        .from('general_settings')
        .select('setting_value')
        .eq('setting_key', 'ZALO_LAST_SUMMARY_RUN')
        .maybeSingle();

      if (!targetCustomerId && lastRun?.setting_value === today) {
        logger.info(`[ZaloService] Daily summary already processed for ${today}, skipping.`);
        return;
      }

      // Mark as run immediately (best-effort lock)
      if (!targetCustomerId) {
        await supabaseService.from('general_settings').upsert({
          setting_key: 'ZALO_LAST_SUMMARY_RUN',
          setting_value: today,
          updated_at: new Date().toISOString(),
        });
      }

      logger.info(`[ZaloService] Starting daily summary generation for ${today}`);

      // 1. Fetch all assignments and orders for today
      const [assignmentsRes, ordersRes] = await Promise.all([
        supabaseService
          .from('delivery_vehicles')
          .select(`
            *,
            delivery_orders (
              id, product_name, delivery_date, unit_price, total_quantity, status,
              import_orders (
                created_at, receiver_phone, selected_alias, customers:customers!import_orders_customer_id_fkey (id, phone, name)
              ),
              vegetable_orders (
                receiver_phone, selected_alias, customers:customers!vegetable_orders_customer_id_fkey (id, phone, name)
              )
            ),
            profiles (full_name),
            vehicles (license_plate)
          `)
          .eq('delivery_date', today),
        supabaseService
          .from('delivery_orders')
          .select(`
            id, product_name, delivery_date, unit_price, total_quantity, status,
            import_orders (
              created_at, receiver_phone, selected_alias, customers:customers!import_orders_customer_id_fkey (id, phone, name)
            ),
            vegetable_orders (
              receiver_phone, selected_alias, customers:customers!vegetable_orders_customer_id_fkey (id, phone, name)
            ),
            delivery_vehicles ( assigned_quantity )
          `)
          .eq('delivery_date', today)
          .neq('status', 'hang_o_sg')
      ]);

      const assignments = assignmentsRes.data || [];
      const ordersToday = ordersRes.data || [];

      if (assignments.length === 0 && ordersToday.length === 0) {
        logger.info(`[ZaloService] No assignments or orders found for ${today}, skipping summary.`);
        return;
      }

      // 2. Group by customer phone
      const customerGroups: Record<string, {
        customerId: string;
        customerName: string;
        phone: string;
        items: any[];
        undeliveredOrderIds: Set<string>;
        undeliveredQuantity: number;
        groupedTotals: Map<string, { totalQuantity: number; assignedQuantity: number }>;
      }> = {};
      const customersWithoutPhone = new Map<string, { customerId: string; customerName: string }>();

      const processOrderForUndelivered = (order: any, phone: string, customerName: string, customerId: string) => {
        if (!customerGroups[phone]) {
          customerGroups[phone] = {
            customerId,
            customerName,
            phone,
            items: [],
            undeliveredOrderIds: new Set(),
            undeliveredQuantity: 0,
            groupedTotals: new Map(),
          };
        }

        if (!customerGroups[phone].undeliveredOrderIds.has(order.id)) {
          customerGroups[phone].undeliveredOrderIds.add(order.id);
          const groupKey = this.buildGroceryDeliveryGroupKey(order);
          const currentGroup = customerGroups[phone].groupedTotals.get(groupKey) || { totalQuantity: 0, assignedQuantity: 0 };
          const totalAssigned = (order.delivery_vehicles || []).reduce((sum: number, dv: any) => sum + (dv.assigned_quantity || 0), 0);
          currentGroup.totalQuantity += Number(order.total_quantity || 0);
          currentGroup.assignedQuantity += totalAssigned;
          customerGroups[phone].groupedTotals.set(groupKey, currentGroup);
        }
      };

      // Process all orders for today (to catch unassigned quantities)
      for (const order of ordersToday) {
        if (order.status === 'hang_o_sg') continue;

        const customerName =
          order.import_orders?.customers?.name ||
          order.import_orders?.selected_alias ||
          order.vegetable_orders?.customers?.name ||
          order.vegetable_orders?.selected_alias ||
          'Khách hàng';

        const customerId = order.import_orders?.customers?.id || order.vegetable_orders?.customers?.id;
        if (!customerId) continue;
        const phone = this.buildRecipientPhoneForDelivery(order);
        if (!phone) {
          customersWithoutPhone.set(customerId, { customerId, customerName });
          continue;
        }

        processOrderForUndelivered(order, phone, customerName, customerId);
      }

      // Process assignments for today (builds items list)
      for (const dv of assignments) {
        const order = dv.delivery_orders;
        if (!order || order.status === 'hang_o_sg') continue;

        const customerName =
          order.import_orders?.customers?.name ||
          order.import_orders?.selected_alias ||
          order.vegetable_orders?.customers?.name ||
          order.vegetable_orders?.selected_alias ||
          'Khách hàng';

        const customerId = order.import_orders?.customers?.id || order.vegetable_orders?.customers?.id;
        if (!customerId) continue;
        const phone = this.buildRecipientPhoneForDelivery(order);
        if (!phone) {
          customersWithoutPhone.set(customerId, { customerId, customerName });
          continue;
        }

        if (!customerGroups[phone]) {
          customerGroups[phone] = {
            customerId,
            customerName,
            phone,
            items: [],
            undeliveredOrderIds: new Set(),
            undeliveredQuantity: 0,
            groupedTotals: new Map(),
          };
        }

        customerGroups[phone].items.push({
          deliveryTime: dv.delivery_time || format(new Date(), 'HH:mm'),
          licensePlate: dv.vehicles?.license_plate || '-',
          staffName: dv.profiles?.full_name || 'NV Giao hàng',
          quantity: dv.assigned_quantity || 0,
          productName: this.formatGroceryProductNameWithImportDate(order),
          price: dv.unit_price || order.unit_price || 0,
          total: dv.expected_amount || 0,
        });
      }

      // 3. Send summary link for each group
      for (const phone of Object.keys(customerGroups)) {
        const group = customerGroups[phone];
        group.undeliveredQuantity = 0;
        group.groupedTotals.forEach((totals) => {
          const undelivered = totals.totalQuantity - totals.assignedQuantity;
          if (undelivered > 0) {
            group.undeliveredQuantity += undelivered;
          }
        });

        // Filter by targetCustomerId if provided
        if (targetCustomerId && group.customerId !== targetCustomerId) continue;

        const publicLink = this.buildSummaryPublicLink('grocery', group.customerId, today);
        const normalizedPhone = this.normalizePhoneSafe(normalizePhoneForAuth, group.phone);
        if (!normalizedPhone) {
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'grocery',
            summaryDate: today,
            targetCustomerId: group.customerId,
            targetName: group.customerName,
            targetPhone: group.phone,
            publicLink,
            status: 'failed',
            errorMessage: 'Số điện thoại không hợp lệ',
            triggeredBy: 'scheduler',
          });
          continue;
        }

        try {
          if (group.items.length === 0 && group.undeliveredQuantity === 0) {
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'grocery',
              summaryDate: today,
              targetCustomerId: group.customerId,
              targetName: group.customerName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'skipped',
              errorMessage: 'Không có dữ liệu tổng kết để gửi',
              triggeredBy: 'scheduler',
            });
            continue;
          }

          let caption = `Phiếu tổng kết giao hàng ngày ${this.formatDisplayDate(today)}`;
          if (group.undeliveredQuantity > 0) {
            caption += `\n\nXin lỗi quý khách, hiện số kiện chưa được giao là ${group.undeliveredQuantity}. Mong quý khách thông cảm. Hẹn gặp lại vào ngày mai.`;
          } else {
            caption += `\n\nQuý khách đã được giao đủ hàng. Cảm ơn quý khách đã sử dụng dịch vụ.`;
          }

          const finalCaption = `${caption}\n\nXem chi tiết tại: ${publicLink}`;
          const attachments = await this.buildSummaryAttachments('grocery', {
            shopName: 'Năm Sự',
            customerName: group.customerName,
            date: this.formatDisplayDate(today),
            items: group.items,
          });

          const result = await this.sendImageMessage({
            recipientPhone: normalizedPhone,
            imageUrls: [],
            attachments,
            caption: finalCaption,
          });

          if (result.success) {
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'grocery',
              summaryDate: today,
              targetCustomerId: group.customerId,
              targetName: group.customerName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'success',
              messageId: result.messageId || null,
              triggeredBy: 'scheduler',
            });
            logger.info(`[ZaloService] Daily summary sent to ${group.customerName} (${normalizedPhone})`);
          } else {
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'grocery',
              summaryDate: today,
              targetCustomerId: group.customerId,
              targetName: group.customerName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'failed',
              errorMessage: result.error || 'Gửi thất bại',
              messageId: result.messageId || null,
              triggeredBy: 'scheduler',
            });
            logger.error(`[ZaloService] Failed to send summary to ${normalizedPhone}: ${result.error}`);
          }
        } catch (err) {
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'grocery',
            summaryDate: today,
            targetCustomerId: group.customerId,
            targetName: group.customerName,
            targetPhone: normalizedPhone,
            publicLink,
            status: 'failed',
            errorMessage: (err as any)?.message || 'exception',
            triggeredBy: 'scheduler',
          });
          logger.error(`[ZaloService] Error processing summary for ${group.customerName}:`, err);
        }
      }

      for (const customer of Array.from(customersWithoutPhone.values())) {
        await this.upsertSummaryDispatchLog(supabaseService, {
          summaryType: 'grocery',
          summaryDate: today,
          targetCustomerId: customer.customerId,
          targetName: customer.customerName,
          targetPhone: null,
          publicLink: this.buildSummaryPublicLink('grocery', customer.customerId, today),
          status: 'skipped',
          errorMessage: 'Thiếu số điện thoại',
          triggeredBy: 'scheduler',
        });
      }
    } catch (err) {
      logger.error(`[ZaloService] Exception in sendDailySummaries:`, err);
    }
  }

  async sendDailySupplierSummaries(supabaseService: any, logger: any, normalizePhoneForAuth: (phone: string) => string | null): Promise<void> {
    try {
      if (process.env.ZALO_ENABLE_SENDS !== 'true') return;

      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Distributed Lock: Check if already run today to avoid double sending
      const { data: lastRun } = await supabaseService
        .from('general_settings')
        .select('setting_value')
        .eq('setting_key', 'ZALO_LAST_SUPPLIER_SUMMARY_RUN')
        .maybeSingle();

      if (lastRun?.setting_value === today) {
        logger.info(`[ZaloService] Daily supplier summary already processed for ${today}, skipping.`);
        return;
      }

      logger.info(`[ZaloService] Starting daily supplier summary generation for ${today}`);

      // 1. Fetch all vegetable orders for today
      const { data: orders, error } = await supabaseService
        .from('vegetable_orders')
        .select(`
          *,
          customers:customers!vegetable_orders_customer_id_fkey(id, name, phone),
          vegetable_order_items(*, products(*)),
          delivery_orders(*, delivery_vehicles(*, vehicles(license_plate), profiles!driver_id(full_name)))
        `)
        .eq('order_date', today)
        .is('deleted_at', null);

      if (error) throw error;
      if (!orders || orders.length === 0) {
        logger.info(`[ZaloService] No vegetable orders found for ${today}, skipping supplier summary.`);
        return;
      }

      // 2. Build the global daily driver rank map (matching UI logic)
      const dailyDriverRankMap = buildVegetableDailyDriverRankMap(orders);

      // 3. Group by Supplier (customer_id)
      const supplierGroups: Record<string, { supplierId: string; supplierName: string; phone: string; orders: any[] }> = {};
      const suppliersWithoutPhoneMap = new Map<string, { supplierId: string; supplierName: string; orderCount: number }>();

      orders.forEach((order: any) => {
        const supplier = order.customers;
        if (!supplier) return;

        const phone = supplier.phone;
        if (!phone) {
          const key = String(supplier.id);
          const current = suppliersWithoutPhoneMap.get(key);
          if (current) {
            current.orderCount += 1;
          } else {
            suppliersWithoutPhoneMap.set(key, {
              supplierId: supplier.id,
              supplierName: supplier.name || '-',
              orderCount: 1,
            });
          }
          return;
        }

        if (!supplierGroups[supplier.id]) {
          supplierGroups[supplier.id] = {
            supplierId: supplier.id,
            supplierName: supplier.name,
            phone: phone,
            orders: [],
          };
        }
        supplierGroups[supplier.id].orders.push(order);
      });

      // 4. Process each supplier group
      const allSupplierIds = Object.keys(supplierGroups);
      const suppliersWithoutPhone = Array.from(suppliersWithoutPhoneMap.values());
      let sentCount = 0;
      let failedCount = 0;
      const invalidPhoneSuppliers: { supplierId: string; supplierName: string; phone: string }[] = [];
      const emptySummarySuppliers: { supplierId: string; supplierName: string }[] = [];
      const failedSuppliers: { supplierId: string; supplierName: string; phone: string; reason: string }[] = [];

      for (const supplierId of Object.keys(supplierGroups)) {
        const group = supplierGroups[supplierId];
        const publicLink = this.buildSummaryPublicLink('supplier', group.supplierId, today);
        const normalizedPhone = this.normalizePhoneSafe(normalizePhoneForAuth, group.phone);
        if (!normalizedPhone) {
          invalidPhoneSuppliers.push({
            supplierId: group.supplierId,
            supplierName: group.supplierName,
            phone: group.phone,
          });
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'supplier',
            summaryDate: today,
            targetCustomerId: group.supplierId,
            targetName: group.supplierName,
            targetPhone: group.phone,
            publicLink,
            status: 'failed',
            errorMessage: 'Số điện thoại không hợp lệ',
            triggeredBy: 'scheduler',
          });
          continue;
        }

        // Sort orders for this supplier group by time
        const sortedSupplierOrders = [...group.orders].sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return String(a.id).localeCompare(String(b.id));
        });

        const summaryItems = this.buildSupplierSummaryItemsFromOrders(sortedSupplierOrders, dailyDriverRankMap);

        if (summaryItems.length === 0) {
          emptySummarySuppliers.push({
            supplierId: group.supplierId,
            supplierName: group.supplierName,
          });
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'supplier',
            summaryDate: today,
            targetCustomerId: group.supplierId,
            targetName: group.supplierName,
            targetPhone: normalizedPhone,
            publicLink,
            status: 'skipped',
            errorMessage: 'Không có dữ liệu tổng kết để gửi',
            triggeredBy: 'scheduler',
          });
          continue;
        }

        try {
          const caption = `Phiếu tổng kết hàng đã nhận ngày ${this.formatDisplayDate(today)}. Cảm ơn vựa.\n\n${VEGETABLE_SUMMARY_IMAGE_HINT}\n\nXem chi tiết tại: ${publicLink}`;
          const attachments = await this.buildSummaryAttachments('supplier', {
            shopName: 'Nhà Xe Năm Sự',
            supplierName: group.supplierName,
            date: this.formatDisplayDate(today),
            items: summaryItems,
          });

          const result = await this.sendImageMessage({
            recipientPhone: normalizedPhone,
            imageUrls: [],
            attachments,
            caption,
          });

          if (result.success) {
            sentCount += 1;
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'supplier',
              summaryDate: today,
              targetCustomerId: group.supplierId,
              targetName: group.supplierName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'success',
              messageId: result.messageId || null,
              triggeredBy: 'scheduler',
            });
            logger.info(`[ZaloService] Daily supplier summary sent to ${group.supplierName} (${normalizedPhone})`);
          } else {
            failedCount += 1;
            failedSuppliers.push({
              supplierId: group.supplierId,
              supplierName: group.supplierName,
              phone: normalizedPhone,
              reason: result.error || 'unknown',
            });
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'supplier',
              summaryDate: today,
              targetCustomerId: group.supplierId,
              targetName: group.supplierName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'failed',
              errorMessage: result.error || 'Gửi thất bại',
              messageId: result.messageId || null,
              triggeredBy: 'scheduler',
            });
            logger.error(`[ZaloService] Failed to send supplier summary to ${normalizedPhone}: ${result.error}`);
          }
        } catch (err) {
          failedCount += 1;
          failedSuppliers.push({
            supplierId: group.supplierId,
            supplierName: group.supplierName,
            phone: normalizedPhone,
            reason: (err as any)?.message || 'exception',
          });
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'supplier',
            summaryDate: today,
            targetCustomerId: group.supplierId,
            targetName: group.supplierName,
            targetPhone: normalizedPhone,
            publicLink,
            status: 'failed',
            errorMessage: (err as any)?.message || 'exception',
            triggeredBy: 'scheduler',
          });
          logger.error(`[ZaloService] Error processing supplier summary for ${group.supplierName}:`, err);
        }
      }

      logger.info(
        `[ZaloService] Supplier summary stats ${today}: totalOrders=${orders.length}, groupsWithPhone=${allSupplierIds.length}, sent=${sentCount}, failed=${failedCount}, missingPhone=${suppliersWithoutPhone.length}, invalidPhone=${invalidPhoneSuppliers.length}, emptySummary=${emptySummarySuppliers.length}`
      );

      if (suppliersWithoutPhone.length > 0) {
        logger.warn(`[ZaloService] Suppliers skipped (missing phone): ${JSON.stringify(suppliersWithoutPhone)}`);
        for (const supplier of suppliersWithoutPhone) {
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'supplier',
            summaryDate: today,
            targetCustomerId: supplier.supplierId,
            targetName: supplier.supplierName,
            targetPhone: null,
            publicLink: this.buildSummaryPublicLink('supplier', supplier.supplierId, today),
            status: 'skipped',
            errorMessage: 'Thiếu số điện thoại',
            triggeredBy: 'scheduler',
          });
        }

        const preview = suppliersWithoutPhone.slice(0, 12).map((supplier) => supplier.supplierName).join(', ');
        const moreCount = Math.max(0, suppliersWithoutPhone.length - 12);
        const suffix = moreCount > 0 ? ` (+${moreCount} vựa khác)` : '';

        await this.notifyAdmins(
          supabaseService,
          `⚠️ ${suppliersWithoutPhone.length} vựa thiếu SĐT nhận tổng kết`,
          `Ngày ${today}: có vựa phát sinh đơn rau nhưng thiếu số điện thoại nên không gửi được tin nhắn tổng kết. Danh sách: ${preview}${suffix}. Vui lòng cập nhật SĐT khách hàng trước giờ gửi.`,
          'warning',
        );
      }
      if (invalidPhoneSuppliers.length > 0) {
        logger.warn(`[ZaloService] Suppliers skipped (invalid normalized phone): ${JSON.stringify(invalidPhoneSuppliers)}`);
      }
      if (failedSuppliers.length > 0) {
        logger.warn(`[ZaloService] Suppliers failed to send: ${JSON.stringify(failedSuppliers)}`);
      }

      // Mark as run at the end so partial failures can be diagnosed before lock is set
      await supabaseService.from('general_settings').upsert({
        setting_key: 'ZALO_LAST_SUPPLIER_SUMMARY_RUN',
        setting_value: today,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(`[ZaloService] Exception in sendDailySupplierSummaries:`, err);
    }
  }

  async sendDailySenderSummaries(supabaseService: any, logger: any, normalizePhoneForAuth: (phone: string) => string | null): Promise<void> {
    try {
      if (process.env.ZALO_ENABLE_SENDS !== 'true') return;

      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Distributed Lock: Check if already run today to avoid double sending
      const { data: lastRun } = await supabaseService
        .from('general_settings')
        .select('setting_value')
        .eq('setting_key', 'ZALO_LAST_SENDER_SUMMARY_RUN')
        .maybeSingle();

      if (lastRun?.setting_value === today) {
        logger.info(`[ZaloService] Daily sender summary already processed for ${today}, skipping.`);
        return;
      }

      // Mark as run immediately (best-effort lock)
      await supabaseService.from('general_settings').upsert({
        setting_key: 'ZALO_LAST_SENDER_SUMMARY_RUN',
        setting_value: today,
        updated_at: new Date().toISOString(),
      });

      logger.info(`[ZaloService] Starting daily sender summary generation for ${today}`);

      // 1. Fetch all vegetable orders for today to calculate tai_ranks consistently
      const { data: allOrders, error } = await supabaseService
        .from('vegetable_orders')
        .select(`
          *,
          sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone),
          customers:customers!vegetable_orders_customer_id_fkey(id, name),
          vegetable_order_items(*, products(*)),
          delivery_orders(*, delivery_vehicles(*, vehicles(license_plate), profiles!driver_id(full_name)))
        `)
        .eq('order_date', today)
        .is('deleted_at', null);

      if (error) throw error;
      if (!allOrders || allOrders.length === 0) {
        logger.info(`[ZaloService] No vegetable orders found for ${today}, skipping sender summary.`);
        return;
      }

      // 2. Pre-calculate tai_ranks consistently with supplier summaries.
      const dailyDriverRankMap = buildVegetableDailyDriverRankMap(allOrders);

      // 3. Group by Sender (sender_id)
      const senderGroups: Record<string, { senderId: string; senderName: string; phone: string | null; items: any[] }> = {};

      allOrders.forEach((order: any) => {
        const sender = order.sender_customers;
        if (!sender || !sender.id) return;

        if (!senderGroups[sender.id]) {
          senderGroups[sender.id] = {
            senderId: sender.id,
            senderName: sender.name,
            phone: sender.phone || null,
            items: [],
          };
        }

        const taiRank = getVegetableTaiRank(order, dailyDriverRankMap);
        const depotName = order.customers?.name || 'Vựa';
        const licensePlate = order.delivery_orders?.[0]?.delivery_vehicles?.[0]?.vehicles?.license_plate || '-';

        (order.vegetable_order_items || []).forEach((item: any) => {
          senderGroups[sender.id].items.push({
            taiRank,
            licensePlate,
            quantity: item.quantity || 0,
            productName: item.products?.name || item.package_type || 'Hàng hóa',
            supplierName: depotName,
            depotName,
          });
        });
      });

      // 4. Process each sender group
      for (const senderId of Object.keys(senderGroups)) {
        const group = senderGroups[senderId];
        const publicLink = this.buildSummaryPublicLink('sender', group.senderId, today);
        const normalizedPhone = this.normalizePhoneSafe(normalizePhoneForAuth, group.phone);
        if (!normalizedPhone) {
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'sender',
            summaryDate: today,
            targetCustomerId: group.senderId,
            targetName: group.senderName,
            targetPhone: group.phone,
            publicLink,
            status: group.phone ? 'failed' : 'skipped',
            errorMessage: group.phone ? 'Số điện thoại không hợp lệ' : 'Thiếu số điện thoại',
            triggeredBy: 'scheduler',
          });
          continue;
        }
        if (group.items.length === 0) {
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'sender',
            summaryDate: today,
            targetCustomerId: group.senderId,
            targetName: group.senderName,
            targetPhone: normalizedPhone,
            publicLink,
            status: 'skipped',
            errorMessage: 'Không có dữ liệu tổng kết để gửi',
            triggeredBy: 'scheduler',
          });
          continue;
        }

        try {
          const caption = `Phiếu tổng kết hàng đã gửi ngày ${this.formatDisplayDate(today)}. Cảm ơn bạn.\n\n${VEGETABLE_SUMMARY_IMAGE_HINT}\n\nXem chi tiết tại: ${publicLink}`;
          const attachments = await this.buildSummaryAttachments('sender', {
            shopName: 'Nhà Xe Năm Sự',
            senderName: group.senderName,
            date: this.formatDisplayDate(today),
            items: group.items,
          });

          const result = await this.sendImageMessage({
            recipientPhone: normalizedPhone,
            imageUrls: [],
            attachments,
            caption,
          });

          if (result.success) {
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'sender',
              summaryDate: today,
              targetCustomerId: group.senderId,
              targetName: group.senderName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'success',
              messageId: result.messageId || null,
              triggeredBy: 'scheduler',
            });
            logger.info(`[ZaloService] Daily sender summary sent to ${group.senderName} (${normalizedPhone})`);
          } else {
            await this.upsertSummaryDispatchLog(supabaseService, {
              summaryType: 'sender',
              summaryDate: today,
              targetCustomerId: group.senderId,
              targetName: group.senderName,
              targetPhone: normalizedPhone,
              publicLink,
              status: 'failed',
              errorMessage: result.error || 'Gửi thất bại',
              messageId: result.messageId || null,
              triggeredBy: 'scheduler',
            });
            logger.error(`[ZaloService] Failed to send sender summary to ${normalizedPhone}: ${result.error}`);
          }
        } catch (err) {
          await this.upsertSummaryDispatchLog(supabaseService, {
            summaryType: 'sender',
            summaryDate: today,
            targetCustomerId: group.senderId,
            targetName: group.senderName,
            targetPhone: normalizedPhone,
            publicLink,
            status: 'failed',
            errorMessage: (err as any)?.message || 'exception',
            triggeredBy: 'scheduler',
          });
          logger.error(`[ZaloService] Error processing sender summary for ${group.senderName}:`, err);
        }
      }
    } catch (err) {
      logger.error(`[ZaloService] Exception in sendDailySenderSummaries:`, err);
    }
  }

  private async resolveGroceryFallbackPhone(supabaseService: any, customerId: string, date: string): Promise<string | null> {
    const { startAt, endAt, startMs, endMs } = this.buildUtcDayRange(date);
    const { data, error } = await supabaseService
      .from('delivery_orders')
      .select(`
        id,
        status,
        delivery_date,
        import_orders(customer_id, receiver_name, receiver_phone, selected_alias, deleted_at, customers:customers!import_orders_customer_id_fkey(id, phone, name)),
        vegetable_orders(customer_id, receiver_name, receiver_phone, selected_alias, deleted_at, customers:customers!vegetable_orders_customer_id_fkey(id, phone, name)),
        delivery_vehicles(assigned_quantity, assigned_at, delivery_date)
      `)
      .eq('order_category', 'standard')
      .neq('status', 'hang_o_sg')
      .or(`and(confirmed_at.gte.${startAt},confirmed_at.lte.${endAt}),and(created_at.gte.${startAt},created_at.lte.${endAt}),delivery_date.eq.${date}`);

    if (error || !data) return null;

    for (const order of data as any[]) {
      if (!order) continue;
      if (this.isGroceryDeliverySourceSoftDeleted(order)) continue;
      const hasAssignedInDay = this.hasPositiveAssignmentOnDate(order, date, startMs, endMs);
      if (!hasAssignedInDay) continue;

      const context = this.extractGroceryOrderContext(order);
      const isTarget = context.customerId === customerId;
      if (!isTarget) continue;

      const fallbackPhone = context.phone;

      if (fallbackPhone) return fallbackPhone;
    }

    return null;
  }

  private buildUtcDayRange(date: string): { startAt: string; endAt: string; startMs: number; endMs: number } {
    const startAt = `${date}T00:00:00.000Z`;
    const endAt = `${date}T23:59:59.999Z`;
    return {
      startAt,
      endAt,
      startMs: new Date(startAt).getTime(),
      endMs: new Date(endAt).getTime(),
    };
  }

  private hasPositiveAssignmentOnDate(order: any, date: string, startMs: number, endMs: number): boolean {
    const rows = Array.isArray(order?.delivery_vehicles) ? order.delivery_vehicles : [];
    return rows.some((dv: any) => {
      const qty = Number(dv?.assigned_quantity || 0);
      if (qty <= 0) return false;

      const assignedAtMs = new Date(dv?.assigned_at || '').getTime();
      if (Number.isFinite(assignedAtMs) && assignedAtMs >= startMs && assignedAtMs <= endMs) {
        return true;
      }

      if (typeof dv?.delivery_date === 'string' && dv.delivery_date === date) {
        return true;
      }

      if (typeof order?.delivery_date === 'string' && order.delivery_date === date) {
        return true;
      }

      return true;
    });
  }

  private isGroceryDeliverySourceSoftDeleted(order: any): boolean {
    const context = this.extractGroceryOrderContext(order);
    return Boolean(context.importOrder?.deleted_at || context.vegetableOrder?.deleted_at);
  }

  private normalizeLookupText(value: string | null | undefined): string {
    if (!value) return '';
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
  }

  private normalizeLookupPhone(value: string | null | undefined): string {
    if (!value) return '';
    return String(value).replace(/\D/g, '');
  }

  private buildGroceryRecipientAliases(
    orders: any[],
    customerId: string,
    fallbackName: string | null,
    fallbackPhone: string | null,
  ): { names: Set<string>; phones: Set<string>; displayName: string | null } {
    const names = new Set<string>();
    const phones = new Set<string>();
    let displayName: string | null = null;

    const addName = (value: string | null | undefined) => {
      const normalized = this.normalizeLookupText(value);
      if (normalized.length >= 3) names.add(normalized);
      if (!displayName && value && String(value).trim()) displayName = String(value).trim();
    };
    const addPhone = (value: string | null | undefined) => {
      const normalized = this.normalizeLookupPhone(value);
      if (normalized.length >= 8) phones.add(normalized);
    };

    addName(fallbackName);
    addPhone(fallbackPhone);

    (orders || []).forEach((order) => {
      const context = this.extractGroceryOrderContext(order);
      if (context.customerId !== customerId) return;
      addName(context.receiverName);
      addName(context.customerName);
      addPhone(context.phone);
    });

    return { names, phones, displayName };
  }

  private matchesGroceryRecipient(
    order: any,
    customerId: string,
    aliases: { names: Set<string>; phones: Set<string> },
  ): boolean {
    const context = this.extractGroceryOrderContext(order);
    if (context.customerId === customerId) return true;

    const contextPhone = this.normalizeLookupPhone(context.phone);
    if (contextPhone && aliases.phones.has(contextPhone)) return true;

    const contextNameCandidates = [context.receiverName, context.customerName];
    return contextNameCandidates.some((name) => {
      const normalized = this.normalizeLookupText(name);
      return normalized.length >= 3 && aliases.names.has(normalized);
    });
  }

  private getGroceryGroupReceiver(order: any): string {
    const context = this.extractGroceryOrderContext(order);
    const sourceOrder = context.importOrder || context.vegetableOrder;
    if (order?.status === 'hang_o_sg' && sourceOrder?.selected_alias) {
      return String(sourceOrder.selected_alias);
    }

    const fromCustomer = context.importCustomer?.name || context.vegetableCustomer?.name;
    if (fromCustomer && String(fromCustomer).trim()) return String(fromCustomer).trim();

    if (context.receiverName && context.receiverName.trim()) return context.receiverName.trim();
    return '-';
  }

  private getGroceryGroupPaymentStatus(order: any): string {
    const context = this.extractGroceryOrderContext(order);
    const sourceOrder = context.importOrder || context.vegetableOrder;
    return sourceOrder?.payment_status || 'unpaid';
  }

  private buildGroceryDeliveryGroupKey(order: any): string {
    const deliveryDate = order?.delivery_date || 'N/A';
    const category = order?.order_category || 'standard';
    const receiver = this.getGroceryGroupReceiver(order);
    const product = String(order?.product_name || '').trim();
    const paymentStatus = this.getGroceryGroupPaymentStatus(order);
    return `${deliveryDate}|${category}|${receiver}|${product}|${paymentStatus}`;
  }

  private formatImportOrderShortDate(order: any): string | null {
    const importOrder = this.pickFirstRecord(order?.import_orders);
    if (!importOrder?.created_at) return null;

    const createdAt = new Date(importOrder.created_at);
    if (Number.isNaN(createdAt.getTime())) return null;

    return format(createdAt, 'dd/MM');
  }

  private formatGroceryProductNameWithImportDate(order: any): string {
    const productName = String(order?.product_name || '-').trim() || '-';
    const createdDate = this.formatImportOrderShortDate(order);
    return createdDate ? `${productName} (${createdDate})` : productName;
  }

  private async resolveSummaryRecipient(
    supabaseService: any,
    type: SummaryDispatchType,
    targetId: string,
    date: string,
  ): Promise<SummaryRecipient | null> {
    const { data: customer, error } = await supabaseService
      .from('customers')
      .select('id, name, phone')
      .eq('id', targetId)
      .maybeSingle();

    if (error || !customer) return null;

    if (type !== 'grocery') {
      return {
        id: customer.id,
        name: customer.name || '-',
        phone: customer.phone || null,
      };
    }

    const fallbackPhone = await this.resolveGroceryFallbackPhone(supabaseService, targetId, date);
    return {
      id: customer.id,
      name: customer.name || '-',
      phone: customer.phone || fallbackPhone || null,
    };
  }

  private hasSummaryData(type: SummaryDispatchType, summaryData: any): boolean {
    if (!summaryData) return false;
    if (type === 'grocery') {
      const itemCount = Array.isArray(summaryData.items) ? summaryData.items.length : 0;
      const undelivered = Number(summaryData.undeliveredQuantity || 0);
      return itemCount > 0 || undelivered > 0;
    }

    const itemCount = Array.isArray(summaryData.items) ? summaryData.items.length : 0;
    return itemCount > 0;
  }

  private buildSummaryCaption(type: SummaryDispatchType, date: string, targetId: string, summaryData?: any): string {
    const publicLink = this.buildSummaryPublicLink(type, targetId, date);
    const displayDate = this.formatDisplayDate(date);

    if (type === 'grocery') {
      const undeliveredQuantity = Number(summaryData?.undeliveredQuantity || 0);
      if (undeliveredQuantity > 0) {
        return `Phiếu tổng kết giao hàng ngày ${displayDate}\n\nXin lỗi quý khách, hiện số kiện chưa được giao là ${undeliveredQuantity}. Mong quý khách thông cảm. Hẹn gặp lại vào ngày mai.\n\nXem chi tiết tại: ${publicLink}`;
      }
      return `Phiếu tổng kết giao hàng ngày ${displayDate}\n\nQuý khách đã được giao đủ hàng. Cảm ơn quý khách đã sử dụng dịch vụ.\n\nXem chi tiết tại: ${publicLink}`;
    }
    if (type === 'supplier') {
      return `Phiếu tổng kết hàng đã nhận ngày ${displayDate}. Cảm ơn vựa.\n\n${VEGETABLE_SUMMARY_IMAGE_HINT}\n\nXem chi tiết tại: ${publicLink}`;
    }
    return `Phiếu tổng kết hàng đã gửi ngày ${displayDate}. Cảm ơn bạn.\n\n${VEGETABLE_SUMMARY_IMAGE_HINT}\n\nXem chi tiết tại: ${publicLink}`;
  }

  private async buildSummaryAttachments(
    type: SummaryDispatchType,
    summaryData: any,
  ): Promise<ZcaAttachmentSource[]> {
    if (!summaryData) return [];
    if (!Array.isArray(summaryData.items) || summaryData.items.length === 0) return [];

    try {
      if (type === 'grocery') {
        const pngBuffer = await DeliveryNoteGenerator.generateSummaryPng({
          shopName: summaryData.shopName || 'Năm Sự',
          customerName: summaryData.customerName || '-',
          deliveryDate: summaryData.date || summaryData.deliveryDate || '',
          items: (summaryData.items || []).map((item: any) => ({
            deliveryTime: item.deliveryTime || item.delivery_time || '',
            licensePlate: item.licensePlate || item.license_plate || '-',
            staffName: item.staffName || item.staff_name || 'NV Giao hàng',
            quantity: Number(item.quantity || 0),
            productName: item.productName || item.product_name || '-',
            price: Number(item.price || 0),
            total: Number(item.total || 0),
          })),
        });

        return [{
          data: pngBuffer,
          filename: `phieu-tong-${Date.now()}.png`,
          metadata: { totalSize: pngBuffer.length },
        }];
      }

      if (type === 'supplier') {
        const pngBuffer = await DeliveryNoteGenerator.generateSupplierSummaryPng({
          shopName: summaryData.shopName || 'Nhà Xe Năm Sự',
          supplierName: summaryData.supplierName || '-',
          date: summaryData.date || '',
          items: (summaryData.items || []).map((item: any) => ({
            taiRank: Number(item.taiRank || 0),
            licensePlate: item.licensePlate || '-',
            quantity: Number(item.quantity || 0),
            productName: item.productName || 'Hàng hóa',
            note: item.note || '',
            senderName: item.senderName || '-',
            price: Number(item.price || 0),
            total: Number(item.total || 0),
            payment_status: item.payment_status || item.paymentStatus || 'unpaid',
          })),
        });

        return [{
          data: pngBuffer,
          filename: `tong-ket-vua-${Date.now()}.png`,
          metadata: { totalSize: pngBuffer.length },
        }];
      }

      const pngBuffer = await DeliveryNoteGenerator.generateSenderSummaryPng({
        shopName: summaryData.shopName || 'Nhà Xe Năm Sự',
        senderName: summaryData.senderName || '-',
        date: summaryData.date || '',
        items: (summaryData.items || []).map((item: any) => ({
          taiRank: Number(item.taiRank || 0),
          licensePlate: item.licensePlate || '-',
          quantity: Number(item.quantity || 0),
          productName: item.productName || 'Hàng hóa',
          note: item.note || '',
          supplierName: item.supplierName || item.depotName || 'Vựa',
          depotName: item.depotName || item.supplierName || 'Vựa',
        })),
      });

      return [{
        data: pngBuffer,
        filename: `tong-ket-nguoi-gui-${Date.now()}.png`,
        metadata: { totalSize: pngBuffer.length },
      }];
    } catch (error) {
      logger.error(`[ZaloService] Failed to build ${type} summary attachment:`, error);
      return [];
    }
  }

  private async buildVegetableSummaryAttachments(
    type: SummaryDispatchType,
    summaryData: any,
  ): Promise<ZcaAttachmentSource[]> {
    return this.buildSummaryAttachments(type, summaryData);
  }

  async sendSummaryForTarget(
    supabaseService: any,
    logger: any,
    normalizePhoneForAuth: (phone: string) => string | null,
    params: {
      type: SummaryDispatchType;
      targetId: string;
      date: string;
      triggeredBy: SummaryDispatchTrigger;
    },
  ) {
    const { type, targetId, date, triggeredBy } = params;
    const publicLink = this.buildSummaryPublicLink(type, targetId, date);

    const recipient = await this.resolveSummaryRecipient(supabaseService, type, targetId, date);
    if (!recipient) {
      await this.upsertSummaryDispatchLog(supabaseService, {
        summaryType: type,
        summaryDate: date,
        targetCustomerId: targetId,
        targetName: targetId,
        targetPhone: null,
        publicLink,
        status: 'skipped',
        errorMessage: 'Không tìm thấy khách hàng',
        triggeredBy,
      });
      return { success: false, status: 'skipped' as const, error: 'Không tìm thấy khách hàng', publicLink };
    }

    const summaryData =
      type === 'grocery'
        ? await this.getGrocerySummaryData(supabaseService, targetId, date)
        : type === 'supplier'
          ? await this.getSupplierSummaryData(supabaseService, targetId, date)
          : await this.getSenderSummaryData(supabaseService, targetId, date);

    if (!this.hasSummaryData(type, summaryData)) {
      await this.upsertSummaryDispatchLog(supabaseService, {
        summaryType: type,
        summaryDate: date,
        targetCustomerId: targetId,
        targetName: recipient.name,
        targetPhone: recipient.phone,
        publicLink,
        status: 'skipped',
        errorMessage: 'Không có dữ liệu tổng kết để gửi',
        triggeredBy,
      });
      return { success: false, status: 'skipped' as const, error: 'Không có dữ liệu tổng kết để gửi', publicLink };
    }

    if (!recipient.phone) {
      await this.upsertSummaryDispatchLog(supabaseService, {
        summaryType: type,
        summaryDate: date,
        targetCustomerId: targetId,
        targetName: recipient.name,
        targetPhone: null,
        publicLink,
        status: 'skipped',
        errorMessage: 'Thiếu số điện thoại',
        triggeredBy,
      });
      return { success: false, status: 'skipped' as const, error: 'Thiếu số điện thoại', publicLink };
    }

    const normalizedPhone = this.normalizePhoneSafe(normalizePhoneForAuth, recipient.phone);
    if (!normalizedPhone) {
      await this.upsertSummaryDispatchLog(supabaseService, {
        summaryType: type,
        summaryDate: date,
        targetCustomerId: targetId,
        targetName: recipient.name,
        targetPhone: recipient.phone,
        publicLink,
        status: 'failed',
        errorMessage: 'Số điện thoại không hợp lệ',
        triggeredBy,
      });
      return { success: false, status: 'failed' as const, error: 'Số điện thoại không hợp lệ', publicLink };
    }

    const caption = this.buildSummaryCaption(type, date, targetId, summaryData);
    const attachments = await this.buildSummaryAttachments(type, summaryData);
    const result = await this.sendImageMessage({
      recipientPhone: normalizedPhone,
      imageUrls: [],
      attachments,
      caption,
    });

    if (result.success) {
      await this.upsertSummaryDispatchLog(supabaseService, {
        summaryType: type,
        summaryDate: date,
        targetCustomerId: targetId,
        targetName: recipient.name,
        targetPhone: normalizedPhone,
        publicLink,
        status: 'success',
        messageId: result.messageId || null,
        triggeredBy,
      });
      logger.info(`[ZaloService] Manual summary sent (${type}) to ${recipient.name} (${normalizedPhone})`);
      return { success: true, status: 'success' as const, publicLink, messageId: result.messageId || null };
    }

    await this.upsertSummaryDispatchLog(supabaseService, {
      summaryType: type,
      summaryDate: date,
      targetCustomerId: targetId,
      targetName: recipient.name,
      targetPhone: normalizedPhone,
      publicLink,
      status: 'failed',
      errorMessage: result.error || 'Gửi thất bại',
      messageId: result.messageId || null,
      triggeredBy,
    });
    logger.error(`[ZaloService] Failed manual summary send (${type}) to ${normalizedPhone}: ${result.error}`);
    return { success: false, status: 'failed' as const, error: result.error || 'Gửi thất bại', publicLink };
  }

  async sendVegetableArrivalNoticeForTai(
    supabaseService: any,
    logger: any,
    normalizePhoneForAuth: (phone: string) => string | null,
    params: { date: string; taiRank: number; targetIds?: string[] },
  ): Promise<VegetableArrivalNoticeResult> {
    const { date, taiRank, targetIds } = params;
    const targets = await this.buildVegetableArrivalTargets(supabaseService, date, taiRank);
    const targetIdSet = targetIds && targetIds.length > 0 ? new Set(targetIds.map(String)) : null;
    const selectedTargets = targetIdSet ? targets.filter((target) => targetIdSet.has(String(target.id))) : targets;

    const items: VegetableArrivalNoticeItem[] = [];
    for (const target of selectedTargets) {
      if (!target.phone) {
        items.push({
          targetId: target.id,
          targetName: target.name,
          targetPhone: null,
          orderCount: target.orders.length,
          status: 'skipped',
          error: 'Thiếu số điện thoại',
        });
        await this.upsertVegetableArrivalDispatchLog(supabaseService, date, taiRank, target, 'skipped', 'Thiếu số điện thoại', null);
        continue;
      }

      const normalizedPhone = this.normalizePhoneSafe(normalizePhoneForAuth, target.phone);
      if (!normalizedPhone) {
        items.push({
          targetId: target.id,
          targetName: target.name,
          targetPhone: target.phone,
          orderCount: target.orders.length,
          status: 'failed',
          error: 'Số điện thoại không hợp lệ',
        });
        await this.upsertVegetableArrivalDispatchLog(supabaseService, date, taiRank, target, 'failed', 'Số điện thoại không hợp lệ', null);
        continue;
      }

      const vehiclePlates = this.getVegetableArrivalVehiclePlates(target.orders);
      const driverContacts = this.getVegetableArrivalDriverContacts(target.orders);
      const inChargeContacts = this.getVegetableArrivalInChargeContacts(target.orders);
      const caption = this.buildVegetableArrivalCaption(
        taiRank,
        vehiclePlates,
        driverContacts,
        inChargeContacts,
        target.name,
        target.orders.length,
      );
      const result = await this.sendImageMessage({
        recipientPhone: normalizedPhone,
        imageUrls: [],
        caption,
      });

      const hasMessageId = Boolean(result.messageId);
      const status = result.success && hasMessageId ? 'success' : 'failed';
      const errorMessage = status === 'success'
        ? null
        : result.error || 'Zalo không trả mã tin nhắn, chưa xác nhận đã gửi';
      items.push({
        targetId: target.id,
        targetName: target.name,
        targetPhone: normalizedPhone,
        orderCount: target.orders.length,
        status,
        error: errorMessage,
        messageId: result.messageId || null,
      });
      await this.upsertVegetableArrivalDispatchLog(supabaseService, date, taiRank, target, status, errorMessage, result.messageId || null);

      if (selectedTargets.length > 1) {
        await this.sleep(1000);
      }
    }

    const summary = {
      date,
      taiRank,
      totalTargets: items.length,
      sent: items.filter((item) => item.status === 'success').length,
      failed: items.filter((item) => item.status === 'failed').length,
      skipped: items.filter((item) => item.status === 'skipped').length,
      items,
    };

    logger.info(
      `[ZaloService] Vegetable arrival notices sent for ${date} tài ${taiRank}: ${summary.sent}/${summary.totalTargets}`,
    );

    return summary;
  }

  async getVegetableArrivalDispatchStatusList(
    supabaseService: any,
    date: string,
    taiRank: number,
  ): Promise<VegetableArrivalNoticeStatusItem[]> {
    const targets = await this.buildVegetableArrivalTargets(supabaseService, date, taiRank);
    if (targets.length === 0) return [];

    const targetIds = targets.map((target) => target.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const logMap = new Map<string, any>();

    if (targetIds.length > 0) {
      const { data: logs, error } = await supabaseService
        .from('zalo_summary_dispatch_logs')
        .select(`
          target_customer_id,
          status,
          error_message,
          message_id,
          triggered_by,
          sent_at
        `)
        .eq('summary_type', 'vegetable_arrival')
        .eq('summary_date', date)
        .in('target_customer_id', targetIds);

      if (!error && Array.isArray(logs)) {
        logs.forEach((log: any) => logMap.set(String(log.target_customer_id), log));
      }
    }

    return targets.map((target) => {
      const log = logMap.get(target.id);
      return {
        targetId: target.id,
        targetName: target.name,
        targetPhone: target.phone,
        orderCount: target.orders.length,
        status: log?.status || 'pending',
        lastError: log?.error_message || null,
        messageId: log?.message_id || null,
        lastSentAt: log?.sent_at || null,
        triggeredBy: log?.triggered_by || null,
      };
    });
  }

  private async buildVegetableArrivalTargets(
    supabaseService: any,
    date: string,
    taiRank: number,
  ): Promise<VegetableArrivalNoticeTarget[]> {
    const { data: orders, error } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        order_date,
        created_at,
        driver_name,
        received_by,
        customer_id,
        receiver_name,
        receiver_phone,
        selected_alias,
        customers:customers!vegetable_orders_customer_id_fkey(id, name, phone, customer_type),
        delivery_orders(id, delivery_vehicles(
          id,
          driver_id,
          vehicles(
            license_plate,
            profiles:profiles!vehicles_driver_id_fkey(full_name, phone),
            responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name, phone)
          ),
          profiles!driver_id(full_name, phone)
        ))
      `)
      .eq('order_date', date)
      .is('deleted_at', null);

    if (error) throw error;

    const rankedOrders = assignVegetableTaiRanksByDate((orders || []).map((order: any) => ({ ...order })));
    const targetOrders = rankedOrders.filter((order: any) => Number(order.tai_rank) === taiRank);
    const targets = new Map<string, VegetableArrivalNoticeTarget>();

    targetOrders.forEach((order: any) => {
      const receiver = Array.isArray(order.customers) ? order.customers[0] : order.customers;
      const receiverId = receiver?.id || order.customer_id || `order:${order.id}`;
      const receiverName = receiver?.name || order.selected_alias || order.receiver_name || 'Vựa rau';
      const receiverPhone = receiver?.phone || order.receiver_phone || null;
      const key = receiverPhone || receiverId;
      const existing = targets.get(key);

      if (existing) {
        existing.orders.push(order);
        if (!existing.phone && receiverPhone) existing.phone = receiverPhone;
        return;
      }

      targets.set(key, {
        id: receiverId,
        name: receiverName,
        phone: receiverPhone,
        orders: [order],
      });
    });

    return Array.from(targets.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  private async upsertVegetableArrivalDispatchLog(
    supabaseService: any,
    date: string,
    taiRank: number,
    target: VegetableArrivalNoticeTarget,
    status: VegetableArrivalNoticeStatus,
    errorMessage: string | null,
    messageId: string | null,
  ): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(target.id)) return;

    await this.upsertSummaryDispatchLog(supabaseService, {
      summaryType: 'vegetable_arrival',
      summaryDate: date,
      targetCustomerId: target.id,
      targetName: target.name,
      targetPhone: target.phone,
      publicLink: '',
      status,
      errorMessage,
      messageId,
      triggeredBy: 'manual',
    });
  }
  private getVegetableArrivalVehiclePlates(orders: any[]): string {
    const plates = new Set<string>();

    orders.forEach((order) => {
      if (order.license_plate) plates.add(order.license_plate);
      if (!Array.isArray(order.delivery_orders)) return;

      order.delivery_orders.forEach((deliveryOrder: any) => {
        if (!Array.isArray(deliveryOrder?.delivery_vehicles)) return;
        deliveryOrder.delivery_vehicles.forEach((deliveryVehicle: any) => {
          const plate = deliveryVehicle?.vehicles?.license_plate;
          if (plate) plates.add(String(plate));
        });
      });
    });

    return Array.from(plates).join(', ');
  }

  private getVegetableArrivalDriverContacts(orders: any[]): string {
    const contacts = new Set<string>();

    orders.forEach((order) => {
      if (!Array.isArray(order.delivery_orders)) return;
      order.delivery_orders.forEach((deliveryOrder: any) => {
        if (!Array.isArray(deliveryOrder?.delivery_vehicles)) return;
        deliveryOrder.delivery_vehicles.forEach((deliveryVehicle: any) => {
          const profile = deliveryVehicle?.profiles || deliveryVehicle?.vehicles?.profiles;
          const name = profile?.full_name;
          if (!name) return;
          contacts.add(profile?.phone ? `${name} (${profile.phone})` : String(name));
        });
      });
    });

    return Array.from(contacts).join('; ');
  }

  private getVegetableArrivalInChargeContacts(orders: any[]): string {
    const contacts = new Set<string>();

    orders.forEach((order) => {
      if (!Array.isArray(order.delivery_orders)) return;
      order.delivery_orders.forEach((deliveryOrder: any) => {
        if (!Array.isArray(deliveryOrder?.delivery_vehicles)) return;
        deliveryOrder.delivery_vehicles.forEach((deliveryVehicle: any) => {
          const profile = deliveryVehicle?.vehicles?.responsible_profile;
          const name = profile?.full_name;
          if (!name) return;
          contacts.add(profile?.phone ? `${name} (${profile.phone})` : String(name));
        });
      });
    });

    return Array.from(contacts).join('; ');
  }

  private buildVegetableArrivalCaption(
    taiRank: number,
    vehiclePlates: string,
    driverContacts: string,
    inChargeContacts: string,
    receiverName: string,
    orderCount: number,
  ): string {
    const orderText = orderCount > 1 ? ` (${orderCount} đơn)` : '';
    const vehicleText = vehiclePlates ? ` xe ${vehiclePlates}` : '';
    const contactText = driverContacts
      ? ` Quý khách cần hàng gấp liên hệ số: Tài xế: ${driverContacts}.`
      : '';
    const inChargeText = inChargeContacts ? ` Người phụ trách xe: ${inChargeContacts}.` : '';
    return `Tài ${taiRank}${vehicleText} Đã tới chợ.${contactText}${inChargeText} Vựa ${receiverName}${orderText}.`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async buildGrocerySummaryTargets(supabaseService: any, date: string) {
    const { startAt, endAt, startMs, endMs } = this.buildUtcDayRange(date);
    const { data: orders, error } = await supabaseService
      .from('delivery_orders')
      .select(`
        id,
        status,
        delivery_date,
        import_orders(
          customer_id,
          receiver_name,
          receiver_phone,
          selected_alias,
          deleted_at,
          customers:customers!import_orders_customer_id_fkey(id, name, phone)
        ),
        vegetable_orders(
          customer_id,
          receiver_name,
          receiver_phone,
          selected_alias,
          deleted_at,
          customers:customers!vegetable_orders_customer_id_fkey(id, name, phone)
        ),
        delivery_vehicles(
          id,
          assigned_quantity,
          assigned_at,
          delivery_date
        )
      `)
      .eq('order_category', 'standard')
      .neq('status', 'hang_o_sg')
      .or(`and(confirmed_at.gte.${startAt},confirmed_at.lte.${endAt}),and(created_at.gte.${startAt},created_at.lte.${endAt}),delivery_date.eq.${date}`);

    if (error || !orders) return [] as Array<Omit<SummaryStatusListItem, 'status' | 'lastError' | 'messageId' | 'lastSentAt' | 'triggeredBy'>>;

    const targetMap = new Map<string, Omit<SummaryStatusListItem, 'status' | 'lastError' | 'messageId' | 'lastSentAt' | 'triggeredBy'>>();
    const countedOrderIdsByCustomer = new Map<string, Set<string>>();

    (orders as any[]).forEach((order) => {
      if (!order?.id) return;
      if (this.isGroceryDeliverySourceSoftDeleted(order)) return;

      const hasAssignedInDay = this.hasPositiveAssignmentOnDate(order, date, startMs, endMs);
      if (!hasAssignedInDay) return;

      const context = this.extractGroceryOrderContext(order);
      const targetId = context.customerId;
      if (!targetId) return;
      const phone = context.phone;

      const existing = targetMap.get(targetId);
      if (existing) {
        const countedOrderIds = countedOrderIdsByCustomer.get(targetId) || new Set<string>();
        if (!countedOrderIds.has(order.id)) {
          existing.orderCount += 1;
          countedOrderIds.add(order.id);
          countedOrderIdsByCustomer.set(targetId, countedOrderIds);
        }
        if (!existing.targetPhone && phone) existing.targetPhone = phone;
        return;
      }

      const countedOrderIds = new Set<string>();
      countedOrderIds.add(order.id);
      countedOrderIdsByCustomer.set(targetId, countedOrderIds);

      targetMap.set(targetId, {
        targetId,
        targetName: context.customerName || '-',
        targetPhone: phone,
        orderCount: 1,
        itemRowCount: 0,
        publicLink: this.buildSummaryPublicLink('grocery', targetId, date),
      });
    });

    return Array.from(targetMap.values());
  }

  async getGrocerySummaryDiagnostics(supabaseService: any, date: string) {
    const { startAt, endAt, startMs, endMs } = this.buildUtcDayRange(date);
    const { data: orders, error } = await supabaseService
      .from('delivery_orders')
      .select(`
        id,
        status,
        delivery_date,
        import_orders(
          customer_id,
          receiver_name,
          receiver_phone,
          selected_alias,
          deleted_at,
          customers:customers!import_orders_customer_id_fkey(id, name, phone)
        ),
        vegetable_orders(
          customer_id,
          receiver_name,
          receiver_phone,
          selected_alias,
          deleted_at,
          customers:customers!vegetable_orders_customer_id_fkey(id, name, phone)
        ),
        delivery_vehicles(
          id,
          assigned_quantity,
          assigned_at,
          delivery_date
        )
      `)
      .eq('order_category', 'standard')
      .neq('status', 'hang_o_sg')
      .or(`and(confirmed_at.gte.${startAt},confirmed_at.lte.${endAt}),and(created_at.gte.${startAt},created_at.lte.${endAt}),delivery_date.eq.${date}`);

    if (error) {
      return { error: error.message || String(error), date };
    }

    const rows = (orders || []) as any[];
    let deletedCount = 0;
    let missingAssignedCount = 0;
    let missingCustomerCount = 0;
    let matchedCount = 0;
    const sampleMatched: string[] = [];
    const sampleNoAssigned: string[] = [];
    const sampleNoCustomer: string[] = [];

    rows.forEach((order) => {
      if (!order?.id) return;
      if (this.isGroceryDeliverySourceSoftDeleted(order)) {
        deletedCount += 1;
        return;
      }

      const hasAssigned = this.hasPositiveAssignmentOnDate(order, date, startMs, endMs);
      if (!hasAssigned) {
        missingAssignedCount += 1;
        if (sampleNoAssigned.length < 8) sampleNoAssigned.push(String(order.id));
        return;
      }

      const context = this.extractGroceryOrderContext(order);
      if (!context.customerId) {
        missingCustomerCount += 1;
        if (sampleNoCustomer.length < 8) sampleNoCustomer.push(String(order.id));
        return;
      }

      matchedCount += 1;
      if (sampleMatched.length < 8) {
        sampleMatched.push(`${order.id}:${context.customerId}`);
      }
    });

    return {
      date,
      totalFetched: rows.length,
      deletedCount,
      missingAssignedCount,
      missingCustomerCount,
      matchedCount,
      sampleMatched,
      sampleNoAssigned,
      sampleNoCustomer,
    };
  }

  private async buildSupplierSummaryTargets(supabaseService: any, date: string) {
    const { data: orders, error } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        customer_id,
        customers:customers!vegetable_orders_customer_id_fkey(id, name, phone),
        vegetable_order_items(id)
      `)
      .eq('order_date', date)
      .is('deleted_at', null);

    if (error || !orders) return [] as Array<Omit<SummaryStatusListItem, 'status' | 'lastError' | 'messageId' | 'lastSentAt' | 'triggeredBy'>>;

    const targetMap = new Map<string, Omit<SummaryStatusListItem, 'status' | 'lastError' | 'messageId' | 'lastSentAt' | 'triggeredBy'>>();

    (orders as any[]).forEach((order) => {
      const customer = order.customers;
      if (!order.customer_id || !customer?.id) return;

      const existing = targetMap.get(order.customer_id);
      const itemCount = Array.isArray(order.vegetable_order_items) ? order.vegetable_order_items.length : 0;
      if (existing) {
        existing.orderCount += 1;
        existing.itemRowCount += itemCount;
        return;
      }

      targetMap.set(order.customer_id, {
        targetId: order.customer_id,
        targetName: customer.name || '-',
        targetPhone: customer.phone || null,
        orderCount: 1,
        itemRowCount: itemCount,
        publicLink: this.buildSummaryPublicLink('supplier', order.customer_id, date),
      });
    });

    return Array.from(targetMap.values());
  }

  private async buildSenderSummaryTargets(supabaseService: any, date: string) {
    const { data: orders, error } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        sender_id,
        sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone),
        vegetable_order_items(id)
      `)
      .eq('order_date', date)
      .is('deleted_at', null);

    if (error || !orders) return [] as Array<Omit<SummaryStatusListItem, 'status' | 'lastError' | 'messageId' | 'lastSentAt' | 'triggeredBy'>>;

    const targetMap = new Map<string, Omit<SummaryStatusListItem, 'status' | 'lastError' | 'messageId' | 'lastSentAt' | 'triggeredBy'>>();

    (orders as any[]).forEach((order) => {
      const sender = order.sender_customers;
      if (!order.sender_id || !sender?.id) return;

      const existing = targetMap.get(order.sender_id);
      const itemCount = Array.isArray(order.vegetable_order_items) ? order.vegetable_order_items.length : 0;
      if (existing) {
        existing.orderCount += 1;
        existing.itemRowCount += itemCount;
        return;
      }

      targetMap.set(order.sender_id, {
        targetId: order.sender_id,
        targetName: sender.name || '-',
        targetPhone: sender.phone || null,
        orderCount: 1,
        itemRowCount: itemCount,
        publicLink: this.buildSummaryPublicLink('sender', order.sender_id, date),
      });
    });

    return Array.from(targetMap.values());
  }

  async getSummaryDispatchStatusList(
    supabaseService: any,
    type: SummaryDispatchType,
    date: string,
  ): Promise<SummaryStatusListItem[]> {
    const baseTargets =
      type === 'grocery'
        ? await this.buildGrocerySummaryTargets(supabaseService, date)
        : type === 'supplier'
          ? await this.buildSupplierSummaryTargets(supabaseService, date)
          : await this.buildSenderSummaryTargets(supabaseService, date);

    if (baseTargets.length === 0) return [];

    const targetIds = baseTargets.map((target) => target.targetId);
    const { data: logs, error } = await supabaseService
      .from('zalo_summary_dispatch_logs')
      .select(`
        target_customer_id,
        status,
        error_message,
        message_id,
        triggered_by,
        sent_at
      `)
      .eq('summary_type', type)
      .eq('summary_date', date)
      .in('target_customer_id', targetIds);

    if (error || !logs) {
      return baseTargets.map((target) => ({
        ...target,
        status: 'pending',
        lastError: null,
        messageId: null,
        lastSentAt: null,
        triggeredBy: null,
      }));
    }

    const logMap = new Map<string, any>();
    (logs as any[]).forEach((log) => {
      logMap.set(String(log.target_customer_id), log);
    });

    return baseTargets.map((target) => {
      const log = logMap.get(target.targetId);
      if (!log) {
        return {
          ...target,
          status: 'pending',
          lastError: null,
          messageId: null,
          lastSentAt: null,
          triggeredBy: null,
        };
      }
      return {
        ...target,
        status: log.status || 'pending',
        lastError: log.error_message || null,
        messageId: log.message_id || null,
        lastSentAt: log.sent_at || null,
        triggeredBy: log.triggered_by || null,
      };
    });
  }

  private buildSupplierSummaryItemsFromOrders(orders: any[], dailyDriverRankMap: Map<string, number>): any[] {
    const resolveLicensePlate = (order: any): string =>
      order.delivery_orders?.[0]?.delivery_vehicles?.[0]?.vehicles?.license_plate || '-';
    const normalizeNote = (value: unknown): string => {
      if (typeof value !== 'string') return '';
      return value.trim();
    };
    const buildPriceSeedKey = (item: any): string => {
      const productName = normalizeNote(item.productName || 'Hàng hóa');
      const note = normalizeNote(item.note || '');
      return `${productName}||${note}`;
    };

    const rawItems: any[] = [];
    const seedPriceByProduct = new Map<string, number>();
    const globalPriceSet = new Set<number>();

    orders.forEach((order) => {
      const taiRank = getVegetableTaiRank(order, dailyDriverRankMap);
      const licensePlate = resolveLicensePlate(order);

      (order.vegetable_order_items || []).forEach((item: any) => {
        const quantity = Number(item.quantity || 0);
        const paymentStatus = order.payment_status === 'paid' || item.payment_status === 'paid' ? 'paid' : (order.payment_status || item.payment_status || 'unpaid');
        const isPaid = paymentStatus === 'paid';
        const fallbackBasePrice = Number(item.products?.base_price || 0);
        let unitPrice = isPaid ? 0 : Number(item.unit_price || fallbackBasePrice || 0);
        let total = isPaid ? 0 : Number(item.total_amount || (quantity * unitPrice));
        const note = normalizeNote(item.item_note) || normalizeNote(order.notes);

        if (!isPaid && !total && order.is_custom_amount && order.vegetable_order_items?.length === 1) {
          total = Number(order.total_amount || 0);
          unitPrice = quantity > 0 ? total / quantity : 0;
        }

        if (!(unitPrice > 0) && quantity > 0 && total > 0) {
          unitPrice = total / quantity;
        }

        if (unitPrice > 0 && unitPrice < 1000) {
          unitPrice *= 1000;
        }

        const summaryItem = {
          taiRank,
          licensePlate,
          quantity,
          productName: item.products?.name || item.package_type || 'Hàng hóa',
          senderName: order.sender_customers?.name || order.sender_name || '-',
          note,
          price: Math.round(unitPrice || 0),
          total: Math.round(total || 0),
          payment_status: paymentStatus,
        };

        if (summaryItem.price > 0) {
          const seedKey = buildPriceSeedKey(summaryItem);
          if (!seedPriceByProduct.has(seedKey)) {
            seedPriceByProduct.set(seedKey, summaryItem.price);
          }
          globalPriceSet.add(summaryItem.price);
        }

        rawItems.push(summaryItem);
      });
    });

    const globalFallbackPrice = globalPriceSet.size === 1 ? Array.from(globalPriceSet)[0] : 0;

    const normalizedItems = rawItems.map((item) => {
      const quantity = Number(item.quantity || 0);
      const isPaid = item.payment_status === 'paid';
      let price = Number(item.price || 0);
      if (isPaid) {
        return {
          ...item,
          quantity,
          price: 0,
          total: 0,
        };
      }
      if (!(price > 0)) {
        price = Number(seedPriceByProduct.get(buildPriceSeedKey(item)) || 0);
      }
      if (!(price > 0) && globalFallbackPrice > 0) {
        price = globalFallbackPrice;
      }

      let total = Number(item.total || 0);
      if (!(total > 0) && quantity > 0 && price > 0) {
        total = quantity * price;
      }

      return {
        ...item,
        quantity,
        price: Math.round(price || 0),
        total: Math.round(total || 0),
      };
    });

    const mergedMap = new Map<string, any>();
    normalizedItems.forEach((item) => {
      const rowKey = `${item.senderName}||${item.taiRank}||${item.licensePlate}||${item.productName}||${item.note || ''}||${item.price || 0}`;
      const existing = mergedMap.get(rowKey);
      if (!existing) {
        mergedMap.set(rowKey, { ...item });
        return;
      }
      existing.quantity += item.quantity || 0;
      existing.total += item.total || 0;
    });

    return Array.from(mergedMap.values());
  }

  async getGrocerySummaryData(supabaseService: any, customerId: string, date: string) {
    // 1. Fetch shop name
    const { data: shopNameSetting } = await supabaseService
      .from('general_settings')
      .select('setting_value')
      .eq('setting_key', 'SHOP_NAME')
      .maybeSingle();
    const shopName = shopNameSetting?.setting_value || 'Năm Sự';
    const { data: customerRecord } = await supabaseService
      .from('customers')
      .select('id, name, phone')
      .eq('id', customerId)
      .maybeSingle();

    const { data: assignmentRows, error } = await supabaseService
      .from('delivery_vehicles')
      .select(`
        assigned_quantity,
        assigned_at,
        delivery_date,
        delivery_time,
        expected_amount,
        profiles (full_name),
        vehicles (license_plate),
        delivery_orders!inner(
          id,
          order_category,
          status,
          product_name,
          delivery_date,
          unit_price,
          total_quantity,
          import_orders (
            customer_id,
            created_at,
            receiver_name,
            selected_alias,
            receiver_phone,
            payment_status,
            deleted_at,
            customers:customers!import_orders_customer_id_fkey (id, name, phone)
          ),
          vegetable_orders (
            customer_id,
            receiver_name,
            selected_alias,
            receiver_phone,
            payment_status,
            deleted_at,
            customers:customers!vegetable_orders_customer_id_fkey (id, name, phone)
          ),
          delivery_vehicles (
            assigned_quantity,
            assigned_at,
            delivery_date
          )
        )
      `)
      .eq('delivery_date', date)
      .gt('assigned_quantity', 0)
      .eq('delivery_orders.order_category', 'standard')
      .neq('delivery_orders.status', 'hang_o_sg');

    if (error || !assignmentRows) return null;

    const rows = (assignmentRows as any[]).filter((row) => {
      const order = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders;
      return !this.isGroceryDeliverySourceSoftDeleted(order);
    });

    const candidateOrders = Array.from(new Map(
      rows
        .map((row) => {
          const order = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders;
          return order?.id ? [String(order.id), order] : null;
        })
        .filter(Boolean) as Array<[string, any]>
    ).values());

    const recipientAliases = this.buildGroceryRecipientAliases(
      candidateOrders,
      customerId,
      customerRecord?.name || null,
      customerRecord?.phone || null,
    );

    const seededOrders = candidateOrders.filter((order: any) => this.extractGroceryOrderContext(order).customerId === customerId);
    const seededGroupKeys = new Set(seededOrders.map((order: any) => this.buildGroceryDeliveryGroupKey(order)));

    const targetOrderIds = new Set(
      candidateOrders
        .filter((order: any) => {
          if (seededGroupKeys.size > 0) {
            return seededGroupKeys.has(this.buildGroceryDeliveryGroupKey(order));
          }
          return this.matchesGroceryRecipient(order, customerId, recipientAliases);
        })
        .map((order: any) => String(order.id))
    );

    const ordersToday = candidateOrders.filter((order: any) => targetOrderIds.has(String(order.id)));
    const assignments = rows
      .filter((row) => {
        const order = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders;
        return order?.id && targetOrderIds.has(String(order.id));
      })
      .map((row) => {
        const order = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders;
        return { ...row, delivery_orders: order };
      });

    if (assignments.length === 0 && ordersToday.length === 0) return null;
    if (assignments.length === 0) return null;

    let customerName = recipientAliases.displayName || 'Khách hàng';
    if (ordersToday.length > 0) {
      const order = ordersToday[0];
      customerName = this.extractGroceryOrderContext(order).customerName || customerName;
    } else if (assignments.length > 0) {
      const order = assignments[0].delivery_orders;
      customerName = this.extractGroceryOrderContext(order).customerName || customerName;
    }

    const inferredUnitPriceByGroup = new Map<string, number>();

    const trySeedUnitPrice = (groupKey: string, unitPrice: number) => {
      if (!groupKey) return;
      const normalized = Number(unitPrice || 0);
      if (!(normalized > 0)) return;
      if (!inferredUnitPriceByGroup.has(groupKey)) {
        inferredUnitPriceByGroup.set(groupKey, normalized);
      }
    };

    ordersToday.forEach((order: any) => {
      const groupKey = this.buildGroceryDeliveryGroupKey(order);
      trySeedUnitPrice(groupKey, Number(order?.unit_price || 0));
    });

    assignments.forEach((dv: any) => {
      const order = dv.delivery_orders;
      const groupKey = this.buildGroceryDeliveryGroupKey(order);
      const quantity = Number(dv.assigned_quantity || 0);
      const expectedAmount = Number(dv.expected_amount || 0);
      if (quantity > 0 && expectedAmount > 0) {
        trySeedUnitPrice(groupKey, expectedAmount / quantity);
      }
    });

    const items = assignments.map((dv: any) => {
      const order = dv.delivery_orders;
      const quantity = Number(dv.assigned_quantity || 0);
      const expectedAmount = Number(dv.expected_amount || 0);
      const groupKey = this.buildGroceryDeliveryGroupKey(order);

      let unitPrice = Number(order?.unit_price || 0);
      if (!(unitPrice > 0) && quantity > 0 && expectedAmount > 0) {
        unitPrice = expectedAmount / quantity;
      }
      if (!(unitPrice > 0)) {
        unitPrice = Number(inferredUnitPriceByGroup.get(groupKey) || 0);
      }

      const derivedLineTotal = unitPrice > 0
        ? (unitPrice >= 1000 ? unitPrice : unitPrice * 1000) * quantity
        : 0;
      const total = expectedAmount > 0 ? expectedAmount : derivedLineTotal;

      return {
        deliveryTime: dv.delivery_time || format(new Date(), 'HH:mm'),
        licensePlate: dv.vehicles?.license_plate || '-',
        staffName: dv.profiles?.full_name || 'NV Giao hàng',
        quantity,
        productName: this.formatGroceryProductNameWithImportDate(order),
        price: unitPrice,
        total,
      };
    });

    const groupedTotals = new Map<string, { totalQuantity: number; assignedQuantity: number }>();
    ordersToday.forEach((order: any) => {
      const groupKey = this.buildGroceryDeliveryGroupKey(order);
      const current = groupedTotals.get(groupKey) || { totalQuantity: 0, assignedQuantity: 0 };

      const assignedOnDate = (order.delivery_vehicles || []).reduce((sum: number, dv: any) => {
        if (dv?.delivery_date !== date) return sum;
        return sum + (Number(dv.assigned_quantity) || 0);
      }, 0);

      current.totalQuantity += Number(order.total_quantity || 0);
      current.assignedQuantity += assignedOnDate;
      groupedTotals.set(groupKey, current);
    });

    let undeliveredQuantity = 0;
    groupedTotals.forEach((group) => {
      const undelivered = group.totalQuantity - group.assignedQuantity;
      if (undelivered > 0) {
        undeliveredQuantity += undelivered;
      }
    });

    return {
      shopName,
      customerName,
      date: format(new Date(date), 'dd/MM/yyyy'),
      items,
      undeliveredQuantity
    };
  }

  async getSupplierSummaryData(supabaseService: any, supplierId: string, date: string) {
    const { data: allOrders, error: allOrdersError } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        created_at,
        admin_confirmed_at,
        driver_name,
        received_by,
        profiles:profiles!received_by(full_name, role),
        delivery_orders(delivery_vehicles(driver_id, profiles!driver_id(full_name)))
      `)
      .eq('order_date', date)
      .is('deleted_at', null);

    // Fetch only this supplier's orders and required columns for public page
    const { data: supplierOrders, error: supplierError } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        created_at,
        admin_confirmed_at,
        driver_name,
        received_by,
        profiles:profiles!received_by(full_name, role),
        sender_name,
        notes,
        is_custom_amount,
        total_amount,
        payment_status,
        sender_customers:customers!vegetable_orders_sender_id_fkey(id, name),
        customers:customers!vegetable_orders_customer_id_fkey(id, name, phone),
        vegetable_order_items(quantity, unit_price, total_amount, package_type, item_note, products(name, base_price)),
        delivery_orders(delivery_vehicles(driver_id, vehicles(license_plate), profiles!driver_id(full_name)))
      `)
      .eq('order_date', date)
      .eq('customer_id', supplierId)
      .is('deleted_at', null);

    if (supplierError || !supplierOrders || supplierOrders.length === 0) return null;

    const rankSourceOrders = !allOrdersError && allOrders && allOrders.length > 0
      ? allOrders
      : supplierOrders;
    const dailyDriverRankMap = buildVegetableDailyDriverRankMap(rankSourceOrders);

    const supplierName = supplierOrders[0].customers?.name || 'Vựa';

    // Sort supplier orders by time
    const sortedSupplierOrders = [...supplierOrders].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });

    const mergedItems = this.buildSupplierSummaryItemsFromOrders(sortedSupplierOrders, dailyDriverRankMap);

    return {
      supplierName,
      date: format(new Date(date), 'dd/MM/yyyy'),
      items: mergedItems
    };
  }

  async getSenderSummaryData(supabaseService: any, senderId: string, date: string) {
    // 1. Fetch minimal daily dataset to build tai rank consistently with supplier summaries
    const { data: allOrders, error: allOrdersError } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        customer_id,
        created_at,
        admin_confirmed_at,
        driver_name,
        received_by,
        profiles:profiles!received_by(full_name, role),
        delivery_orders(delivery_vehicles(driver_id, profiles!driver_id(full_name)))
      `)
      .eq('order_date', date)
      .is('deleted_at', null);

    if (allOrdersError || !allOrders || allOrders.length === 0) return null;
    const dailyDriverRankMap = buildVegetableDailyDriverRankMap(allOrders);

    // 2. Fetch only this sender's orders and only required columns for public page
    const { data: senderOrders, error: senderError } = await supabaseService
      .from('vegetable_orders')
      .select(`
        id,
        created_at,
        admin_confirmed_at,
        driver_name,
        received_by,
        profiles:profiles!received_by(full_name, role),
        sender_customers:customers!vegetable_orders_sender_id_fkey(id, name, phone),
        customers:customers!vegetable_orders_customer_id_fkey(id, name),
        vegetable_order_items(quantity, package_type, item_note, products(name)),
        delivery_orders(delivery_vehicles(driver_id, vehicles(license_plate), profiles!driver_id(full_name)))
      `)
      .eq('order_date', date)
      .eq('sender_id', senderId)
      .is('deleted_at', null);

    if (senderError || !senderOrders || senderOrders.length === 0) return null;

    const senderName = senderOrders[0].sender_customers?.name || 'Người gửi';
    const items: any[] = [];

    // Sort sender orders by time
    const sortedSenderOrders = [...senderOrders].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id).localeCompare(String(b.id));
    });

    const resolveLicensePlate = (order: any): string => {
      return order.delivery_orders?.[0]?.delivery_vehicles?.[0]?.vehicles?.license_plate || '-';
    };

    const normalizeNote = (value: unknown): string => {
      const note = String(value || '').trim();
      return note === '-' ? '' : note;
    };

    sortedSenderOrders.forEach((order) => {
      const taiRank = getVegetableTaiRank(order, dailyDriverRankMap);
      const licensePlate = resolveLicensePlate(order);

      (order.vegetable_order_items || []).forEach((item: any) => {
        const note = normalizeNote(item.item_note);
        items.push({
          taiRank,
          licensePlate,
          quantity: item.quantity || 0,
          productName: item.products?.name || item.package_type || 'Hàng hóa',
          note,
          supplierName: order.customers?.name || '-',
        });
      });
    });

    const mergedMap = new Map<string, any>();
    items.forEach((item) => {
      const rowKey = `${item.supplierName}||${item.taiRank}||${item.licensePlate}||${item.productName}||${item.note || ''}`;
      const existing = mergedMap.get(rowKey);
      if (!existing) {
        mergedMap.set(rowKey, { ...item });
        return;
      }
      existing.quantity += item.quantity || 0;
    });

    const mergedItems = Array.from(mergedMap.values());

    return {
      senderName,
      date: format(new Date(date), 'dd/MM/yyyy'),
      items: mergedItems
    };
  }


  private buildRecipientPhoneForDelivery(delivery: any): string | null {
    return this.extractGroceryOrderContext(delivery).phone;
  }

  private pickFirstRecord<T = any>(value: any): T | null {
    if (Array.isArray(value)) {
      return (value[0] as T) || null;
    }
    return (value as T) || null;
  }

  private extractGroceryOrderContext(order: any): {
    importOrder: any;
    vegetableOrder: any;
    importCustomer: any;
    vegetableCustomer: any;
    customer: any;
    customerId: string | null;
    receiverName: string | null;
    customerName: string;
    phone: string | null;
  } {
    const importOrder = this.pickFirstRecord(order?.import_orders);
    const vegetableOrder = this.pickFirstRecord(order?.vegetable_orders);
    const importCustomer = this.pickFirstRecord(importOrder?.customers);
    const vegetableCustomer = this.pickFirstRecord(vegetableOrder?.customers);
    const customer = importCustomer || vegetableCustomer || null;
    const customerId =
      (customer?.id ? String(customer.id) : null) ||
      (importOrder?.customer_id ? String(importOrder.customer_id) : null) ||
      (vegetableOrder?.customer_id ? String(vegetableOrder.customer_id) : null);
    const receiverName =
      (importOrder?.receiver_name && String(importOrder.receiver_name).trim()) ||
      (vegetableOrder?.receiver_name && String(vegetableOrder.receiver_name).trim()) ||
      null;
    const customerName =
      receiverName ||
      customer?.name ||
      importOrder?.selected_alias ||
      vegetableOrder?.selected_alias ||
      'Khách hàng';
    const phone =
      importOrder?.receiver_phone ||
      importCustomer?.phone ||
      vegetableOrder?.receiver_phone ||
      vegetableCustomer?.phone ||
      null;

    return {
      importOrder,
      vegetableOrder,
      importCustomer,
      vegetableCustomer,
      customer,
      customerId,
      receiverName,
      customerName,
      phone,
    };
  }
}

export const zaloService = new ZaloService();

