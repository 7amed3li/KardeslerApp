import crypto from 'node:crypto';
import type { Clock, IdGenerator } from '../../ports/clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return crypto.randomUUID();
  }

  randomHex(bytes: number): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  randomDigits6(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }
}
