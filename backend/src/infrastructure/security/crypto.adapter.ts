import crypto from 'node:crypto';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { DomainError } from '../../domain/errors.js';
import type { CryptoServicePort } from '../../ports/providers.js';

export class NodeCryptoService implements CryptoServicePort {
  constructor(
    private readonly otpHmacSecret: string,
    private readonly totpEncryptionKey: string,
  ) {}

  hashOtp(code: string, salt = '', phone = ''): string {
    return crypto
      .createHmac('sha256', this.otpHmacSecret)
      .update(`${phone}:${salt}:${code}`)
      .digest('hex');
  }

  verifyOtpHash(expectedHex: string, candidateHex: string): boolean {
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(candidateHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  private getAesKey(): Buffer {
    return crypto.createHash('sha256').update(this.totpEncryptionKey).digest();
  }

  encryptTotpSecret(plainSecret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getAesKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decryptTotpSecret(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new DomainError('INTERNAL_ERROR', 500, 'Invalid encrypted TOTP secret format');
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

  generateTotpSecret(): string {
    return authenticator.generateSecret();
  }

  verifyTotpCode(plainSecret: string, code: string): boolean {
    return authenticator.check(code, plainSecret);
  }
}
