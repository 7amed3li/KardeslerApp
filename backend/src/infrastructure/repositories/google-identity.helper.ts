import { and, eq, isNull, sql } from 'drizzle-orm';
import { withTx, schema } from '../db/client.js';
import { DomainError } from '../../domain/errors.js';
import type { UserProfile } from '../../ports/repositories.js';

function toUserProfile(u: typeof schema.users.$inferSelect): UserProfile {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    preferredLanguage: u.preferredLanguage,
    referralCode: u.referralCode,
    isBlocked: u.isBlocked,
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown; cause?: { code?: unknown } }).code
    ?? (err as { cause?: { code?: unknown } }).cause?.code;
  return code === '23505';
}

type TxClient = Parameters<Parameters<typeof withTx>[1]>[0];

async function findActiveUserByGoogleSubject(
  tx: TxClient,
  providerSubject: string,
): Promise<typeof schema.users.$inferSelect | null> {
  const identities = await tx
    .select()
    .from(schema.userIdentities)
    .where(and(eq(schema.userIdentities.provider, 'google'), eq(schema.userIdentities.providerSubject, providerSubject)))
    .limit(1);
  if (identities.length === 0) return null;

  const users = await tx
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, identities[0].userId), isNull(schema.users.deletedAt)))
    .limit(1);
  if (users.length === 0) {
    throw new DomainError('UNAUTHORIZED', 401, 'Account is unavailable.');
  }
  return users[0];
}

export async function findOrProvisionGoogleUserTx(input: {
  providerSubject: string;
  email: string | null;
  name: string | null;
  newReferralCode: string;
  refreshTokenHash: string;
  familyId: string;
  refreshExpiresAt: Date;
  deviceInfo: string | null;
}): Promise<{ user: UserProfile; isNewUser: boolean }> {
  return withTx({ role: 'auth' }, async (tx) => {
    let userRow = await findActiveUserByGoogleSubject(tx, input.providerSubject);
    let isNewUser = false;

    if (!userRow) {
      await tx.execute(sql`SAVEPOINT google_provision`);
      try {
        const [insertedUser] = await tx
          .insert(schema.users)
          .values({
            phone: null,
            name: input.name,
            email: input.email,
            referralCode: input.newReferralCode,
            preferredLanguage: 'tr',
          })
          .returning();

        await tx.insert(schema.userIdentities).values({
          userId: insertedUser.id,
          provider: 'google',
          providerSubject: input.providerSubject,
          emailAtLink: input.email,
        });
        await tx.execute(sql`RELEASE SAVEPOINT google_provision`);
        userRow = insertedUser;
        isNewUser = true;
      } catch (err) {
        if (!isPgUniqueViolation(err)) throw err;
        await tx.execute(sql`ROLLBACK TO SAVEPOINT google_provision`);
        userRow = await findActiveUserByGoogleSubject(tx, input.providerSubject);
        if (!userRow) throw err;
      }
    }

    if (!userRow.isBlocked) {
      await tx.insert(schema.refreshTokens).values({
        userId: userRow.id,
        tokenHash: input.refreshTokenHash,
        familyId: input.familyId,
        expiresAt: input.refreshExpiresAt,
        deviceInfo: input.deviceInfo,
      });
    }

    return { user: toUserProfile(userRow), isNewUser };
  });
}

export async function linkGoogleIdentityTx(input: {
  userId: string;
  providerSubject: string;
  email: string | null;
}): Promise<{ status: 'linked' | 'already_linked_self' | 'already_linked_other' | 'provider_already_linked_to_user' }> {
  return withTx({ role: 'auth' }, async (tx) => {
    const bySubject = await tx
      .select()
      .from(schema.userIdentities)
      .where(and(eq(schema.userIdentities.provider, 'google'), eq(schema.userIdentities.providerSubject, input.providerSubject)))
      .limit(1);

    if (bySubject.length > 0) {
      return bySubject[0].userId === input.userId
        ? { status: 'already_linked_self' }
        : { status: 'already_linked_other' };
    }

    const byUser = await tx
      .select()
      .from(schema.userIdentities)
      .where(and(eq(schema.userIdentities.userId, input.userId), eq(schema.userIdentities.provider, 'google')))
      .limit(1);
    if (byUser.length > 0) return { status: 'provider_already_linked_to_user' };

    await tx.insert(schema.userIdentities).values({
      userId: input.userId,
      provider: 'google',
      providerSubject: input.providerSubject,
      emailAtLink: input.email,
    });
    return { status: 'linked' };
  });
}

export async function unlinkCustomerIdentityTx(input: {
  userId: string;
  provider: 'google';
}): Promise<{ status: 'ok' | 'no_fallback_login' | 'not_found' }> {
  return withTx({ role: 'customer', userId: input.userId }, async (tx) => {
    const existing = await tx
      .select()
      .from(schema.userIdentities)
      .where(and(eq(schema.userIdentities.userId, input.userId), eq(schema.userIdentities.provider, input.provider)))
      .limit(1);
    if (existing.length === 0) return { status: 'not_found' };

    const users = await tx
      .select({ phone: schema.users.phone })
      .from(schema.users)
      .where(and(eq(schema.users.id, input.userId), isNull(schema.users.deletedAt)))
      .limit(1);
    const hasPhoneFallback = users.length > 0 && typeof users[0].phone === 'string' && users[0].phone.length > 0;
    if (!hasPhoneFallback) return { status: 'no_fallback_login' };

    await tx
      .delete(schema.userIdentities)
      .where(and(eq(schema.userIdentities.userId, input.userId), eq(schema.userIdentities.provider, input.provider)));
    return { status: 'ok' };
  });
}

export async function listCustomerIdentitiesTx(
  userId: string,
): Promise<Array<{ provider: string; emailAtLink: string | null; createdAt: string }>> {
  return withTx({ role: 'customer', userId }, async (tx) => {
    const rows = await tx.select().from(schema.userIdentities).where(eq(schema.userIdentities.userId, userId));
    return rows.map((r) => ({
      provider: r.provider,
      emailAtLink: r.emailAtLink,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

