import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { OrderStateMachine, ALLOWED_ORDER_TRANSITIONS, type OrderStatusValue } from '../src/domain/orders/order-state-machine.js';
import { withTx, closeDbPools } from '../src/infrastructure/db/client.js';

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('Step 3 & Step 5 Architecture, Boundaries, and Domain-DB Parity Gates', () => {
  afterAll(async () => {
    await closeDbPools();
  });

  it('enforces main.ts <= 80 lines and every file in src/ <= 400 lines', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const mainLines = fs.readFileSync(path.join(srcRoot, 'main.ts'), 'utf8').split(/\r?\n/).length;
    expect(mainLines).toBeLessThanOrEqual(80);

    for (const file of walkTsFiles(srcRoot)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
      expect(lines, `File exceeds 400 lines: ${file}`).toBeLessThanOrEqual(400);
    }
  });

  it('verifies no test suite except db-rls fail-fast check references superuser DSN', () => {
    const testsRoot = path.resolve(process.cwd(), 'tests');
    for (const file of walkTsFiles(testsRoot)) {
      const base = path.basename(file);
      if (base === 'db-rls.test.ts' || base === 'architecture.test.ts') continue;
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/postgres\(['"`]postgresql:\/\/postgres[:@]/);
    }
  });

  it('proves OrderStateMachine transition graph agrees 100% with PostgreSQL order status trigger', async () => {
    const statuses: OrderStatusValue[] = [
      'awaiting_payment',
      'new',
      'accepted',
      'on_the_way',
      'delivered',
      'cancelled',
      'rejected',
    ];

    // Check every (from -> to) transition inside a rolled-back savepoint against the real DB trigger
    await withTx({ role: 'system' }, async (tx) => {
      const custRes = await tx.execute<{ id: string }>(sql`
        SELECT id FROM public.users WHERE deleted_at IS NULL LIMIT 1
      `);
      const userId = custRes[0].id;

      for (const fromStatus of statuses) {
        for (const toStatus of statuses) {
          if (fromStatus === toStatus) continue;
          const domainAllows = OrderStateMachine.canTransition(fromStatus, toStatus);

          // Seed a temporary order row with status = fromStatus directly as system
          const ordRes = await tx.execute<{ id: string }>(sql`
            INSERT INTO public.orders (
              user_id, order_type, status, business_date, order_number, idempotency_key,
              subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
              customer_name_snapshot, customer_phone_snapshot, payment_method
            ) VALUES (
              ${userId}::uuid, 'pickup', ${fromStatus}, '2099-01-01',
              public.next_order_number('2099-01-01'), 'parity-' || gen_random_uuid()::text,
              34000, 0, 0, 34000, 0, 'Parity', '+905331112233', 'cash_on_delivery'
            ) RETURNING id
          `);
          const orderId = ordRes[0].id;

          let dbAllows = true;
          await tx.execute(sql`SAVEPOINT sp_transition`);
          try {
            await tx.execute(sql`UPDATE public.orders SET status = ${toStatus} WHERE id = ${orderId}::uuid`);
            await tx.execute(sql`RELEASE SAVEPOINT sp_transition`);
          } catch {
            dbAllows = false;
            await tx.execute(sql`ROLLBACK TO SAVEPOINT sp_transition`);
          }

          expect(
            dbAllows,
            `Domain (${domainAllows}) vs DB (${dbAllows}) mismatch for ${fromStatus} -> ${toStatus}`,
          ).toBe(domainAllows);
        }
      }
      // Always rollback synthetic parity test rows cleanly
      throw new Error('__ROLLBACK_PARITY_TX__');
    }).catch((err: Error) => {
      if (err.message !== '__ROLLBACK_PARITY_TX__') throw err;
    });

    expect(ALLOWED_ORDER_TRANSITIONS.delivered).toEqual([]);
  });
});

