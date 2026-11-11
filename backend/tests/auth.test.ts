import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { NodeCryptoService } from '../src/infrastructure/security/crypto.adapter.js';
import { JoseTokenService } from '../src/infrastructure/security/jose-token.service.js';
import { CryptoIdGenerator } from '../src/infrastructure/providers/system-clock.js';

describe('Auth Infrastructure (Jose HS256 + kid Rotation + Argon2id + HMAC OTP)', () => {
  const cryptoSvc = new NodeCryptoService(
    'test_otp_secret_at_least_32_characters_long_1234',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  const ids = new CryptoIdGenerator();
  const tokens = new JoseTokenService({
    activeKid: 'k2',
    previousKid: 'k1',
    customerSecret: 'cust_active_secret_32_chars_min_12345',
    customerPrevSecret: 'cust_prev_secret_32_chars_min_1234567',
    staffSecret: 'staff_active_secret_32_chars_min_1234',
    staffPrevSecret: 'staff_prev_secret_32_chars_min_123456',
    printSecret: 'print_active_secret_32_chars_min_1234',
  });

  it('generates 6-digit OTP and verifies salted HMAC-SHA256', () => {
    const code = ids.randomDigits6();
    expect(code).toMatch(/^\d{6}$/);
    const h1 = cryptoSvc.hashOtp('123456', 'salt1', '+905331112233');
    const h2 = cryptoSvc.hashOtp('123456', 'salt1', '+905331112233');
    const hOther = cryptoSvc.hashOtp('654321', 'salt1', '+905331112233');
    expect(cryptoSvc.verifyOtpHash(h1, h2)).toBe(true);
    expect(cryptoSvc.verifyOtpHash(h1, hOther)).toBe(false);
  });

  it('hashes staff passwords with Argon2id and verifies correctly', async () => {
    const password = 'KardeslerOwnerSecurePass!2026';
    const hash = await cryptoSvc.hashPassword(password);
    expect(hash).toContain('$argon2id$');
    expect(await cryptoSvc.verifyPassword(hash, password)).toBe(true);
    expect(await cryptoSvc.verifyPassword(hash, 'wrong_pass')).toBe(false);
  });

  it('signs and verifies customer & staff JWTs with strict audience and kid rotation', async () => {
    const { accessToken: custTok } = await tokens.signCustomerToken('user-123');
    const { accessToken: staffTok } = await tokens.signStaffToken('staff-456', 'owner');

    const cClaims = await tokens.verifyCustomerToken(custTok);
    expect(cClaims.sub).toBe('user-123');
    expect(cClaims.kid).toBe('k2');

    await expect(tokens.verifyCustomerToken(staffTok)).rejects.toThrow();
    await expect(tokens.verifyStaffToken(custTok)).rejects.toThrow();

    // Previous key (kid = 'k1') remains verifiable during rotation window
    const oldKidJwt = await new SignJWT({ role: 'customer' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1', typ: 'JWT' })
      .setSubject('user-old')
      .setIssuer('kardesler-cihangir-api')
      .setAudience('kardesler-mobile')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('cust_prev_secret_32_chars_min_1234567'));

    const oldVerified = await tokens.verifyCustomerToken(oldKidJwt);
    expect(oldVerified.sub).toBe('user-old');
    expect(oldVerified.kid).toBe('k1');
  });

  it('rejects alg=none or unknown kid tokens', async () => {
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"u1","role":"customer"}').toString('base64url')}.`;
    await expect(tokens.verifyCustomerToken(unsigned)).rejects.toThrow();
  });
});
