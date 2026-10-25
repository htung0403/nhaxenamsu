import type { ImportOrder } from '../types';

export const getHistorySender = (order: ImportOrder) => order.is_return_to_sg
  ? order.customers?.name || order.sender_name || '-'
  : order.selected_alias || order.customers?.name || order.sender_name || '-';

export const getHistoryReceiver = (order: ImportOrder) => order.is_return_to_sg
  ? order.receiver_name || '-'
  : order.profiles?.full_name || order.selected_alias || order.receiver_name || '-';
