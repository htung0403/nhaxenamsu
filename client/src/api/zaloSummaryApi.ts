import axiosClient from './axiosClient';

export type ZaloSummaryType = 'grocery' | 'grocery_receiver' | 'supplier' | 'sender';
export type ZaloSummaryStatus = 'pending' | 'success' | 'failed' | 'skipped';

export interface ZaloSummaryStatusItem {
  targetId: string;
  targetName: string;
  targetPhone: string | null;
  orderCount: number;
  itemRowCount: number;
  publicLink: string;
  status: ZaloSummaryStatus;
  lastError: string | null;
  messageId: string | null;
  lastSentAt: string | null;
  triggeredBy: 'scheduler' | 'manual' | null;
}

export interface ZaloSummaryStatusResponse {
  type: ZaloSummaryType;
  date: string;
  summary: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  items: ZaloSummaryStatusItem[];
}

export interface SendZaloSummaryPayload {
  type: ZaloSummaryType;
  targetId: string;
  date: string;
}

export interface SendZaloSummaryResponse {
  success: boolean;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  publicLink: string;
  messageId?: string | null;
}

export interface SendVegetableArrivalNoticePayload {
  date: string;
  taiRank: number;
}

export interface VegetableArrivalNoticeItem {
  targetId: string;
  targetName: string;
  targetPhone: string | null;
  orderCount: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string | null;
  messageId?: string | null;
}

export interface SendVegetableArrivalNoticeResponse {
  date: string;
  taiRank: number;
  totalTargets: number;
  sent: number;
  failed: number;
  skipped: number;
  items: VegetableArrivalNoticeItem[];
}

export const zaloSummaryApi = {
  getSummaryStatus: async (type: ZaloSummaryType, date: string) => {
    const response = await axiosClient.get<ZaloSummaryStatusResponse>('/notifications/zalo/summary-status', {
      params: { type, date },
    });
    return response.data;
  },

  sendSummary: async (payload: SendZaloSummaryPayload) => {
    const response = await axiosClient.post<SendZaloSummaryResponse>('/notifications/zalo/send-summary', payload);
    return response.data;
  },

  sendVegetableArrivalNotice: async (payload: SendVegetableArrivalNoticePayload) => {
    const response = await axiosClient.post<SendVegetableArrivalNoticeResponse>(
      '/notifications/zalo/send-vegetable-arrival',
      payload,
    );
    return response.data;
  },
};
