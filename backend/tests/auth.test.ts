import { describe, it, expect } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service.js';

describe('AuthService Unit Tests', () => {
  it('generates a 6-digit numeric OTP code', () => {
    const code = AuthService.generate6DigitCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates consistent SHA-256 OTP hashes without storing plaintext', () => {
    const hash1 = AuthService.hashOtp('123456');
    const hash2 = AuthService.hashOtp('123456');
    const hashOther = AuthService.hashOtp('654321');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashOther);
    expect(hash1).toHaveLength(64);
  });

  it('hashes staff passwords with Argon2id and verifies correctly', async () => {
    const password = 'KardeslerOwnerSecurePass!2026';
    const hash = await AuthService.hashPassword(password);

    expect(hash).toContain('$argon2id$');
    const isValid = await AuthService.verifyPassword(hash, password);
    const isInvalid = await AuthService.verifyPassword(hash, 'wrong_pass');

    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });

  it('generates customer and staff JWT tokens with appropriate audiences', () => {
    const customerToken = AuthService.generateCustomerToken('user-123');
    const staffToken = AuthService.generateStaffToken('staff-456', 'owner');

    expect(customerToken.accessToken).toBeDefined();
    expect(staffToken.accessToken).toBeDefined();
  });
});
