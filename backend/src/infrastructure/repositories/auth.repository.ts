import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { withTx, schema } from '../db/client.js';
import type { AuthRepository, OtpRecord, StaffAuthRecord, UserProfile } from '../../ports/repositories.js';

export class PostgresAuthRepository implements AuthRepository {
  async getLatestUnconsumedOtp(phone: string): Promise<OtpRecord | null> {
    return withTx({ role: 'auth' }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.otpCodes)
        .where(and(eq(schema.otpCodes.phone, phone), isNull(schema.otpCodes.consumedAt)))
        .orderBy(desc(schema.otpCodes.createdAt))
        .limit(1);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        phone: r.phone,
        salt: r.salt,
        codeHash: r.codeHash,
        expiresAt: r.expiresAt,
        attempts: r.attempts,
        createdAt: r.createdAt,
      };
    });
  }

  async createOtp(input: {
    phone: string;
    salt: string;
    codeHash: string;
    expiresAt: Date;
    ip: string | null;
  }): Promise<void> {
    await withTx({ role: 'auth' }, async (tx) => {
      await tx.insert(schema.otpCodes).values({
        phone: input.phone,
        salt: input.salt,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        ip: input.ip,
      });
    });
  }

  async incrementOtpAttempt(otpId: string, nextAttempts: number): Promise<void> {
    await withTx({ role: 'auth' }, async (tx) => {
      await tx
        .update(schema.otpCodes)
        .set({ attempts: nextAttempts })
        .where(eq(schema.otpCodes.id, otpId));
    });
  }

  async verifyOtpAndIssueSession(input: {
    otpId: string;
    phone: string;
    newReferralCode: string;
    refreshTokenHash: string;
    familyId: string;
    refreshExpiresAt: Date;
    deviceInfo: string | null;
    now: Date;
  }): Promise<{ user: UserProfile }> {
    return withTx({ role: 'auth' }, async (tx) => {
      await tx
        .update(schema.otpCodes)
        .set({ consumedAt: input.now })
        .where(eq(schema.otpCodes.id, input.otpId));

      let users = await tx
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.phone, input.phone), isNull(schema.users.deletedAt)))
        .limit(1);

      if (users.length === 0) {
        users = await tx
          .insert(schema.users)
          .values({
            phone: input.phone,
            referralCode: input.newReferralCode,
            preferredLanguage: 'tr',
          })
          .returning();
      }

      const u = users[0];
      if (!u.isBlocked) {
        await tx.insert(schema.refreshTokens).values({
          userId: u.id,
          tokenHash: input.refreshTokenHash,
          familyId: input.familyId,
          expiresAt: input.refreshExpiresAt,
          deviceInfo: input.deviceInfo,
        });
      }

      return {
        user: {
          id: u.id,
          phone: u.phone,
          name: u.name,
          email: u.email,
          preferredLanguage: u.preferredLanguage,
          referralCode: u.referralCode,
          isBlocked: u.isBlocked,
        },
      };
    });
  }

  async rotateRefreshTokenTx(input: {
    tokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    deviceInfo: string | null;
    now: Date;
  }): Promise<{ status: 'ok'; userId: string } | { status: 'reused' } | { status: 'not_found' } | { status: 'expired' }> {
    return withTx({ role: 'auth' }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.refreshTokens)
        .where(eq(schema.refreshTokens.tokenHash, input.tokenHash))
        .limit(1);
      if (rows.length === 0) return { status: 'not_found' };
      const row = rows[0];

      if (row.revokedAt !== null) {
        await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: input.now })
          .where(eq(schema.refreshTokens.familyId, row.familyId));
        return { status: 'reused' };
      }

      if (new Date(row.expiresAt).getTime() < input.now.getTime()) return { status: 'expired' };

      const [inserted] = await tx
        .insert(schema.refreshTokens)
        .values({
          userId: row.userId,
          tokenHash: input.newTokenHash,
          familyId: row.familyId,
          expiresAt: input.newExpiresAt,
          deviceInfo: input.deviceInfo ?? row.deviceInfo,
        })
        .returning({ id: schema.refreshTokens.id });

      await tx
        .update(schema.refreshTokens)
        .set({ revokedAt: input.now, replacedById: inserted.id })
        .where(eq(schema.refreshTokens.id, row.id));

      return { status: 'ok', userId: row.userId! };
    });
  }

  async revokeCustomerRefreshTokens(userId: string, tokenHash?: string): Promise<void> {
    await withTx({ role: 'customer', userId }, async (tx) => {
      const cond = tokenHash
        ? and(eq(schema.refreshTokens.userId, userId), eq(schema.refreshTokens.tokenHash, tokenHash))
        : eq(schema.refreshTokens.userId, userId);
      await tx.update(schema.refreshTokens).set({ revokedAt: new Date() }).where(cond);
    });
  }

  async getStaffByEmailForAuth(email: string): Promise<StaffAuthRecord | null> {
    return withTx({ role: 'auth' }, async (tx) => {
      const res = await tx.execute<{
        id: string;
        email: string;
        password_hash: string;
        role: 'owner' | 'staff';
        totp_secret_encrypted: string | null;
        totp_enabled: boolean;
        is_active: boolean;
      }>(sql`SELECT * FROM public.auth_get_staff_by_email(${email})`);
      if (res.length === 0) return null;
      const r = res[0];
      return {
        id: r.id,
        email: r.email,
        passwordHash: r.password_hash,
        role: r.role,
        totpSecretEncrypted: r.totp_secret_encrypted,
        totpEnabled: r.totp_enabled,
        isActive: r.is_active,
      };
    });
  }

  async touchStaffLogin(staffId: string, now: Date): Promise<void> {
    await withTx({ role: 'auth', staffId }, async (tx) => {
      await tx
        .update(schema.staffUsers)
        .set({ lastLoginAt: now })
        .where(eq(schema.staffUsers.id, staffId));
    });
  }

  async enableStaffTotp(
    staffId: string,
    encryptedSecret: string,
    now: Date,
  ): Promise<{ id: string; email: string; role: 'owner' | 'staff' } | null> {
    return withTx({ role: 'auth', staffId }, async (tx) => {
      const [updated] = await tx
        .update(schema.staffUsers)
        .set({ totpSecretEncrypted: encryptedSecret, totpEnabled: true, lastLoginAt: now })
        .where(eq(schema.staffUsers.id, staffId))
        .returning({ id: schema.staffUsers.id, email: schema.staffUsers.email, role: schema.staffUsers.role });
      if (!updated) return null;
      return { id: updated.id, email: updated.email, role: updated.role as 'owner' | 'staff' };
    });
  }
}

