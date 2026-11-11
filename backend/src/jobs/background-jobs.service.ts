import { sql } from 'drizzle-orm';
import { withRlsTx } from '../db/index.js';
import { realtimeBroker } from '../modules/realtime/realtime.service.js';

export class BackgroundJobsService {
  /**
   * Cancels `awaiting_payment` orders that have exceeded `restaurant_settings.payment_timeout_minutes`.
   * Note: The DB trigger `fn_order_status_and_immutability_trigger` automatically restores coupon `used_count`.
   */
  public static async expireUnpaidCardOrders(): Promise<{ expiredCount: number; orderIds: string[] }> {
    return withRlsTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        UPDATE public.orders o
        SET
          status = 'cancelled',
          cancel_reason = 'Ödeme süresi doldu (Unpaid card order timeout)'
        FROM public.restaurant_settings s
        WHERE s.id = 1
          AND o.status = 'awaiting_payment'
          AND o.created_at < clock_timestamp() - (s.payment_timeout_minutes || ' minutes')::interval
        RETURNING o.id
      `);

      const orderIds = rows.map((r) => r.id);
      return { expiredCount: orderIds.length, orderIds };
    });
  }

  /**
   * Detects `new` orders that have not been accepted by kitchen staff within `unaccepted_order_alert_minutes`.
   */
  public static async checkUnacceptedOrdersAlert(): Promise<{ alertedOrderIds: string[] }> {
    return withRlsTx({ role: 'system' }, async (tx) => {
      const rows = await tx.execute<{ id: string; order_number: number }>(sql`
        SELECT o.id, o.order_number
        FROM public.orders o
        CROSS JOIN public.restaurant_settings s
        WHERE s.id = 1
          AND o.status = 'new'
          AND o.created_at < clock_timestamp() - (s.unaccepted_order_alert_minutes || ' minutes')::interval
      `);

      for (const row of rows) {
        realtimeBroker.publish('order.unaccepted_alert', {
          orderId: row.id,
          orderNumber: row.order_number,
        });
      }

      return { alertedOrderIds: rows.map((r) => r.id) };
    });
  }

  /**
   * Cleans up expired OTP codes and revoked/expired refresh tokens older than 7 days.
   */
  public static async cleanupExpiredAuthRecords(): Promise<{
    deletedOtps: number;
    deletedRefreshTokens: number;
  }> {
    return withRlsTx({ role: 'system' }, async (tx) => {
      const otpRes = await tx.execute<{ count: number }>(sql`
        WITH deleted AS (
          DELETE FROM public.otp_codes
          WHERE expires_at < clock_timestamp() - interval '1 day'
          RETURNING 1
        )
        SELECT count(*)::int AS count FROM deleted
      `);

      const rtRes = await tx.execute<{ count: number }>(sql`
        WITH deleted AS (
          DELETE FROM public.refresh_tokens
          WHERE expires_at < clock_timestamp() - interval '7 days'
          RETURNING 1
        )
        SELECT count(*)::int AS count FROM deleted
      `);

      return {
        deletedOtps: otpRes[0]?.count ?? 0,
        deletedRefreshTokens: rtRes[0]?.count ?? 0,
      };
    });
  }
}

