import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SupportedLanguage } from '@kardesler/shared';
import { withTx, schema } from '../db/client.js';
import { DomainError } from '../../domain/errors.js';
import type {
  AddressRecord,
  AddressRepository,
  UserProfile,
  UserRepository,
} from '../../ports/repositories.js';

export class PostgresUserRepository implements UserRepository {
  async anonymizeCustomer(userId: string): Promise<void> {
    await withTx({ role: 'customer', userId }, async (tx) => {
      await tx.execute(sql`SELECT public.anonymize_user(${userId}::uuid)`);
    });
  }

  async updateCustomerProfile(
    userId: string,
    input: { name?: string; email?: string | null; phone?: string | null; preferredLanguage?: SupportedLanguage },
  ): Promise<UserProfile> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      try {
        const [updated] = await tx
          .update(schema.users)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.preferredLanguage !== undefined
              ? { preferredLanguage: input.preferredLanguage }
              : {}),
          })
          .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
          .returning();

        return {
          id: updated.id,
          phone: updated.phone,
          name: updated.name,
          email: updated.email,
          preferredLanguage: updated.preferredLanguage,
          referralCode: updated.referralCode,
          isBlocked: updated.isBlocked,
        };
      } catch (err) {
        const code = err && typeof err === 'object'
          ? ((err as { code?: unknown; cause?: { code?: unknown } }).code
            ?? (err as { cause?: { code?: unknown } }).cause?.code)
          : undefined;
        if (code === '23505') {
          throw new DomainError('CONFLICT', 409, 'Phone number is already associated with another account.');
        }
        throw err;
      }
    });
  }

  async registerDevice(
    userId: string,
    input: { pushToken: string; platform: string; appVersion: string },
  ): Promise<{ id: string; pushToken: string; platform: string }> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [row] = await tx
        .insert(schema.devices)
        .values({
          userId,
          pushToken: input.pushToken,
          platform: input.platform,
          appVersion: input.appVersion,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.devices.pushToken,
          set: { userId, platform: input.platform, appVersion: input.appVersion, lastSeenAt: new Date() },
        })
        .returning({ id: schema.devices.id, pushToken: schema.devices.pushToken, platform: schema.devices.platform });
      return row;
    });
  }

  async getReferralSummary(userId: string): Promise<{ referralCode: string; referrals: unknown[] }> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const [u] = await tx
        .select({ referralCode: schema.users.referralCode })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      const refs = await tx.execute(sql`
        SELECT id, status, created_at AS "createdAt", rewarded_at AS "rewardedAt"
        FROM public.referrals WHERE referrer_user_id = ${userId}::uuid ORDER BY created_at DESC
      `);
      return { referralCode: u?.referralCode ?? '', referrals: refs };
    });
  }
}

type AddressRow = AddressRecord & Record<string, unknown>;

export class PostgresAddressRepository implements AddressRepository {
  async listForCustomer(userId: string): Promise<AddressRecord[]> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const rows = await tx.execute<AddressRow>(sql`
        SELECT id, label, full_address AS "fullAddress", building, floor, apartment, notes,
          ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM public.addresses
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL
        ORDER BY created_at DESC
      `);
      return [...rows];
    });
  }

  async createForCustomer(userId: string, input: Omit<AddressRecord, 'id'>): Promise<AddressRecord> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const rows = await tx.execute<AddressRow>(sql`
        INSERT INTO public.addresses (user_id, label, full_address, location, building, floor, apartment, notes)
        VALUES (
          ${userId}::uuid, ${input.label}, ${input.fullAddress},
          ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
          ${input.building}, ${input.floor}, ${input.apartment}, ${input.notes}
        )
        RETURNING id, label, full_address AS "fullAddress", building, floor, apartment, notes,
          ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      `);
      return rows[0];
    });
  }

  async updateForCustomer(
    userId: string,
    addressId: string,
    input: Partial<Omit<AddressRecord, 'id'>>,
  ): Promise<AddressRecord | null> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const hasGeo = input.lat !== undefined && input.lng !== undefined;
      const rows = await tx.execute<AddressRow>(sql`
        UPDATE public.addresses SET
          label = COALESCE(${input.label ?? null}, label),
          full_address = COALESCE(${input.fullAddress ?? null}, full_address),
          building = COALESCE(${input.building ?? null}, building),
          floor = COALESCE(${input.floor ?? null}, floor),
          apartment = COALESCE(${input.apartment ?? null}, apartment),
          notes = COALESCE(${input.notes ?? null}, notes),
          location = CASE WHEN ${hasGeo}
            THEN ST_SetSRID(ST_MakePoint(${input.lng ?? 0}, ${input.lat ?? 0}), 4326)::geography
            ELSE location END
        WHERE id = ${addressId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
        RETURNING id, label, full_address AS "fullAddress", building, floor, apartment, notes,
          ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      `);
      return rows[0] ?? null;
    });
  }

  async softDeleteForCustomer(userId: string, addressId: string): Promise<boolean> {
    return withTx({ role: 'customer', userId }, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        DELETE FROM public.addresses
        WHERE id = ${addressId}::uuid AND user_id = ${userId}::uuid
        RETURNING id
      `);
      return rows.length > 0;
    });
  }
}
