import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

export type RlsRole = 'customer' | 'staff' | 'owner' | 'system' | 'auth' | 'print_agent' | 'public';

export interface RlsContext {
  role: RlsRole;
  userId?: string | null;
  staffId?: string | null;
  actorType?: 'customer' | 'staff' | 'driver' | 'system';
  actorId?: string | null;
}

// Primary application pool running strictly as `app_api` (subject to FORCE RLS)
export const apiClient = postgres(env.DATABASE_URL, {
  max: 15,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Read-only analytics/public pool running strictly as `app_readonly`
export const readonlyClient = postgres(env.DATABASE_READONLY_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(apiClient, { schema });
export const readonlyDb = drizzle(readonlyClient, { schema });

export type DbTx = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];

/**
 * Executes a callback inside a PostgreSQL transaction on `app_api` with
 * transaction-local (`is_local = true`) RLS context variables (`SET LOCAL`).
 * When the transaction commits or rolls back, the session variables automatically reset.
 */
export async function withRlsTx<T>(
  ctx: RlsContext,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const roleVal = ctx.role === 'public' ? '' : ctx.role;
    const userIdVal = ctx.userId ?? '';
    const staffIdVal = ctx.staffId ?? '';
    const actorTypeVal =
      ctx.actorType ??
      (ctx.role === 'customer'
        ? 'customer'
        : ctx.role === 'staff' || ctx.role === 'owner'
          ? 'staff'
          : 'system');
    const actorIdVal = ctx.actorId ?? ctx.userId ?? ctx.staffId ?? '';

    await tx.execute(sql`
      SELECT
        set_config('app.current_role', ${roleVal}, true),
        set_config('app.current_user_id', ${userIdVal}, true),
        set_config('app.current_staff_id', ${staffIdVal}, true),
        set_config('app.current_actor_type', ${actorTypeVal}, true),
        set_config('app.current_actor_id', ${actorIdVal}, true)
    `);

    return fn(tx);
  });
}

export async function closeDbPools(): Promise<void> {
  await Promise.allSettled([apiClient.end({ timeout: 5 }), readonlyClient.end({ timeout: 5 })]);
}

export { schema };
