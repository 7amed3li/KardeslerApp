import type { DbHealthPort, DbPostureReport } from '../../ports/repositories.js';
import { verifyDbSecurityPosture } from './client.js';

export class PostgresHealthAdapter implements DbHealthPort {
  constructor(private readonly redisCheck?: () => Promise<unknown>) {}

  async verifyPosture(): Promise<DbPostureReport> {
    if (this.redisCheck) {
      await this.redisCheck();
    }
    return verifyDbSecurityPosture();
  }
}

