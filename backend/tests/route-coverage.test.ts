import { describe, it, expect, afterAll } from 'vitest';
import fastify from 'fastify';
import { createHttpServer } from '../src/http/server.js';
import { JoseTokenService } from '../src/infrastructure/security/jose-token.service.js';
import { InMemoryRevokedTokenStore } from '../src/infrastructure/redis/in-memory-adapters.js';
import { HttpAuthHooks } from '../src/http/auth-hooks.js';
import { ENDPOINT_TEST_REGISTRY } from './endpoint-registry.js';
import { buildRouteDimensionMatrix, writeTestMatrixDoc } from './test-matrix-generator.js';

describe('Step 5 Route-Coverage Gate (Untested Endpoints Break CI)', () => {
  const tokens = new JoseTokenService({
    activeKid: 'k1',
    customerSecret: 'a'.repeat(32),
    staffSecret: 'b'.repeat(32),
    printSecret: 'c'.repeat(32),
  });
  const hooks = new HttpAuthHooks(tokens, new InMemoryRevokedTokenStore());
  const stub: any = {};

  const liveRoutes = new Set<string>();
  const app = createHttpServer({
    nodeEnv: 'test',
    adminOrigin: 'http://localhost:5173',
    dbHealth: stub,
    authHooks: hooks,
    auth: stub,
    users: stub,
    menu: stub,
    orders: stub,
    payments: stub,
    loyalty: stub,
    printRt: stub,
    admin: stub,
    onRoute: (method, url) => liveRoutes.add(`${method} ${url}`),
  });

  afterAll(async () => {
    await app.close();
  });

  it('fails if ANY live Fastify route lacks an entry in ENDPOINT_TEST_REGISTRY (and vice versa)', async () => {
    await app.ready();
    void fastify;

    const registered = new Set(ENDPOINT_TEST_REGISTRY.map((e) => `${e.method} ${e.path}`));
    const missingFromTests = [...liveRoutes].filter((r) => !registered.has(r));
    const staleInRegistry = [...registered].filter((r) => !liveRoutes.has(r));

    expect(missingFromTests, `Untested routes detected: ${missingFromTests.join(', ')}`).toEqual([]);
    expect(staleInRegistry, `Stale registry routes: ${staleInRegistry.join(', ')}`).toEqual([]);
    expect(liveRoutes.size).toBe(80);
  });

  it('fails if ANY route dimension (happy, validation, authN, authZ/IDOR, rate-limit, idempotency, DB side-effects, concurrency) is missing without explicit N/A', () => {
    const matrix = buildRouteDimensionMatrix();
    expect(matrix.length).toBe(80);

    for (const entry of matrix) {
      const dimensions = [
        ['happy', entry.happy],
        ['validation', entry.validation],
        ['authN', entry.authN],
        ['authZ_IDOR', entry.authZ_IDOR],
        ['rateLimit', entry.rateLimit],
        ['idempotency', entry.idempotency],
        ['dbSideEffects', entry.dbSideEffects],
        ['concurrency', entry.concurrency],
      ] as const;

      for (const [dimName, val] of dimensions) {
        const isAsserted = typeof val === 'string' && val.startsWith('Asserted:');
        const isExplicitNA = typeof val === 'string' && val.startsWith('N/A:');
        expect(
          isAsserted || isExplicitNA,
          `Route ${entry.method} ${entry.path} dimension "${dimName}" is missing an assertion or explicit N/A justification! Got: "${val}"`,
        ).toBe(true);
      }
    }

    const docPath = writeTestMatrixDoc();
    expect(docPath).toContain('test-matrix.md');
  });
});

