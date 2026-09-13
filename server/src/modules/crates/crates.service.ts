import { env } from '../../config/env';
import { supabaseService } from '../../config/supabase';
import { zaloService } from '../notifications/zalo.service';
import { logger } from '../../utils/logger';

export type CrateRole = 'sender' | 'receiver';
export type CrateReceiptType = 'intake' | 'allocation' | 'delivery';

type NotifyTarget = {
  customerId: string;
  name?: string | null;
  phone?: string | null;
};

type NotifyOptions = {
  type: CrateReceiptType;
  transactionId: string;
  target: NotifyTarget;
  caption: string;
  triggeredBy?: string | null;
};

const receiptTokenDate = 'receipt';

export class CratesService {
  private static buildPublicLink(type: CrateReceiptType, transactionId: string) {
    const token = zaloService.generatePublicToken(`crate-${type}`, transactionId, receiptTokenDate);
    return `${env.CLIENT_URL.replace(/\/+$/, '')}/public/crates/${type}/${transactionId}/${token}`;
  }

  static verifyReceiptToken(type: string, transactionId: string, token: string) {
    return zaloService.verifyPublicToken(`crate-${type}`, transactionId, receiptTokenDate, token);
  }

  private static async getCustomer(customerId: string) {
    const { data, error } = await supabaseService
      .from('customers')
      .select('id, name, phone, address')
      .eq('id', customerId)
      .single();
    if (error) throw error;
    return data;
  }

  private static async logAndSendNotification(options: NotifyOptions) {
    const publicLink = this.buildPublicLink(options.type, options.transactionId);
    const phone = options.target.phone || null;
    let status: 'sent' | 'failed' | 'skipped' = 'skipped';
    let errorMessage: string | null = null;
    let messageId: string | null = null;

    if (!phone) {
      errorMessage = 'Khách hàng chưa có số điện thoại';
    } else {
      try {
        const result = await zaloService.sendImageMessage({
          recipientPhone: phone,
          imageUrls: [],
          caption: `${options.caption}\n\nXem phiếu: ${publicLink}`,
        });
        status = result.success ? 'sent' : 'failed';
        errorMessage = result.error || null;
        messageId = result.messageId || null;
      } catch (error: any) {
        status = 'failed';
        errorMessage = error?.message || String(error);
        logger.error('[CratesService] Zalo send failed:', error);
      }
    }

    const { data, error } = await supabaseService
      .from('crate_notification_logs')
      .insert({
        transaction_type: options.type,
        transaction_id: options.transactionId,
        target_customer_id: options.target.customerId,
        target_name: options.target.name || null,
        target_phone: phone,
        public_link: publicLink,
        status,
        error_message: errorMessage,
        message_id: messageId,
        triggered_by: options.triggeredBy || null,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('[CratesService] Failed to log notification:', error);
      return { status, error_message: errorMessage, message_id: messageId, public_link: publicLink };
    }

    return data;
  }

  static async listAccounts(role?: CrateRole) {
    let query = supabaseService
      .from('crate_accounts')
      .select('*, customer:customers!crate_accounts_customer_id_fkey(id, name, phone, address, customer_type)')
      .order('updated_at', { ascending: false });

    if (role === 'sender') query = query.eq('is_sender', true);
    if (role === 'receiver') query = query.eq('is_receiver', true);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async setRoles(customerIds: string[], role: CrateRole, enabled: boolean) {
    const uniqueIds = Array.from(new Set(customerIds));
    const rows = uniqueIds.map((customerId) => ({
      customer_id: customerId,
      is_sender: role === 'sender' ? enabled : false,
      is_receiver: role === 'receiver' ? enabled : false,
      updated_at: new Date().toISOString(),
    }));

    for (const customerId of uniqueIds) {
      const patch = role === 'sender'
        ? { is_sender: enabled, updated_at: new Date().toISOString() }
        : { is_receiver: enabled, updated_at: new Date().toISOString() };
      const { error } = await supabaseService
        .from('crate_accounts')
        .upsert({ customer_id: customerId, ...patch }, { onConflict: 'customer_id' });
      if (error) throw error;
    }

    return { updated: uniqueIds.length, role, enabled, rows };
  }

  static async createIntake(payload: { sender_customer_id: string; quantity: number; notes?: string | null }, userId?: string) {
    const { data, error } = await supabaseService.rpc('crate_record_intake', {
      p_sender_customer_id: payload.sender_customer_id,
      p_quantity: payload.quantity,
      p_notes: payload.notes || null,
      p_created_by: userId || null,
    });
    if (error) throw error;

    const sender = await this.getCustomer(payload.sender_customer_id);
    const notification = await this.logAndSendNotification({
      type: 'intake',
      transactionId: data.intake.id,
      target: { customerId: sender.id, name: sender.name, phone: sender.phone },
      caption: `Phiếu nhập két: ${sender.name} gửi ${payload.quantity} két. Số két đang gửi: ${data.account.sender_balance}.`,
      triggeredBy: userId,
    });

    return { ...data, notification };
  }

  static async createAllocation(payload: { sender_customer_id: string; receiver_customer_id: string; quantity: number; notes?: string | null }, userId?: string) {
    const { data, error } = await supabaseService.rpc('crate_record_allocation', {
      p_sender_customer_id: payload.sender_customer_id,
      p_receiver_customer_id: payload.receiver_customer_id,
      p_quantity: payload.quantity,
      p_notes: payload.notes || null,
      p_created_by: userId || null,
    });
    if (error) throw error;

    const [sender, receiver] = await Promise.all([
      this.getCustomer(payload.sender_customer_id),
      this.getCustomer(payload.receiver_customer_id),
    ]);
    const senderNotification = await this.logAndSendNotification({
      type: 'allocation',
      transactionId: data.allocation.id,
      target: { customerId: sender.id, name: sender.name, phone: sender.phone },
      caption: `Phiếu chia két: đã chia ${payload.quantity} két từ ${sender.name} cho ${receiver.name}. Số két còn gửi: ${data.sender_account.sender_balance}.`,
      triggeredBy: userId,
    });
    const receiverNotification = await this.logAndSendNotification({
      type: 'allocation',
      transactionId: data.allocation.id,
      target: { customerId: receiver.id, name: receiver.name, phone: receiver.phone },
      caption: `Phiếu nhận két: ${receiver.name} được chia ${payload.quantity} két từ ${sender.name}. Chờ giao: ${data.receiver_account.receiver_pending}, nợ két: ${data.receiver_account.receiver_debt}.`,
      triggeredBy: userId,
    });

    return { ...data, notifications: [senderNotification, receiverNotification] };
  }

  static async createDelivery(payload: { receiver_customer_id: string; quantity: number; notes?: string | null; image_urls?: string[]; vehicle_id?: string | null }, userId?: string) {
    const { data, error } = await supabaseService.rpc('crate_record_delivery', {
      p_receiver_customer_id: payload.receiver_customer_id,
      p_quantity: payload.quantity,
      p_notes: payload.notes || null,
      p_image_urls: payload.image_urls || [],
      p_driver_id: userId || null,
          p_vehicle_id: payload.vehicle_id || null,
    });
    if (error) throw error;

    const receiver = await this.getCustomer(payload.receiver_customer_id);
    const notification = await this.logAndSendNotification({
      type: 'delivery',
      transactionId: data.delivery.id,
      target: { customerId: receiver.id, name: receiver.name, phone: receiver.phone },
      caption: `Phiếu giao két: đã giao ${payload.quantity} két cho ${receiver.name}. Chờ giao còn: ${data.receiver_account.receiver_pending}, nợ két: ${data.receiver_account.receiver_debt}.`,
      triggeredBy: userId,
    });

    return { ...data, notification };
  }

  static async getHistory(customerId?: string) {
    const intakesQuery = supabaseService
      .from('crate_intakes')
      .select('*, sender:customers!crate_intakes_sender_customer_id_fkey(id, name, phone), creator:profiles!crate_intakes_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    const allocationsQuery = supabaseService
      .from('crate_allocations')
      .select('*, sender:customers!crate_allocations_sender_customer_id_fkey(id, name, phone), receiver:customers!crate_allocations_receiver_customer_id_fkey(id, name, phone), creator:profiles!crate_allocations_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    const deliveriesQuery = supabaseService
      .from('crate_deliveries')
      .select('*, receiver:customers!crate_deliveries_receiver_customer_id_fkey(id, name, phone), driver:profiles!crate_deliveries_driver_id_fkey(id, full_name), vehicle:vehicles!crate_deliveries_vehicle_id_fkey(id, license_plate)')
      .order('created_at', { ascending: false })
      .limit(100);

    const [intakes, allocations, deliveries] = await Promise.all([
      customerId ? intakesQuery.eq('sender_customer_id', customerId) : intakesQuery,
      customerId ? allocationsQuery.or(`sender_customer_id.eq.${customerId},receiver_customer_id.eq.${customerId}`) : allocationsQuery,
      customerId ? deliveriesQuery.eq('receiver_customer_id', customerId) : deliveriesQuery,
    ]);

    if (intakes.error) throw intakes.error;
    if (allocations.error) throw allocations.error;
    if (deliveries.error) throw deliveries.error;

    return { intakes: intakes.data || [], allocations: allocations.data || [], deliveries: deliveries.data || [] };
  }

  static async getReceipt(type: CrateReceiptType, transactionId: string) {
    if (type === 'intake') {
      const { data, error } = await supabaseService
        .from('crate_intakes')
        .select('*, sender:customers!crate_intakes_sender_customer_id_fkey(id, name, phone, address), creator:profiles!crate_intakes_created_by_fkey(id, full_name)')
        .eq('id', transactionId)
        .single();
      if (error) throw error;
      return { type, record: data };
    }

    if (type === 'allocation') {
      const { data, error } = await supabaseService
        .from('crate_allocations')
        .select('*, sender:customers!crate_allocations_sender_customer_id_fkey(id, name, phone, address), receiver:customers!crate_allocations_receiver_customer_id_fkey(id, name, phone, address), creator:profiles!crate_allocations_created_by_fkey(id, full_name)')
        .eq('id', transactionId)
        .single();
      if (error) throw error;
      return { type, record: data };
    }

    const { data, error } = await supabaseService
      .from('crate_deliveries')
      .select('*, receiver:customers!crate_deliveries_receiver_customer_id_fkey(id, name, phone, address), driver:profiles!crate_deliveries_driver_id_fkey(id, full_name), vehicle:vehicles!crate_deliveries_vehicle_id_fkey(id, license_plate)')
      .eq('id', transactionId)
      .single();
    if (error) throw error;
    return { type, record: data };
  }

  static async resendNotification(type: CrateReceiptType, transactionId: string, targetCustomerId?: string, userId?: string) {
    const receipt = await this.getReceipt(type, transactionId);
    const record: any = receipt.record;
    let target: NotifyTarget;
    let caption: string;

    if (type === 'intake') {
      target = { customerId: record.sender.id, name: record.sender.name, phone: record.sender.phone };
      caption = `Phiếu nhập két: ${record.sender.name} gửi ${record.quantity} két.`;
    } else if (type === 'allocation') {
      const isReceiver = targetCustomerId === record.receiver.id;
      const customer = isReceiver ? record.receiver : record.sender;
      target = { customerId: customer.id, name: customer.name, phone: customer.phone };
      caption = `Phiếu chia két: ${record.quantity} két từ ${record.sender.name} cho ${record.receiver.name}.`;
    } else {
      target = { customerId: record.receiver.id, name: record.receiver.name, phone: record.receiver.phone };
      caption = `Phiếu giao két: đã giao ${record.quantity} két cho ${record.receiver.name}.`;
    }

    return this.logAndSendNotification({ type, transactionId, target, caption, triggeredBy: userId });
  }
}


