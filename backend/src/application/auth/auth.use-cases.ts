import { DomainError } from '../../domain/errors.js';
import type { StaffRole } from '@kardesler/shared';
import type { Clock, IdGenerator } from '../../ports/clock.js';
import type { CryptoServicePort, SmsProvider, TokenServicePort } from '../../ports/providers.js';
import type { AuthRepository } from '../../ports/repositories.js';
import type { RateLimiterPort, RevokedTokenStorePort } from '../../ports/state.js';

export interface AuthDeps {
  repo: AuthRepository;
  tokens: TokenServicePort;
  crypto: CryptoServicePort;
  sms: SmsProvider;
  rateLimiter: RateLimiterPort;
  revokedTokens: RevokedTokenStorePort;
  clock: Clock;
  ids: IdGenerator;
  allowReviewDemoOtp: boolean;
  reviewDemoPhone: string;
  reviewDemoCode: string;
  isTestEnv: boolean;
}

export class AuthUseCases {
  constructor(private readonly d: AuthDeps) {}

  async requestCustomerOtp(phone: string, ip: string | undefined): Promise<{ expiresInSeconds: number }> {
    await this.d.rateLimiter.checkSmsCircuitBreaker(50);
    await this.d.rateLimiter.check(`otp:ip:${ip ?? 'unknown'}`, 10, 15 * 60 * 1000, 'IP başına OTP sınırı aşıldı');
    await this.d.rateLimiter.check(`otp:phone:${phone}`, 5, 24 * 60 * 60 * 1000, 'Bu telefon numarası için günlük OTP sınırı aşıldı');

    if (!/^\+905\d{9}$/.test(phone)) {
      throw new DomainError('VALIDATION_ERROR', 400, 'Sadece geçerli Türkiye (+905XXXXXXXXX) cep telefonu numaraları desteklenmektedir');
    }
    const recent = await this.d.repo.getLatestUnconsumedOtp(phone);
    if (recent && this.d.clock.nowMs() - recent.createdAt.getTime() < 60_000 && !this.d.isTestEnv) {
      throw new DomainError('RATE_LIMITED', 429, 'Yeni kod istemeden önce lütfen 60 saniye bekleyin');
    }

    const code =
      this.d.allowReviewDemoOtp && phone === this.d.reviewDemoPhone
        ? this.d.reviewDemoCode
        : this.d.ids.randomDigits6();
    const salt = this.d.ids.randomHex(16);
    const codeHash = this.d.crypto.hashOtp(code, salt, phone);
    const expiresAt = new Date(this.d.clock.nowMs() + 5 * 60 * 1000);
    const validIp = ip && /^[\d.:a-fA-F]+$/.test(ip) ? ip : null;

    await this.d.repo.createOtp({ phone, salt, codeHash, expiresAt, ip: validIp });
    await this.d.sms.sendOtp(phone, code);
    return { expiresInSeconds: 300 };
  }

  async verifyCustomerOtp(phone: string, code: string, ip: string | undefined, deviceInfo?: string) {
    await this.d.rateLimiter.check(`otp_verify:ip:${ip ?? 'unknown'}`, 15, 15 * 60 * 1000);
    const otp = await this.d.repo.getLatestUnconsumedOtp(phone);
    if (!otp) throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz veya süresi dolmuş doğrulama kodu');
    if (otp.attempts >= 5 || otp.expiresAt.getTime() < this.d.clock.nowMs()) {
      throw new DomainError('UNAUTHORIZED', 401, 'Doğrulama kodunun süresi doldu veya maksimum deneme sayısı aşıldı');
    }

    const candidateHash = this.d.crypto.hashOtp(code, otp.salt, phone);
    if (!this.d.crypto.verifyOtpHash(otp.codeHash, candidateHash)) {
      await this.d.repo.incrementOtpAttempt(otp.id, otp.attempts + 1);
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz doğrulama kodu');
    }

    const rawRefresh = this.d.ids.randomHex(32);
    const { user } = await this.d.repo.verifyOtpAndIssueSession({
      otpId: otp.id,
      phone,
      newReferralCode: `KC${this.d.ids.randomHex(4).toUpperCase()}`,
      refreshTokenHash: this.d.crypto.hashRefreshToken(rawRefresh),
      familyId: this.d.ids.uuid(),
      refreshExpiresAt: new Date(this.d.clock.nowMs() + 30 * 24 * 60 * 60 * 1000),
      deviceInfo: deviceInfo ?? null,
      now: this.d.clock.now(),
    });

    if (user.isBlocked) throw new DomainError('FORBIDDEN', 403, 'Hesabınız askıya alınmıştır');
    const { accessToken } = await this.d.tokens.signCustomerToken(user.id);
    return { accessToken, refreshToken: rawRefresh, user: { id: user.id, phone: user.phone ?? phone, name: user.name, referralCode: user.referralCode } };
  }

  async rotateRefreshToken(rawToken: string, ip: string | undefined, deviceInfo?: string) {
    await this.d.rateLimiter.check(`refresh:ip:${ip ?? 'unknown'}`, 30, 15 * 60 * 1000);
    const newRaw = this.d.ids.randomHex(32);
    const res = await this.d.repo.rotateRefreshTokenTx({
      tokenHash: this.d.crypto.hashRefreshToken(rawToken),
      newTokenHash: this.d.crypto.hashRefreshToken(newRaw),
      newExpiresAt: new Date(this.d.clock.nowMs() + 30 * 24 * 60 * 60 * 1000),
      deviceInfo: deviceInfo ?? null,
      now: this.d.clock.now(),
    });
    if (res.status === 'not_found') throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz yenileme anahtarı');
    if (res.status === 'expired') throw new DomainError('UNAUTHORIZED', 401, 'Yenileme anahtarının süresi dolmuş');
    if (res.status === 'reused') throw new DomainError('UNAUTHORIZED', 401, 'Yenileme anahtarı tekrar kullanımı tespit edildi, tüm oturum ailesi sonlandırıldı');
    const { accessToken } = await this.d.tokens.signCustomerToken(res.userId);
    return { accessToken, refreshToken: newRaw };
  }

  async logoutCustomer(userId: string, rawRefreshToken?: string): Promise<void> {
    const hash = rawRefreshToken ? this.d.crypto.hashRefreshToken(rawRefreshToken) : undefined;
    await this.d.repo.revokeCustomerRefreshTokens(userId, hash);
  }

  async loginStaff(email: string, password: string, totpCode?: string): Promise<
    | { totpSetupRequired: true; setupToken: string }
    | { totpSetupRequired: false; accessToken: string; staff: { id: string; email: string; role: StaffRole } }
  > {
    await this.d.rateLimiter.check(`staff_login:${email.toLowerCase()}`, 5, 15 * 60 * 1000, 'Çok fazla başarısız personel giriş denemesi');
    const staff = await this.d.repo.getStaffByEmailForAuth(email);
    if (!staff || !staff.isActive) throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz e-posta veya şifre');

    if (!(await this.d.crypto.verifyPassword(staff.passwordHash, password))) {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz e-posta veya şifre');
    }
    if (!staff.totpEnabled || !staff.totpSecretEncrypted) {
      return { totpSetupRequired: true, setupToken: await this.d.tokens.signStaffTotpSetupToken(staff.id) };
    }
    if (!totpCode) throw new DomainError('UNAUTHORIZED', 401, '2FA (TOTP) doğrulama kodu zorunludur');
    const plain = this.d.crypto.decryptTotpSecret(staff.totpSecretEncrypted);
    if (!this.d.crypto.verifyTotpCode(plain, totpCode)) {
      throw new DomainError('UNAUTHORIZED', 401, 'Geçersiz 2FA (TOTP) doğrulama kodu');
    }

    await this.d.repo.touchStaffLogin(staff.id, this.d.clock.now());
    const { accessToken } = await this.d.tokens.signStaffToken(staff.id, staff.role);
    return { totpSetupRequired: false, accessToken, staff: { id: staff.id, email: staff.email, role: staff.role } };
  }

  async setupStaffTotp(setupToken: string) {
    const { sub: staffId } = await this.d.tokens.verifyStaffTotpSetupToken(setupToken);
    const secret = this.d.crypto.generateTotpSecret();
    return { staffId, secret, otpauthUrl: `otpauth://totp/KardeslerCihangir:${staffId}?secret=${secret}&issuer=KardeslerCihangir` };
  }

  async verifySetupStaffTotp(setupToken: string, secret: string, totpCode: string) {
    const { sub: staffId } = await this.d.tokens.verifyStaffTotpSetupToken(setupToken);
    if (!this.d.crypto.verifyTotpCode(secret, totpCode)) {
      throw new DomainError('VALIDATION_ERROR', 400, 'TOTP doğrulama kodu eşleşmedi');
    }
    const encrypted = this.d.crypto.encryptTotpSecret(secret);
    const updated = await this.d.repo.enableStaffTotp(staffId, encrypted, this.d.clock.now());
    if (!updated) throw new DomainError('NOT_FOUND', 404, 'Personel hesabı bulunamadı');
    const { accessToken } = await this.d.tokens.signStaffToken(updated.id, updated.role);
    return { accessToken, staff: updated };
  }

  async issuePrintAgentToken(deviceId: string) {
    const jti = this.d.ids.uuid();
    const token = await this.d.tokens.signPrintAgentToken(deviceId, jti);
    return { deviceId, token, jti };
  }

  async revokePrintAgentToken(jti: string) {
    await this.d.revokedTokens.revoke(jti);
    return { revoked: true, jti };
  }
}
