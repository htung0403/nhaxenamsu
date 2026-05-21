import cron from 'node-cron';
import { env } from '../../config/env';
import { supabaseService } from '../../config/supabase';
import { DriverTrackingService } from './driver-tracking.service';
import { driverTrackingMetrics } from './driver-tracking.metrics';

const notifyAdmins = async (title: string, description: string, type: 'info' | 'warning' = 'warning') => {
  const { data: admins } = await supabaseService
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'manager']);

  if (admins?.length) {
    await supabaseService.from('notifications').insert(
      admins.map((admin: { id: string }) => ({
        user_id: admin.id,
        title,
        description,
        type,
        is_read: false,
        created_at: new Date().toISOString(),
      })),
    );
  }

  if (env.SLACK_WEBHOOK_URL) {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `*${title}*\n${description}` }),
    });
  }
};

export const initDriverTrackingScheduler = () => {
  cron.schedule('10 2 * * *', async () => {
    try {
      await DriverTrackingService.cleanupHistory();
    } catch (error) {
      console.error('[DriverTrackingScheduler] cleanup failed:', error);
    }
  });

  cron.schedule('*/15 * * * *', async () => {
    try {
      const health = await DriverTrackingService.getHealthMetrics();
      const counters = driverTrackingMetrics.snapshot();

      if (health.egressPercent >= 70) {
        await notifyAdmins(
          'Driver map egress warning',
          `Supabase egress đang ở ${health.egressPercent}%. Nếu vượt 80% trước ngày 20, tắt DRIVER_MAP_REALTIME_ENABLED để chuyển polling 20s.`,
        );
      }

      if (health.fallbackRecommended) {
        await notifyAdmins(
          'Driver map realtime fallback recommended',
          'Egress đã vượt 80% trước ngày 20. Hãy đặt DRIVER_MAP_REALTIME_ENABLED=false để chuyển admin map sang polling 20s.',
        );
      }

      if (counters.rateLimitRejected >= 20) {
        await notifyAdmins(
          'Driver location rate limit spike',
          `Location endpoint đã rate-limit ${counters.rateLimitRejected} request từ khi server start. Kiểm tra driver app nếu số này tăng nhanh.`,
        );
      }
    } catch (error) {
      console.error('[DriverTrackingScheduler] alert check failed:', error);
    }
  });
};
