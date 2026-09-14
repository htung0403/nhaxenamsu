import type { CrateAllocation, CrateDelivery, CrateHistory, CrateIntake, CrateReceiptType } from '../../api/cratesApi';

export type CrateHistoryEventKind = 'intake' | 'allocation' | 'delivery';

export type CrateHistoryEvent = {
  id: string;
  kind: CrateHistoryEventKind;
  receiptType: CrateReceiptType;
  type: string;
  at: string;
  text: string;
  searchableText: string;
  quantity: number;
  href: string;
  senderName?: string;
  senderPhone?: string;
  receiverName?: string;
  receiverPhone?: string;
  note?: string | null;
};

const formatNumber = (value?: number | null) => new Intl.NumberFormat('vi-VN').format(value || 0);

const buildSearchText = (...values: Array<string | number | null | undefined>) =>
  values.filter(value => value !== undefined && value !== null && String(value).trim()).join(' ').toLowerCase();

const buildIntakeEvent = (item: CrateIntake): CrateHistoryEvent => {
  const senderName = item.sender?.name || 'Khách gửi';
  const senderPhone = item.sender?.phone || '';
  const text = `${senderName} gửi ${formatNumber(item.quantity)} két`;
  return {
    id: item.id,
    kind: 'intake',
    receiptType: 'intake',
    type: 'Nhập két',
    at: item.created_at,
    text,
    searchableText: buildSearchText('nhập két', senderName, senderPhone, item.quantity, item.notes, item.creator?.full_name),
    quantity: item.quantity,
    href: `/app/hang-hoa/in-phieu-ket?type=intake&id=${item.id}`,
    senderName,
    senderPhone,
    note: item.notes,
  };
};

const buildAllocationEvent = (item: CrateAllocation): CrateHistoryEvent => {
  const senderName = item.sender?.name || 'Khách gửi';
  const receiverName = item.receiver?.name || 'Khách nhận';
  const senderPhone = item.sender?.phone || '';
  const receiverPhone = item.receiver?.phone || '';
  const text = `${senderName} → ${receiverName}: ${formatNumber(item.quantity)} két`;
  return {
    id: item.id,
    kind: 'allocation',
    receiptType: 'allocation',
    type: 'Chia két',
    at: item.created_at,
    text,
    searchableText: buildSearchText('chia két', senderName, receiverName, senderPhone, receiverPhone, item.quantity, item.notes, item.creator?.full_name),
    quantity: item.quantity,
    href: `/app/hang-hoa/in-phieu-ket?type=allocation&id=${item.id}`,
    senderName,
    senderPhone,
    receiverName,
    receiverPhone,
    note: item.notes,
  };
};

const buildDeliveryEvent = (item: CrateDelivery): CrateHistoryEvent => {
  const receiverName = item.receiver?.name || 'Khách nhận';
  const receiverPhone = item.receiver?.phone || '';
  const text = `${receiverName} nhận ${formatNumber(item.quantity)} két`;
  return {
    id: item.id,
    kind: 'delivery',
    receiptType: 'delivery',
    type: 'Giao két',
    at: item.delivered_at || item.created_at,
    text,
    searchableText: buildSearchText('giao két', receiverName, receiverPhone, item.quantity, item.notes, item.driver?.full_name, item.vehicle?.license_plate),
    quantity: item.quantity,
    href: `/app/hang-hoa/in-phieu-ket?type=delivery&id=${item.id}`,
    receiverName,
    receiverPhone,
    note: item.notes,
  };
};

export const buildCrateHistoryEvents = (history: CrateHistory): CrateHistoryEvent[] => [
  ...history.intakes.map(buildIntakeEvent),
  ...history.allocations.map(buildAllocationEvent),
  ...history.deliveries.map(buildDeliveryEvent),
].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
