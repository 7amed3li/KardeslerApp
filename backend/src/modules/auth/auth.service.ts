import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { withRlsTx, schema } from '../../db/index.js';
import { AppError } from '../../common/errors.js';
import { type StaffRole } from '@kardesler/shared';

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<boolean>;
}

export class ConsoleSmsProvider implements SmsProvider {
  public lastSentCodeByPhone = new Map<string, string>();

  async sendOtp(phone: string, code: string): Promise<boolean> {
    this.lastSentCodeByPhone.set(phone, code);
    return true;
  }
}

export class NetgsmSmsProvider implements SmsProvider {
  constructor(
    private readonly userCode: string,
    private readonly userPass: string,
    private readonly msgHeader: string,
  ) {}

  async sendOtp(_phone: string, _code: string): Promise<boolean> {
    // Production Netgsm XML/REST gateway integration point
    void this.userCode;
    void this.userPass;
    void this.msgHeader;
    return true;
  }
}

export interface CustomerJwtPayload {
  sub: string;
  role: 'customer';
  iat?: number;
  exp?: number;
}

export interface StaffJwtPayload {
  sub: string;
  role: StaffRole;
  iat?: number;
  exp?: number;
}

export interface PrintAgentJwtPayload {
  sub: string;
  role: 'print_agent';
  jti: string;
  iat?: number;
  exp?: number;
}

const ISSUER = 'kardesler-cihangir-api';
const revokedPrintTokenJtis = new Set<string>();

export class AuthService {
  /**
   * Computes HMAC-SHA256 of phone + per-OTP salt + 6-digit code using OTP_HMAC_SECRET.
   */
  public static hashOtp(code: string, salt = '', phone = ''): string {
    return crypto
      .createHmac('sha256', env.OTP_HMAC_SECRET)
      .update(`${phone}:${salt}:${code}`)
      .digest('hex');
  }

  public static verifyOtpHash(expectedHex: string, candidateHex: string): boolean {
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(candidateHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  public static generate6DigitCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  public static hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public static generateRawRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public static generateReferralCode(): string {
    return 'KC' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  public static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  public static async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  // AES-256-GCM encryption for TOTP secrets stored in staff_users.totp_secret_encrypted
  private static getAesKey(): Buffer {
    return crypto.createHash('sha256').update(env.TOTP_ENCRYPTION_KEY).digest();
  }

  public static encryptTotpSecret(plainSecret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getAesKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  public static decryptTotpSecret(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new AppError('INTERNAL_ERROR', 500, 'Invalid encrypted TOTP secret format');
    }
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.getAesKey(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  public static generateTotpSecret(): string {
    return authenticator.generateSecret();
  }

  public static verifyTotpCode(plainSecret: string, token: string): boolean {
    return authenticator.check(token, plainSecret);
  }

  // JWT Token Generation & Strict Verification
  public static generateCustomerToken(userId: string): { accessToken: string } {
    const accessToken = jwt.sign({ sub: userId, role: 'customer' }, env.JWT_CUSTOMER_SECRET, {
      expiresIn: '15m',
      audience: 'kardesler-mobile',
      issuer: ISSUER,
    });
    return { accessToken };
  }

  public static verifyCustomerToken(token: string): CustomerJwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_CUSTOMER_SECRET, {
        audience: 'kardesler-mobile',
        issuer: ISSUER,
      }) as CustomerJwtPayload;
      if (decoded.role !== 'customer' || !decoded.sub) {
        throw new Error('Invalid customer claims');
      }
      return decoded;
    } catch {
      throw new AppError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş müşteri oturumu');
    }
  }

  public static generateStaffToken(staffId: string, role: StaffRole): { accessToken: string } {
    const accessToken = jwt.sign({ sub: staffId, role }, env.JWT_STAFF_SECRET, {
      expiresIn: '8h',
      audience: 'kardesler-admin',
      issuer: ISSUER,
    });
    return { accessToken };
  }

  public static verifyStaffToken(token: string): StaffJwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_STAFF_SECRET, {
        audience: 'kardesler-admin',
        issuer: ISSUER,
      }) as StaffJwtPayload;
      if ((decoded.role !== 'owner' && decoded.role !== 'staff') || !decoded.sub) {
        throw new Error('Invalid staff claims');
      }
      return decoded;
    } catch {
      throw new AppError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş personel oturumu');
    }
  }

  public static generateStaffTotpSetupToken(staffId: string): string {
    return jwt.sign({ sub: staffId, purpose: 'totp_setup' }, env.JWT_STAFF_SECRET, {
      expiresIn: '10m',
      audience: 'kardesler-admin-setup',
      issuer: ISSUER,
    });
  }

  public static verifyStaffTotpSetupToken(token: string): { sub: string } {
    try {
      const decoded = jwt.verify(token, env.JWT_STAFF_SECRET, {
        audience: 'kardesler-admin-setup',
        issuer: ISSUER,
      }) as { sub: string; purpose: string };
      if (decoded.purpose !== 'totp_setup' || !decoded.sub) {
        throw new Error('Invalid setup claims');
      }
      return { sub: decoded.sub };
    } catch {
      throw new AppError('UNAUTHORIZED', 401, 'Geçersiz TOTP kurulum anahtarı');
    }
  }

  public static generatePrintAgentToken(deviceId: string): { token: string; jti: string } {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ sub: deviceId, role: 'print_agent', jti }, env.JWT_PRINT_SECRET, {
      expiresIn: '30d',
      audience: 'kardesler-printer',
      issuer: ISSUER,
    });
    return { token, jti };
  }

  public static revokePrintAgentToken(jti: string): void {
    revokedPrintTokenJtis.add(jti);
  }

  public static verifyPrintAgentToken(token: string): PrintAgentJwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_PRINT_SECRET, {
        audience: 'kardesler-printer',
        issuer: ISSUER,
      }) as PrintAgentJwtPayload;
      if (decoded.role !== 'print_agent' || !decoded.sub || !decoded.jti) {
        throw new Error('Invalid print agent claims');
      }
      if (revokedPrintTokenJtis.has(decoded.jti)) {
        throw new Error('Print agent token revoked');
      }
      return decoded;
    } catch {
      throw new AppError('UNAUTHORIZED', 401, 'Geçersiz veya iptal edilmiş yazıcı ajan anahtarı');
    }
  }

  /**
   * Requests an OTP for a Turkish mobile phone (+905XXXXXXXXX), enforcing cooldown
   * and persisting the salted HMAC-SHA256 hash in `otp_codes`.
   */
  public static async requestCustomerOtp(
    phone: string,
    ip: string | undefined,
    smsProvider: SmsProvider,
  ): Promise<{ expiresInSeconds: number }> {
    if (!/^\+905\d{9}$/.test(phone)) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        'Sadece geçerli Türkiye (+905XXXXXXXXX) cep telefonu numaraları desteklenmektedir',
      );
    }

    const code =
      env.ALLOW_REVIEW_DEMO_OTP && phone === env.REVIEW_DEMO_PHONE
        ? env.REVIEW_DEMO_OTP_CODE
        : this.generate6DigitCode();

    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = this.hashOtp(code, salt, phone);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await withRlsTx({ role: 'auth' }, async (tx) => {
      // Check 60s cooldown on the most recent unconsumed OTP for this phone
      const recent = await tx
        .select()
        .from(schema.otpCodes)
        .where(and(eq(schema.otpCodes.phone, phone), isNull(schema.otpCodes.consumedAt)))
        .orderBy(desc(schema.otpCodes.createdAt))
        .limit(1);

      if (recent.length > 0) {
        const ageMs = Date.now() - new Date(recent[0].createdAt).getTime();
        if (ageMs < 60_000 && env.NODE_ENV !== 'test') {
          throw new AppError(
            'RATE_LIMITED',
            429,
            'Yeni kod istemeden önce lütfen 60 saniye bekleyin',
          );
        }
      }

      await tx.insert(schema.otpCodes).values({
        phone,
        salt,
        codeHash,
        expiresAt,
        attempts: 0,
        ip: ip && /^[\d.:a-fA-F]+$/.test(ip) ? ip : null,
      });
    });

    await smsProvider.sendOtp(phone, code);
    return { expiresInSeconds: 300 };
  }

  /**
   * Verifies a customer OTP, creates or fetches the user in `users`, and issues
   * an access token + rotated refresh token family.
   */
  public static async verifyCustomerOtp(
    phone: string,
    code: string,
    deviceInfo?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; phone: string; name: string | null; referralCode: string };
  }> {
    return withRlsTx({ role: 'auth' }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.otpCodes)
        .where(and(eq(schema.otpCodes.phone, phone), isNull(schema.otpCodes.consumedAt)))
        .orderBy(desc(schema.otpCodes.createdAt))
        .limit(1);

      if (rows.length === 0) {
        throw new AppError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş doğrulama kodu');
      }

      const otpRow = rows[0];

      if (otpRow.attempts >= 5 || new Date(otpRow.expiresAt).getTime() < Date.now()) {
        throw new AppError(
          'UNAUTHORIZED',
          401,
          'Doğrulama kodunun süresi doldu veya maksimum deneme sayısı aşıldı',
        );
      }

      const candidateHash = this.hashOtp(code, otpRow.salt, phone);
      const isValid = this.verifyOtpHash(otpRow.codeHash, candidateHash);

      if (!isValid) {
        await tx
          .update(schema.otpCodes)
          .set({ attempts: otpRow.attempts + 1 })
          .where(eq(schema.otpCodes.id, otpRow.id));
        throw new AppError('UNAUTHORIZED', 401, 'Geçersiz doğrulama kodu');
      }

      // Mark OTP as consumed
      await tx
        .update(schema.otpCodes)
        .set({ consumedAt: new Date() })
        .where(eq(schema.otpCodes.id, otpRow.id));

      // Find or create active user by phone
      let existingUsers = await tx
        .select()
        .from(schema.users)
        .where(and(eq(schema.users.phone, phone), isNull(schema.users.deletedAt)))
        .limit(1);

      if (existingUsers.length === 0) {
        existingUsers = await tx
          .insert(schema.users)
          .values({
            phone,
            referralCode: this.generateReferralCode(),
            preferredLanguage: 'tr',
          })
          .returning();
      }

      const user = existingUsers[0];
      if (user.isBlocked) {
        throw new AppError('FORBIDDEN', 403, 'Hesabınız askıya alınmıştır');
      }

      const rawRefreshToken = this.generateRawRefreshToken();
      const tokenHash = this.hashRefreshToken(rawRefreshToken);
      const familyId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await tx.insert(schema.refreshTokens).values({
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt,
        deviceInfo: deviceInfo ?? null,
      });

      const { accessToken } = this.generateCustomerToken(user.id);

      return {
        accessToken,
        refreshToken: rawRefreshToken,
        user: {
          id: user.id,
          phone: user.phone ?? phone,
          name: user.name,
          referralCode: user.referralCode,
        },
      };
    });
  }

  /**
   * Rotates a customer refresh token. If an already-revoked token is replayed,
   * revokes the ENTIRE token family immediately (reuse detection).
   */
  public static async rotateRefreshToken(
    rawRefreshToken: string,
    deviceInfo?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    let reusedFamilyId: string | null = null;

    const result = await withRlsTx({ role: 'auth' }, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.refreshTokens)
        .where(eq(schema.refreshTokens.tokenHash, tokenHash))
        .limit(1);

      if (rows.length === 0) {
        throw new AppError('UNAUTHORIZED', 401, 'Geçersiz yenileme anahtarı');
      }

      const tokenRow = rows[0];

      // REUSE DETECTION: If this token was already rotated/revoked, compromise is suspected!
      // Revoke the entire family in this transaction and commit before throwing.
      if (tokenRow.revokedAt !== null) {
        await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(schema.refreshTokens.familyId, tokenRow.familyId));
        reusedFamilyId = tokenRow.familyId;
        return null;
      }

      if (new Date(tokenRow.expiresAt).getTime() < Date.now()) {
        throw new AppError('UNAUTHORIZED', 401, 'Yenileme anahtarının süresi dolmuş');
      }

      const newRawToken = this.generateRawRefreshToken();
      const newTokenHash = this.hashRefreshToken(newRawToken);
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const [inserted] = await tx
        .insert(schema.refreshTokens)
        .values({
          userId: tokenRow.userId,
          tokenHash: newTokenHash,
          familyId: tokenRow.familyId,
          expiresAt: newExpiresAt,
          deviceInfo: deviceInfo ?? tokenRow.deviceInfo,
        })
        .returning({ id: schema.refreshTokens.id });

      await tx
        .update(schema.refreshTokens)
        .set({
          revokedAt: new Date(),
          replacedById: inserted.id,
        })
        .where(eq(schema.refreshTokens.id, tokenRow.id));

      const { accessToken } = this.generateCustomerToken(tokenRow.userId!);
      return { accessToken, refreshToken: newRawToken };
    });

    if (reusedFamilyId || !result) {
      throw new AppError(
        'UNAUTHORIZED',
        401,
        'Yenileme anahtarı tekrar kullanımı tespit edildi, tüm oturum ailesi sonlandırıldı',
      );
    }

    return result;
  }

  /**
   * Revokes a refresh token family on logout.
   */
  public static async logoutCustomer(userId: string, rawRefreshToken?: string): Promise<void> {
    await withRlsTx({ role: 'customer', userId }, async (tx) => {
      if (rawRefreshToken) {
        const tokenHash = this.hashRefreshToken(rawRefreshToken);
        await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.refreshTokens.userId, userId),
              eq(schema.refreshTokens.tokenHash, tokenHash),
            ),
          );
      } else {
        await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(schema.refreshTokens.userId, userId));
      }
    });
  }

  /**
   * Staff login with Argon2id + mandatory TOTP.
   * If TOTP is not yet enabled on the staff account, returns a short-lived setup token
   * (`totpSetupRequired: true`) and refuses to issue an operational staff JWT until TOTP is configured.
   */
  public static async loginStaff(
    email: string,
    password: string,
    totpCode?: string,
  ): Promise<
    | {
        totpSetupRequired: true;
        setupToken: string;
      }
    | {
        totpSetupRequired: false;
        accessToken: string;
        staff: { id: string; email: string; role: StaffRole };
      }
  > {
    return withRlsTx({ role: 'auth' }, async (tx) => {
      const res = await tx.execute<{
        id: string;
        email: string;
        password_hash: string;
        role: StaffRole;
        totp_secret_encrypted: string | null;
        totp_enabled: boolean;
        is_active: boolean;
      }>(sql`SELECT * FROM public.auth_get_staff_by_email(${email})`);

      const staffRow = res[0];
      if (!staffRow || !staffRow.is_active) {
        throw new AppError('UNAUTHORIZED', 401, 'Geçersiz e-posta veya şifre');
      }

      const pwdValid = await this.verifyPassword(staffRow.password_hash, password);
      if (!pwdValid) {
        throw new AppError('UNAUTHORIZED', 401, 'Geçersiz e-posta veya şifre');
      }

      if (!staffRow.totp_enabled || !staffRow.totp_secret_encrypted) {
        const setupToken = this.generateStaffTotpSetupToken(staffRow.id);
        return {
          totpSetupRequired: true,
          setupToken,
        };
      }

      if (!totpCode) {
        throw new AppError('UNAUTHORIZED', 401, '2FA (TOTP) doğrulama kodu zorunludur');
      }

      const plainSecret = this.decryptTotpSecret(staffRow.totp_secret_encrypted);
      if (!this.verifyTotpCode(plainSecret, totpCode)) {
        throw new AppError('UNAUTHORIZED', 401, 'Geçersiz 2FA (TOTP) doğrulama kodu');
      }

      await tx
        .update(schema.staffUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.staffUsers.id, staffRow.id));

      const { accessToken } = this.generateStaffToken(staffRow.id, staffRow.role);
      return {
        totpSetupRequired: false,
        accessToken,
        staff: {
          id: staffRow.id,
          email: staffRow.email,
          role: staffRow.role,
        },
      };
    });
  }

  /**
   * Generates and stores a new encrypted TOTP secret for a staff account, then activates it once verified.
   */
  public static async setupAndVerifyStaffTotp(
    setupToken: string,
    plainSecret: string,
    totpCode: string,
  ): Promise<{ accessToken: string; staff: { id: string; email: string; role: StaffRole } }> {
    const { sub: staffId } = this.verifyStaffTotpSetupToken(setupToken);

    if (!this.verifyTotpCode(plainSecret, totpCode)) {
      throw new AppError('VALIDATION_ERROR', 400, 'TOTP doğrulama kodu eşleşmedi');
    }

    const encrypted = this.encryptTotpSecret(plainSecret);

    return withRlsTx({ role: 'auth', staffId }, async (tx) => {
      const [updated] = await tx
        .update(schema.staffUsers)
        .set({
          totpSecretEncrypted: encrypted,
          totpEnabled: true,
          lastLoginAt: new Date(),
        })
        .where(eq(schema.staffUsers.id, staffId))
        .returning({
          id: schema.staffUsers.id,
          email: schema.staffUsers.email,
          role: schema.staffUsers.role,
        });

      if (!updated) {
        throw new AppError('NOT_FOUND', 404, 'Personel hesabı bulunamadı');
      }

      const role = updated.role as StaffRole;
      const { accessToken } = this.generateStaffToken(updated.id, role);
      return {
        accessToken,
        staff: {
          id: updated.id,
          email: updated.email,
          role,
        },
      };
    });
  }
}
