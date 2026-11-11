import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import {
  apiClient,
  readonlyClient,
  verifyDbSecurityPosture,
  withTx,
  schema,
  closeDbPools,
} from '../src/db/index.js';
import { env } from '../src/config/env.js';

describe('Step 2: Database Connection Security Posture & RLS Isolation', () => {
  afterAll(async () => {
    await closeDbPools();
  });

  it('1. verifies API connects strictly as app_api and Readonly as app_readonly (non-superuser, NOBYPASSRLS, owns 0 tables)', async () => {
    const posture = await verifyDbSecurityPosture();
    expect(posture.api.roleName).toBe('app_api');
    expect(posture.api.isSuperuser).toBe(false);
    expect(posture.api.bypassRls).toBe(false);
    expect(posture.api.ownedPublicTables).toBe(0);

    expect(posture.readonly.roleName).toBe('app_readonly');
    expect(posture.readonly.isSuperuser).toBe(false);
    expect(posture.readonly.bypassRls).toBe(false);
    expect(posture.readonly.ownedPublicTables).toBe(0);
  });

  it('2. fails fast if API pool connects as postgres superuser or wrong role', async () => {
    const superSql = postgres('postgresql://postgres@127.0.0.1:5434/kardesler_db', { max: 1 });
    try {
      await expect(verifyDbSecurityPosture(superSql, readonlyClient)).rejects.toThrow(
        /Security violation/,
      );
      await expect(verifyDbSecurityPosture(readonlyClient, readonlyClient)).rejects.toThrow(
        /Security violation/,
      );
    } finally {
      await superSql.end({ timeout: 2 });
    }
  });

  it('3. applies connection-level timeouts (statement_timeout, lock_timeout, idle_in_transaction_session_timeout)', async () => {
    const [settings] = await apiClient<
      { statement_timeout: string; lock_timeout: string; idle_tx: string }[]
    >`
      SELECT
        current_setting('statement_timeout') AS statement_timeout,
        current_setting('lock_timeout') AS lock_timeout,
        current_setting('idle_in_transaction_session_timeout') AS idle_tx
    `;
    expect(settings.statement_timeout).toBe('30s');
    expect(settings.lock_timeout).toBe('5s');
    expect(settings.idle_tx).toBe('1min');
  });

  it('4. proves SET LOCAL context never leaks across pooled connections (max: 1 pool test)', async () => {
    const singlePoolSql = postgres(env.DATABASE_URL, { max: 1 });
    const singleDb = drizzle(singlePoolSql, { schema });
    try {
      // Request 1: run inside customer context on the single pooled connection
      const aliceUserId = await withTx(
        { role: 'auth' },
        async (tx) => {
          const rows = await tx.execute<{ id: string }>(
            sql`SELECT id FROM public.users WHERE deleted_at IS NULL LIMIT 1`,
          );
          if (rows.length > 0) return rows[0].id;
          const [created] = await tx
            .insert(schema.users)
            .values({
              phone: `+90539${String(Date.now()).slice(-7)}`,
              referralCode: `POOL${String(Date.now()).slice(-6)}`,
              preferredLanguage: 'tr',
            })
            .returning({ id: schema.users.id });
          return created.id;
        },
        {},
        singleDb,
      );

      const seenAsCustomer = await withTx(
        { role: 'customer', userId: aliceUserId },
        async (tx) => {
          const rows = await tx.execute<{ cnt: number }>(
            sql`SELECT count(*)::int AS cnt FROM public.users`,
          );
          return rows[0].cnt;
        },
        {},
        singleDb,
      );
      expect(seenAsCustomer).toBe(1);

      // Request 2 on the EXACT SAME physical pooled connection with NO context ('public'):
      // MUST return 0 rows because SET LOCAL reset automatically on transaction end.
      const leakedWithoutTx = await singlePoolSql<{ cnt: number }[]>`
        SELECT count(*)::int AS cnt FROM public.users
      `;
      expect(leakedWithoutTx[0].cnt).toBe(0);

      const leakedOrders = await withTx(
        { role: 'public' },
        async (tx) => {
          const [u, o, s] = await Promise.all([
            tx.execute<{ cnt: number }>(sql`SELECT count(*)::int AS cnt FROM public.users`),
            tx.execute<{ cnt: number }>(sql`SELECT count(*)::int AS cnt FROM public.orders`),
            tx.execute<{ cnt: number }>(sql`SELECT count(*)::int AS cnt FROM public.staff_users`),
          ]);
          return { users: u[0].cnt, orders: o[0].cnt, staff: s[0].cnt };
        },
        {},
        singleDb,
      );
      expect(leakedOrders).toEqual({ users: 0, orders: 0, staff: 0 });
    } finally {
      await singlePoolSql.end({ timeout: 2 });
    }
  });

  it('5. blocks app_readonly from mutations and sensitive SECURITY DEFINER functions', async () => {
    await expect(
      readonlyClient`DELETE FROM public.menu_items WHERE id = 'f0000000-0000-0000-0000-000000000001'`,
    ).rejects.toThrow(/permission denied/i);

    await expect(
      readonlyClient`SELECT public.anonymize_user('00000000-0000-0000-0000-000000000000'::uuid)`,
    ).rejects.toThrow(/permission denied/i);

    await expect(
      readonlyClient`SELECT public.create_order('pickup', 'cash_on_delivery', 'ro-test', '[]'::jsonb)`,
    ).rejects.toThrow(/permission denied/i);
  });

  it('6. retries serialization failure (40001) ONLY when retryOnConflict is explicitly enabled', async () => {
    let noRetryCalls = 0;
    await expect(
      withTx({ role: 'public' }, async () => {
        noRetryCalls++;
        const err = new Error('serialization failure') as Error & { code: string };
        err.code = '40001';
        throw err;
      }),
    ).rejects.toThrow(/serialization failure/);
    expect(noRetryCalls).toBe(1);

    let retryCalls = 0;
    const ok = await withTx(
      { role: 'public' },
      async () => {
        retryCalls++;
        if (retryCalls < 2) {
          const err = new Error('deadlock detected') as Error & { code: string };
          err.code = '40P01';
          throw err;
        }
        return 'recovered';
      },
      { retryOnConflict: true, maxRetries: 3 },
    );
    expect(ok).toBe('recovered');
    expect(retryCalls).toBe(2);
  });

  it('7. enforces caller authorization inside every SECURITY DEFINER DB function under app_api', async () => {
    await expect(
      withTx({ role: 'public' }, (tx) =>
        tx.execute(sql`SELECT public.auth_get_staff_by_email('owner@kardeslercihangir.com')`),
      ),
    ).rejects.toThrow();

    await expect(
      withTx({ role: 'public' }, (tx) =>
        tx.execute(sql`SELECT public.create_order('pickup', 'cash_on_delivery', 'noauth-1', '[]'::jsonb)`),
      ),
    ).rejects.toThrow();

    await expect(
      withTx({ role: 'customer', userId: '11111111-1111-4111-8111-111111111111' }, (tx) =>
        tx.execute(
          sql`SELECT public.anonymize_user('22222222-2222-4222-8222-222222222222'::uuid)`,
        ),
      ),
    ).rejects.toThrow();

    await expect(
      withTx({ role: 'customer', userId: '11111111-1111-4111-8111-111111111111' }, (tx) =>
        tx.execute(
          sql`SELECT public.redeem_coupon('90000000-0000-0000-0000-000000000001'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, '33333333-3333-4333-8333-333333333333'::uuid, 100)`,
        ),
      ),
    ).rejects.toThrow();
  });
});
