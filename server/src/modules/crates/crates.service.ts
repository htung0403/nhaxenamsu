import { env } from '../../config/env';
import { supabaseService } from '../../config/supabase';
import { zaloService } from '../notifications/zalo.service';
import { logger } from '../../utils/logger';
import { DeliveryNoteGenerator, type CrateReceiptNoteData } from '../../utils/deliveryNoteGenerator';
import type { UserPayload } from '../../types';

export type CrateRole = 'sender' | 'receiver';
export type CrateReceiptType = 'intake' | 'allocation' | 'delivery';

type CrateHistoryFilters = {
  startDate?: string;
  endDate?: string;
};

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
  receiptImage?: CrateReceiptNoteData;
};

type NotificationAttachment = {
  data: Buffer;
  filename: `${string}.${string}`;
  metadata: { totalSize: number; width?: number; height?: number };
};

type CrateDeliveryVehicle = {
  id: string;
  license_plate: string;
  driver_id?: string | null;
  in_charge_id?: string | null;
  profiles?: { full_name?: string | null } | null;
  responsible_profile?: { full_name?: string | null } | null;
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

  private static async getProfileName(userId?: string | null) {
    if (!userId) return null;
    const { data, error } = await supabaseService
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      logger.warn('[CratesService] Failed to load profile name:', error);
      return null;
    }
    return data?.full_name || null;
  }

  private static async getDeliveryVehicle(vehicleId: string): Promise<CrateDeliveryVehicle> {
    const { data, error } = await supabaseService
      .from('vehicles')
      .select('id, license_plate, driver_id, in_charge_id, profiles:profiles!vehicles_driver_id_fkey(full_name), responsible_profile:profiles!vehicles_in_charge_id_fkey(full_name)')
      .eq('id', vehicleId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Không tìm thấy xe giao két');
    return data as CrateDeliveryVehicle;
  }

  private static isDriverOrLoaderRole(role?: string | null) {
    const normalizedRole = (role || '').toLowerCase();
    return normalizedRole === 'driver' ||
      normalizedRole.includes('driver') ||
      normalizedRole.includes('tai_xe') ||
      normalizedRole.includes('tài xế') ||
      normalizedRole.includes('lo_xe') ||
      normalizedRole.includes('lơ xe');
  }

  private static userCanDeliverWithVehicle(user: UserPayload | undefined, vehicle: CrateDeliveryVehicle) {
    if (!user || !this.isDriverOrLoaderRole(user.role)) return true;
    return vehicle.driver_id === user.id ||
      vehicle.in_charge_id === user.id ||
      vehicle.profiles?.full_name === user.full_name ||
      vehicle.responsible_profile?.full_name === user.full_name;
  }

  private static formatNoteDateTime(value?: string | null) {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false });
  }

  private static formatNoteTime(value?: string | null) {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false });
  }

  private static buildIntakeReceiptImage(record: any): CrateReceiptNoteData {
    const createdAt = record.created_at;
    return {
      title: 'Phiếu nhập két',
      customerName: record.sender?.name || '-',
      date: this.formatNoteDateTime(createdAt),
      staffName: record.creator?.full_name || 'Quản trị viên',
      receiptType: 'Nhập két',
      rows: [{
        time: this.formatNoteTime(createdAt),
        quantity: record.quantity,
        content: record.notes || '-',
        partner: record.sender?.name || '-',
        balance: `${record.sender_balance_after} két`,
        note: record.notes || '-',
      }],
    };
  }

  private static buildAllocationReceiptImage(record: any, target: 'sender' | 'receiver'): CrateReceiptNoteData {
    const createdAt = record.created_at;
    const isReceiver = target === 'receiver';
    return {
      title: isReceiver ? 'Phiếu nhận két' : 'Phiếu chia két',
      customerName: (isReceiver ? record.receiver?.name : record.sender?.name) || '-',
      date: this.formatNoteDateTime(createdAt),
      staffName: record.creator?.full_name || 'Quản trị viên',
      receiptType: isReceiver ? 'Nhận két' : 'Chia két',
      rows: [{
        time: this.formatNoteTime(createdAt),
        quantity: record.quantity,
        content: record.notes || '-',
        partner: isReceiver ? record.sender?.name || '-' : record.receiver?.name || '-',
        balance: isReceiver
          ? `${record.receiver_pending_after} két`
          : `${record.sender_balance_after} két`,
        note: isReceiver ? `Tăng chờ ${record.pending_added} két` : `Bù nợ ${record.debt_applied} két`,
      }],
    };
  }

  private static buildDeliveryReceiptImage(record: any): CrateReceiptNoteData {
    const deliveredAt = record.delivered_at || record.created_at;
    return {
      title: 'Phiếu giao két',
      customerName: record.receiver?.name || '-',
      date: this.formatNoteDateTime(deliveredAt),
      staffName: record.driver?.full_name || 'Tài xế',
      receiptType: `Xe: ${record.vehicle?.license_plate || '-'}`,
      rows: [{
        time: this.formatNoteTime(deliveredAt),
        quantity: record.quantity,
        content: 'Giao két',
        partner: record.receiver?.name || '-',
        balance: `${record.receiver_pending_after} két`,
        note: record.notes || (record.debt_created > 0 ? `Nợ phát sinh ${record.debt_created} két` : '-'),
      }],
    };
  }

  private static async buildReceiptAttachment(type: CrateReceiptType, transactionId: string, receiptImage?: CrateReceiptNoteData): Promise<NotificationAttachment[]> {
    if (!receiptImage) return [];
    try {
      const pngBuffer = await DeliveryNoteGenerator.generateCrateReceiptPng(receiptImage);
      return [{
        data: pngBuffer,
        filename: `phieu-ket-${type}-${transactionId}.png`,
        metadata: { totalSize: pngBuffer.length },
      }];
    } catch (error) {
      logger.warn('[CratesService] Failed to generate crate receipt image:', error);
      return [];
    }
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
        const attachments = await this.buildReceiptAttachment(options.type, options.transactionId, options.receiptImage);
        const result = await zaloService.sendImageMessage({
          recipientPhone: phone,
          imageUrls: [],
          attachments,
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
    const staffName = await this.getProfileName(userId);
    const createdAt = data.intake?.created_at;
    const notification = await this.logAndSendNotification({
      type: 'intake',
      transactionId: data.intake.id,
      target: { customerId: sender.id, name: sender.name, phone: sender.phone },
      caption: `Phiếu nhập két: ${sender.name} gửi ${payload.quantity} két. Số két đang gửi: ${data.account.sender_balance}.`,
      triggeredBy: userId,
      receiptImage: {
        title: 'Phiếu nhập két',
        customerName: sender.name,
        date: this.formatNoteDateTime(createdAt),
        staffName: staffName || 'Quản trị viên',
        receiptType: 'Nhập két',
        rows: [{
          time: this.formatNoteTime(createdAt),
          quantity: payload.quantity,
          content: payload.notes || '-',
          partner: sender.name,
          balance: `${data.account.sender_balance} két`,
          note: payload.notes || '-',
        }],
      },
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
    const staffName = await this.getProfileName(userId);
    const createdAt = data.allocation?.created_at;
    const senderNotification = await this.logAndSendNotification({
      type: 'allocation',
      transactionId: data.allocation.id,
      target: { customerId: sender.id, name: sender.name, phone: sender.phone },
      caption: `Phiếu chia két: đã chia ${payload.quantity} két từ ${sender.name} cho ${receiver.name}. Số két còn gửi: ${data.sender_account.sender_balance}.`,
      triggeredBy: userId,
      receiptImage: {
        title: 'Phiếu chia két',
        customerName: sender.name,
        date: this.formatNoteDateTime(createdAt),
        staffName: staffName || 'Quản trị viên',
        receiptType: 'Chia két',
        rows: [{
          time: this.formatNoteTime(createdAt),
          quantity: payload.quantity,
          content: payload.notes || '-',
          partner: receiver.name,
          balance: `${data.sender_account.sender_balance} két`,
          note: `Bù nợ ${data.allocation.debt_applied} két`,
        }],
      },
    });
    const receiverNotification = await this.logAndSendNotification({
      type: 'allocation',
      transactionId: data.allocation.id,
      target: { customerId: receiver.id, name: receiver.name, phone: receiver.phone },
      caption: `Phiếu nhận két: ${receiver.name} được chia ${payload.quantity} két từ ${sender.name}. Chờ giao: ${data.receiver_account.receiver_pending}, nợ két: ${data.receiver_account.receiver_debt}.`,
      triggeredBy: userId,
      receiptImage: {
        title: 'Phiếu nhận két',
        customerName: receiver.name,
        date: this.formatNoteDateTime(createdAt),
        staffName: staffName || 'Quản trị viên',
        receiptType: 'Nhận két',
        rows: [{
          time: this.formatNoteTime(createdAt),
          quantity: payload.quantity,
          content: payload.notes || '-',
          partner: sender.name,
          balance: `${data.receiver_account.receiver_pending} két`,
          note: `Tăng chờ ${data.allocation.pending_added} két`,
        }],
      },
    });

    return { ...data, notifications: [senderNotification, receiverNotification] };
  }

  static async createDelivery(payload: { receiver_customer_id: string; quantity: number; notes?: string | null; image_urls?: string[]; vehicle_id?: string | null }, user?: UserPayload) {
    if (!payload.vehicle_id) throw new Error('Vui lòng chọn xe giao két');
    const vehicle = await this.getDeliveryVehicle(payload.vehicle_id);
    if (!this.userCanDeliverWithVehicle(user, vehicle)) {
      throw new Error('Bạn chỉ được giao két bằng xe mình phụ trách');
    }
    const deliveryDriverId = vehicle.driver_id || vehicle.in_charge_id || null;

    const { data, error } = await supabaseService.rpc('crate_record_delivery', {
      p_receiver_customer_id: payload.receiver_customer_id,
      p_quantity: payload.quantity,
      p_notes: payload.notes || null,
      p_image_urls: payload.image_urls || [],
      p_driver_id: deliveryDriverId,
      p_vehicle_id: vehicle.id,
    });
    if (error) throw error;

    const [receiver, driverName] = await Promise.all([
      this.getCustomer(payload.receiver_customer_id),
      this.getProfileName(deliveryDriverId),
    ]);
    const deliveredAt = data.delivery?.delivered_at || data.delivery?.created_at;
    const notification = await this.logAndSendNotification({
      type: 'delivery',
      transactionId: data.delivery.id,
      target: { customerId: receiver.id, name: receiver.name, phone: receiver.phone },
      caption: `Phiếu giao két: đã giao ${payload.quantity} két cho ${receiver.name}. Chờ giao còn: ${data.receiver_account.receiver_pending}, nợ két: ${data.receiver_account.receiver_debt}.`,
      triggeredBy: user?.id,
      receiptImage: {
        title: 'Phiếu giao két',
        customerName: receiver.name,
        date: this.formatNoteDateTime(deliveredAt),
        staffName: driverName || vehicle.profiles?.full_name || vehicle.responsible_profile?.full_name || 'Tài xế',
        receiptType: `Xe: ${vehicle.license_plate || '-'}`,
        rows: [{
          time: this.formatNoteTime(deliveredAt),
          quantity: payload.quantity,
          content: 'Giao két',
          partner: receiver.name,
          balance: `${data.receiver_account.receiver_pending} két`,
          note: payload.notes || (data.delivery.debt_created > 0 ? `Nợ phát sinh ${data.delivery.debt_created} két` : '-'),
        }],
      },
    });

    return { ...data, notification };
  }

  static async getHistory(customerId?: string, filters: CrateHistoryFilters = {}) {
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 6);
    defaultStartDate.setHours(0, 0, 0, 0);

    const fromDate = filters.startDate ? this.getDateBoundary(filters.startDate, 'start') : defaultStartDate;
    const toDate = filters.endDate ? this.getDateBoundary(filters.endDate, 'end') : new Date();

    if (fromDate > toDate) throw new Error('Ngày bắt đầu không được lớn hơn ngày kết thúc');

    const intakesQuery = supabaseService
      .from('crate_intakes')
      .select('*, sender:customers!crate_intakes_sender_customer_id_fkey(id, name, phone), creator:profiles!crate_intakes_created_by_fkey(id, full_name)')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    const allocationsQuery = supabaseService
      .from('crate_allocations')
      .select('*, sender:customers!crate_allocations_sender_customer_id_fkey(id, name, phone), receiver:customers!crate_allocations_receiver_customer_id_fkey(id, name, phone), creator:profiles!crate_allocations_created_by_fkey(id, full_name)')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    const deliveriesQuery = supabaseService
      .from('crate_deliveries')
      .select('*, receiver:customers!crate_deliveries_receiver_customer_id_fkey(id, name, phone), driver:profiles!crate_deliveries_driver_id_fkey(id, full_name), vehicle:vehicles!crate_deliveries_vehicle_id_fkey(id, license_plate)')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
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

  private static getDateBoundary(value: string, boundary: 'start' | 'end') {
    const [year, month, day] = value.split('-').map(Number);
    return boundary === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
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
      if (!targetCustomerId) {
        const senderNotification = await this.logAndSendNotification({
          type,
          transactionId,
          target: { customerId: record.sender.id, name: record.sender.name, phone: record.sender.phone },
          caption: `Phiếu chia két: đã chia ${record.quantity} két từ ${record.sender.name} cho ${record.receiver.name}.`,
          triggeredBy: userId,
          receiptImage: this.buildAllocationReceiptImage(record, 'sender'),
        });
        const receiverNotification = await this.logAndSendNotification({
          type,
          transactionId,
          target: { customerId: record.receiver.id, name: record.receiver.name, phone: record.receiver.phone },
          caption: `Phiếu nhận két: ${record.receiver.name} được chia ${record.quantity} két từ ${record.sender.name}.`,
          triggeredBy: userId,
          receiptImage: this.buildAllocationReceiptImage(record, 'receiver'),
        });
        return [senderNotification, receiverNotification];
      }

      const isReceiver = targetCustomerId === record.receiver.id;
      const customer = isReceiver ? record.receiver : record.sender;
      target = { customerId: customer.id, name: customer.name, phone: customer.phone };
      caption = isReceiver
        ? `Phiếu nhận két: ${record.receiver.name} được chia ${record.quantity} két từ ${record.sender.name}.`
        : `Phiếu chia két: đã chia ${record.quantity} két từ ${record.sender.name} cho ${record.receiver.name}.`;
    } else {
      target = { customerId: record.receiver.id, name: record.receiver.name, phone: record.receiver.phone };
      caption = `Phiếu giao két: đã giao ${record.quantity} két cho ${record.receiver.name}.`;
    }

    const receiptImage = type === 'intake'
      ? this.buildIntakeReceiptImage(record)
      : type === 'allocation'
        ? this.buildAllocationReceiptImage(record, targetCustomerId === record.receiver.id ? 'receiver' : 'sender')
        : this.buildDeliveryReceiptImage(record);

    return this.logAndSendNotification({ type, transactionId, target, caption, triggeredBy: userId, receiptImage });
  }
}


