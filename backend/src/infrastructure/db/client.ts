import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from '../../config/env.js';
import type { DbPostureReport } from '../../ports/repositories.js';

export type RlsRole = 'customer' | 'staff' | 'owner' | 'system' | 'auth' | 'print_agent' | 'public';

export interface RlsContext {
  role: RlsRole;
  userId?: string | null;
  staffId?: string | null;
  actorType?: 'customer' | 'staff' | 'driver' | 'system';
  actorId?: string | null;
}

export interface WithTxOptions {
  retryOnConflict?: boolean;
  maxRetries?: number;
}

export const apiClient = postgres(env.DATABASE_URL, {
  max: 15,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: {
    statement_timeout: 30000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 60000,
  },
});

export const readonlyClient = postgres(env.DATABASE_READONLY_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  connection: {
    statement_timeout: 15000,
    lock_timeout: 3000,
    idle_in_transaction_session_timeout: 30000,
  },
});

export const db = drizzle(apiClient, { schema });
export const readonlyDb = drizzle(readonlyClient, { schema });
export type DbTx = Parameters<Parameters<PostgresJsDatabase<typeof schema>['transaction']>[0]>[0];

async function inspectRole(client: postgres.Sql) {
  const rows = await client<{
    role_name: string;
    is_superuser: boolean;
    bypass_rls: boolean;
    owned_public_tables: number;
  }[]>`
    SELECT
      current_user AS role_name,
      r.rolsuper AS is_superuser,
      r.rolbypassrls AS bypass_rls,
      (SELECT count(*)::int FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owned_public_tables
    FROM pg_roles r WHERE r.rolname = current_user
  `;
  if (rows.length === 0) throw new Error('Failed to inspect active PostgreSQL role posture');
  return {
    roleName: rows[0].role_name,
    isSuperuser: Boolean(rows[0].is_superuser),
    bypassRls: Boolean(rows[0].bypass_rls),
    ownedPublicTables: Number(rows[0].owned_public_tables),
  };
}

export async function verifyDbSecurityPosture(
  apiSql: postgres.Sql = apiClient,
  roSql: postgres.Sql = readonlyClient,
): Promise<DbPostureReport> {
  const [api, readonly] = await Promise.all([inspectRole(apiSql), inspectRole(roSql)]);
  if (api.roleName !== 'app_api' || api.isSuperuser || api.bypassRls || api.ownedPublicTables > 0) {
    throw new Error(`Security violation on API role "${api.roleName}"`);
  }
  if (
    readonly.roleName !== 'app_readonly' ||
    readonly.isSuperuser ||
    readonly.bypassRls ||
    readonly.ownedPublicTables > 0
  ) {
    throw new Error(`Security violation on Readonly role "${readonly.roleName}"`);
  }
  return { api, readonly };
}

function getPgCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const r = err as Record<string, unknown>;
  if (typeof r.code === 'string') return r.code;
  if (r.cause && typeof r.cause === 'object') {
    const c = r.cause as Record<string, unknown>;
    if (typeof c.code === 'string') return c.code;
  }
  return undefined;
}

export async function withTx<T>(
  ctx: RlsContext,
  fn: (tx: DbTx) => Promise<T>,
  options: WithTxOptions = {},
  targetDb: PostgresJsDatabase<typeof schema> = db,
): Promise<T> {
  const retryable = options.retryOnConflict === true;
  const maxAttempts = retryable ? Math.max(1, Math.min(options.maxRetries ?? 3, 5)) : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await targetDb.transaction(async (tx) => {
        const roleVal = ctx.role === 'public' ? '' : ctx.role;
        const actorTypeVal =
          ctx.actorType ??
          (ctx.role === 'customer' ? 'customer' : ctx.role === 'staff' || ctx.role === 'owner' ? 'staff' : 'system');
        const actorIdVal = ctx.actorId ?? ctx.userId ?? ctx.staffId ?? '';

        await tx.execute(sql`
          SELECT
            set_config('app.current_role', ${roleVal}, true),
            set_config('app.current_user_id', ${ctx.userId ?? ''}, true),
            set_config('app.current_staff_id', ${ctx.staffId ?? ''}, true),
            set_config('app.current_actor_type', ${actorTypeVal}, true),
            set_config('app.current_actor_id', ${actorIdVal}, true)
        `);
        return fn(tx);
      });
    } catch (err) {
      const code = getPgCode(err);
      if (retryable && (code === '40001' || code === '40P01') && attempt < maxAttempts) continue;
      throw err;
    }
  }
  throw new Error('Unreachable retry state in withTx');
}

export async function closeDbPools(): Promise<void> {
  await Promise.allSettled([apiClient.end({ timeout: 5 }), readonlyClient.end({ timeout: 5 })]);
}

export { schema };
