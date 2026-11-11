import { describe, it, expect, afterAll } from 'vitest';
import fastify from 'fastify';
import { createHttpServer } from '../src/http/server.js';
import { JoseTokenService } from '../src/infrastructure/security/jose-token.service.js';
import { InMemoryRevokedTokenStore } from '../src/infrastructure/redis/in-memory-adapters.js';
import { HttpAuthHooks } from '../src/http/auth-hooks.js';
import { ENDPOINT_TEST_REGISTRY } from './endpoint-registry.js';

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
    expect(liveRoutes.size).toBe(66);
  });
});

