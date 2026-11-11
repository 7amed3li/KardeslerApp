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

export interface WithTxOptions {
  /**
   * Bounded retry on PostgreSQL serialization (40001) or deadlock (40P01) errors.
   * MUST remain false for non-idempotent money mutations.
   */
  retryOnConflict?: boolean;
  maxRetries?: number;
}

export interface RolePosture {
  roleName: string;
  isSuperuser: boolean;
  bypassRls: boolean;
  ownedPublicTables: number;
}

export interface DbSecurityPosture {
  api: RolePosture;
  readonly: RolePosture;
}

// Primary application pool running strictly as `app_api` (subject to FORCE RLS)
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

// Read-only analytics/public pool running strictly as `app_readonly`
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

async function inspectRolePosture(client: postgres.Sql): Promise<RolePosture> {
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
      (
        SELECT count(*)::int
        FROM pg_tables t
        WHERE t.schemaname = 'public' AND t.tableowner = current_user
      ) AS owned_public_tables
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;

  if (rows.length === 0) {
    throw new Error('Failed to inspect active PostgreSQL role posture');
  }

  return {
    roleName: rows[0].role_name,
    isSuperuser: Boolean(rows[0].is_superuser),
    bypassRls: Boolean(rows[0].bypass_rls),
    ownedPublicTables: Number(rows[0].owned_public_tables),
  };
}

/**
 * Verifies at boot and in /readyz that the API connects strictly as least-privileged
 * `app_api` and `app_readonly` roles: neither may be superuser, have BYPASSRLS,
 * or own any table in schema `public`.
 */
export async function verifyDbSecurityPosture(
  apiSql: postgres.Sql = apiClient,
  roSql: postgres.Sql = readonlyClient,
): Promise<DbSecurityPosture> {
  const [api, readonly] = await Promise.all([
    inspectRolePosture(apiSql),
    inspectRolePosture(roSql),
  ]);

  if (api.roleName !== 'app_api') {
    throw new Error(`Security violation: API pool must connect as app_api, got "${api.roleName}"`);
  }
  if (api.isSuperuser || api.bypassRls || api.ownedPublicTables > 0) {
    throw new Error(
      `Security violation on API role "${api.roleName}": superuser=${api.isSuperuser}, bypassRls=${api.bypassRls}, ownedTables=${api.ownedPublicTables}`,
    );
  }

  if (readonly.roleName !== 'app_readonly') {
    throw new Error(
      `Security violation: Readonly pool must connect as app_readonly, got "${readonly.roleName}"`,
    );
  }
  if (readonly.isSuperuser || readonly.bypassRls || readonly.ownedPublicTables > 0) {
    throw new Error(
      `Security violation on Readonly role "${readonly.roleName}": superuser=${readonly.isSuperuser}, bypassRls=${readonly.bypassRls}, ownedTables=${readonly.ownedPublicTables}`,
    );
  }

  return { api, readonly };
}

function getPgCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.code === 'string') return record.code;
  if (record.cause && typeof record.cause === 'object') {
    const cause = record.cause as Record<string, unknown>;
    if (typeof cause.code === 'string') return cause.code;
  }
  return undefined;
}

/**
 * Executes a callback inside a PostgreSQL transaction on `app_api` with
 * transaction-local (`is_local = true`) RLS context variables (`SET LOCAL` semantics).
 * Session variables automatically reset on COMMIT/ROLLBACK and never leak across pooled requests.
 */
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
    } catch (err) {
      const code = getPgCode(err);
      const isConflict = code === '40001' || code === '40P01';
      if (retryable && isConflict && attempt < maxAttempts) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Unreachable retry state in withTx');
}

export const withRlsTx = withTx;

export async function closeDbPools(): Promise<void> {
  await Promise.allSettled([apiClient.end({ timeout: 5 }), readonlyClient.end({ timeout: 5 })]);
}

export { schema };
