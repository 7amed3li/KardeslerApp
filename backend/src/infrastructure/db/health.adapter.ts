import type { DbHealthPort, DbPostureReport } from '../../ports/repositories.js';
import { verifyDbSecurityPosture } from './client.js';

export class PostgresHealthAdapter implements DbHealthPort {
  async verifyPosture(): Promise<DbPostureReport> {
    return verifyDbSecurityPosture();
  }
}

