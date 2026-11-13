import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { eq } from 'drizzle-orm';
import { createAppContainer } from '../src/composition-root.js';
import { HttpGoogleOidcProvider } from '../src/infrastructure/providers/google-oidc.provider.js';
import { withTx, schema } from '../src/infrastructure/db/client.js';

interface MockTokenBehavior {
  mode: 'ok' | 'http_400' | 'http_503' | 'missing_id_token' | 'bad_json' | 'timeout';
  idToken?: string;
}

describe('Google OIDC Auth, Account Provisioning, Linking & Security', () => {
  let server: http.Server;
  let baseUrl = '';
  let primaryKey!: Awaited<ReturnType<typeof generateKeyPair>>;
  let rotatedKey!: Awaited<ReturnType<typeof generateKeyPair>>;
  let rogueKey!: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwksKeys: JWK[] = [];
  let behavior: MockTokenBehavior = { mode: 'ok' };

  const clientId = 'test-web-client-123456.apps.googleusercontent.com';
  const redirectUri = 'http://localhost:8081/auth/callback';

  let container!: ReturnType<typeof createAppContainer>;
  const createdUserIds: string[] = [];

  async function signGoogleIdToken(
    claims: Record<string, unknown>,
    options: { key?: Awaited<ReturnType<typeof generateKeyPair>>; kid?: string; exp?: string | number } = {},
  ): Promise<string> {
    const k = options.key ?? primaryKey;
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? 'key-1' })
      .setIssuedAt((claims.iat as number | undefined) ?? Math.floor(Date.now() / 1000))
      .setExpirationTime(options.exp ?? '10m');
    return jwt.sign(k.privateKey);
  }

  function validCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  function validNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  beforeAll(async () => {
    primaryKey = await generateKeyPair('RS256');
    rotatedKey = await generateKeyPair('RS256');
    rogueKey = await generateKeyPair('RS256');

    const jwk1 = await exportJWK(primaryKey.publicKey);
    jwk1.kid = 'key-1';
    jwk1.alg = 'RS256';
    jwk1.use = 'sig';

    const jwk2 = await exportJWK(rotatedKey.publicKey);
    jwk2.kid = 'key-2';
    jwk2.alg = 'RS256';
    jwk2.use = 'sig';

    jwksKeys = [jwk1, jwk2];

    server = http.createServer((req, res) => {
      if (req.url === '/certs' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: jwksKeys }));
        return;
      }
      if (req.url === '/token' && req.method === 'POST') {
        if (behavior.mode === 'timeout') {
          setTimeout(() => {
            if (!res.writableEnded) {
              res.writeHead(504);
              res.end();
            }
          }, 9000);
          return;
        }
        if (behavior.mode === 'http_503') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'temporarily_unavailable' }));
          return;
        }
        if (behavior.mode === 'http_400') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        if (behavior.mode === 'missing_id_token') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'only-access' }));
          return;
        }
        if (behavior.mode === 'bad_json') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('not-json');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id_token: behavior.idToken, access_token: 'mock-access', token_type: 'Bearer' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const googleOidcProvider = new HttpGoogleOidcProvider({
      clientIds: [clientId],
      redirectUris: [redirectUri],
      webClientSecret: 'mock-web-secret',
      tokenEndpoint: `${baseUrl}/token`,
      jwksUri: `${baseUrl}/certs`,
    });

    container = createAppContainer({ googleOidcProvider, useInMemoryState: true });
    await container.app.ready();
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await withTx({ role: 'auth' }, async (tx) => {
        await tx.delete(schema.userIdentities).where(eq(schema.userIdentities.userId, uid));
        await tx.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, uid));
        await tx.delete(schema.users).where(eq(schema.users.id, uid));
      }).catch(() => {});
    }
    await container.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('provisions a new user on first Google sign-in and reuses the same user on subsequent sign-in', async () => {
    const sub = `google-sub-${Date.now()}-1`;
    const nonce1 = validNonce();
    behavior = {
      mode: 'ok',
      idToken: await signGoogleIdToken({
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub,
        nonce: nonce1,
        email: 'Ayse.Yilmaz@Example.com',
        email_verified: true,
        name: 'Ayşe Yılmaz',
      }),
    };

    const res1 = await container.app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/google/exchange',
      payload: {
        code: `auth-code-1-${Date.now()}`,
        codeVerifier: validCodeVerifier(),
        redirectUri,
        clientId,
        nonce: nonce1,
      },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.isNewUser).toBe(true);
    expect(body1.accessToken).toEqual(expect.any(String));
    expect(body1.refreshToken).toEqual(expect.any(String));
    expect(body1.user.phone).toBeNull();
    expect(body1.user.email).toBe('ayse.yilmaz@example.com');
    expect(body1.user.name).toBe('Ayşe Yılmaz');
    createdUserIds.push(body1.user.id);

    // Subsequent sign-in with rotated key (key-2)
    const nonce2 = validNonce();
    behavior = {
      mode: 'ok',
      idToken: await signGoogleIdToken(
        {
          iss: 'accounts.google.com',
          aud: clientId,
          sub,
          nonce: nonce2,
          email: 'ayse.yilmaz@example.com',
          email_verified: true,
          name: 'Ayşe Yılmaz',
        },
        { key: rotatedKey, kid: 'key-2' },
      ),
    };

    const res2 = await container.app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/google/exchange',
      payload: {
        code: `auth-code-2-${Date.now()}`,
        codeVerifier: validCodeVerifier(),
        redirectUri,
        clientId,
        nonce: nonce2,
      },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.isNewUser).toBe(false);
    expect(body2.user.id).toBe(body1.user.id);
  });

  it('handles simultaneous concurrent first-time login for the same Google sub without duplicate users', async () => {
    const sub = `google-sub-race-${Date.now()}`;
    const sharedNonce = validNonce();
    const sharedToken = await signGoogleIdToken({
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub,
      nonce: sharedNonce,
      email: `race-${Date.now()}@example.com`,
      email_verified: true,
      name: 'Concurrent User',
    });

    // Use two distinct nonces/codes by signing two tokens for the same sub
    const nonceA = validNonce();
    const nonceB = validNonce();
    const tokA = await signGoogleIdToken({
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub,
      nonce: nonceA,
      email: `race-${Date.now()}@example.com`,
      email_verified: true,
      name: 'Concurrent User',
    });
    const tokB = await signGoogleIdToken({
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub,
      nonce: nonceB,
      email: `race-${Date.now()}@example.com`,
      email_verified: true,
      name: 'Concurrent User',
    });
    void sharedToken;

    // Run against repository directly to force true concurrent SAVEPOINT race
    const authRepo = new (await import('../src/infrastructure/repositories/auth.repository.js')).PostgresAuthRepository();
    const now = new Date();
    const [rA, rB] = await Promise.all([
      authRepo.findOrProvisionGoogleUserAndSession({
        providerSubject: sub,
        email: 'race@example.com',
        name: 'Concurrent User',
        newReferralCode: `KCR1${Date.now().toString(36).slice(-4).toUpperCase()}`,
        refreshTokenHash: crypto.createHash('sha256').update('rt-a-' + Date.now()).digest('hex'),
        familyId: crypto.randomUUID(),
        refreshExpiresAt: new Date(Date.now() + 86400_000),
        deviceInfo: null,
        now,
      }),
      authRepo.findOrProvisionGoogleUserAndSession({
        providerSubject: sub,
        email: 'race@example.com',
        name: 'Concurrent User',
        newReferralCode: `KCR2${Date.now().toString(36).slice(-4).toUpperCase()}`,
        refreshTokenHash: crypto.createHash('sha256').update('rt-b-' + Date.now()).digest('hex'),
        familyId: crypto.randomUUID(),
        refreshExpiresAt: new Date(Date.now() + 86400_000),
        deviceInfo: null,
        now,
      }),
    ]);
    void tokA;
    void tokB;

    expect(rA.user.id).toBe(rB.user.id);
    expect([rA.isNewUser, rB.isNewUser].filter(Boolean)).toHaveLength(1);
    createdUserIds.push(rA.user.id);
  });

  it('fails closed on invalid signatures, bad claims, unverified email, replay, and allowlist violations', async () => {
    const baseClaims = {
      iss: 'https://accounts.google.com',
      aud: clientId,
      sub: `google-sub-sec-${Date.now()}`,
      email: 'sec@example.com',
      email_verified: true,
    };

    // 1. Rogue signature
    const n1 = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, nonce: n1 }, { key: rogueKey, kid: 'key-1' }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c1-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n1 },
    })).statusCode).toBe(401);

    // 2. Expired token
    const n2 = validNonce();
    const past = Math.floor(Date.now() / 1000) - 3600;
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, nonce: n2, iat: past - 600 }, { exp: past }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c2-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n2 },
    })).statusCode).toBe(401);

    // 3. Future iat (> now + 300s)
    const n3 = validNonce();
    const future = Math.floor(Date.now() / 1000) + 600;
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, nonce: n3, iat: future }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c3-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n3 },
    })).statusCode).toBe(401);

    // 4. Wrong issuer
    const n4 = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, iss: 'https://evil.example.com', nonce: n4 }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c4-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n4 },
    })).statusCode).toBe(401);

    // 5. Wrong audience
    const n5 = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, aud: 'other-client-id.apps.googleusercontent.com', nonce: n5 }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c5-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n5 },
    })).statusCode).toBe(401);

    // 6. Nonce mismatch
    const n6 = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, nonce: validNonce() }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c6-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n6 },
    })).statusCode).toBe(401);

    // 7. Unverified email
    const n7 = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, email_verified: false, nonce: n7 }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c7-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n7 },
    })).statusCode).toBe(401);

    // 8. Missing sub
    const n8 = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ iss: 'https://accounts.google.com', aud: clientId, email_verified: true, nonce: n8 }) };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c8-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n8 },
    })).statusCode).toBe(401);

    // 9. Untrusted redirectUri
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c9-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri: 'https://evil.example.com/cb', clientId, nonce: validNonce() },
    })).statusCode).toBe(400);

    // 10. Replay of code/nonce
    const replayCode = `replay-code-${Date.now()}`;
    const replayNonce = validNonce();
    behavior = { mode: 'ok', idToken: await signGoogleIdToken({ ...baseClaims, nonce: replayNonce }) };
    const first = await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: replayCode, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: replayNonce },
    });
    expect(first.statusCode).toBe(200);
    createdUserIds.push(first.json().user.id);

    const replay = await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: replayCode, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: validNonce() },
    });
    expect(replay.statusCode).toBe(401);

    // 11. Google 503 & 400
    behavior = { mode: 'http_503' };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c11-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: validNonce() },
    })).statusCode).toBe(503);

    behavior = { mode: 'http_400' };
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c12-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: validNonce() },
    })).statusCode).toBe(401);
  });

  it('does not silently merge by email, supports explicit link/unlink with fallback guard, and allows setting phone via PATCH /users/me', async () => {
    const sharedEmail = `shared-${Date.now()}@example.com`;
    const phone = `+90539${String(Date.now()).slice(-7)}`;

    // Create legacy phone user with sharedEmail
    await container.app.inject({ method: 'POST', url: '/api/v1/auth/customer/otp/request', payload: { phone } });
    // Fetch OTP or use review demo? Use direct OTP query from DB to verify phone user cleanly
    const latestOtp = await withTx({ role: 'auth' }, async (tx) => {
      return tx.select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone)).limit(1);
    });
    expect(latestOtp.length).toBe(1);
    // Instead of guessing OTP code, insert a user via OTP verify by using review demo phone? No, just sign a customer token or update phone on a Google user!
    // Actually, we can test non-merge directly by inserting a phone user row in DB with sharedEmail, then signing in with Google using sharedEmail:
    const [legacyUser] = await withTx({ role: 'auth' }, async (tx) => {
      return tx.insert(schema.users).values({
        phone,
        email: sharedEmail,
        name: 'Legacy Phone User',
        referralCode: `KCL${Date.now().toString(36).slice(-4).toUpperCase()}`,
        preferredLanguage: 'tr',
      }).returning();
    });
    createdUserIds.push(legacyUser.id);
    const { accessToken: legacyToken } = await container.tokens.signCustomerToken(legacyUser.id);

    // Sign in with Google using the SAME email -> must NOT merge with legacyUser
    const subGoogle = `google-sub-nomerge-${Date.now()}`;
    const n1 = validNonce();
    behavior = {
      mode: 'ok',
      idToken: await signGoogleIdToken({
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub: subGoogle,
        nonce: n1,
        email: sharedEmail,
        email_verified: true,
        name: 'Google User',
      }),
    };
    const googleRes = await container.app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/google/exchange',
      payload: { code: `c-nomerge-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n1 },
    });
    expect(googleRes.statusCode).toBe(200);
    const googleUser = googleRes.json().user;
    const googleToken = googleRes.json().accessToken;
    createdUserIds.push(googleUser.id);
    expect(googleUser.id).not.toBe(legacyUser.id);

    // Unlink without phone fallback must fail with 409
    const unlinkBlocked = await container.app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/customer/identities/google',
      headers: { authorization: `Bearer ${googleToken}` },
    });
    expect(unlinkBlocked.statusCode).toBe(409);

    // Add phone to Google user via PATCH /api/v1/users/me -> 200
    const newPhone = `+90538${String(Date.now()).slice(-7)}`;
    const patchPhone = await container.app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${googleToken}` },
      payload: { phone: newPhone },
    });
    expect(patchPhone.statusCode).toBe(200);
    expect(patchPhone.json().user.phone).toBe(newPhone);

    // Unauthenticated requests to protected identity routes fail closed (401)
    expect((await container.app.inject({ method: 'GET', url: '/api/v1/auth/customer/identities' })).statusCode).toBe(401);
    expect((await container.app.inject({
      method: 'POST', url: '/api/v1/auth/customer/google/link',
      payload: { code: 'x1234', codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: validNonce() },
    })).statusCode).toBe(401);
    expect((await container.app.inject({ method: 'DELETE', url: '/api/v1/auth/customer/identities/google' })).statusCode).toBe(401);

    // Now unlink succeeds because phone fallback exists -> 200
    const unlinkOk = await container.app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/customer/identities/google',
      headers: { authorization: `Bearer ${googleToken}` },
    });
    expect(unlinkOk.statusCode).toBe(200);

    // Legacy user links a fresh Google identity -> 200
    const subLink = `google-sub-link-${Date.now()}`;
    const n2 = validNonce();
    behavior = {
      mode: 'ok',
      idToken: await signGoogleIdToken({
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub: subLink,
        nonce: n2,
        email: 'linked@example.com',
        email_verified: true,
      }),
    };
    const linkRes = await container.app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/google/link',
      headers: { authorization: `Bearer ${legacyToken}` },
      payload: { code: `c-link-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n2 },
    });
    expect(linkRes.statusCode).toBe(200);
    expect(linkRes.json().linked).toBe(true);

    // List identities for legacy user
    const listRes = await container.app.inject({
      method: 'GET',
      url: '/api/v1/auth/customer/identities',
      headers: { authorization: `Bearer ${legacyToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().identities).toHaveLength(1);
    expect(listRes.json().identities[0].provider).toBe('google');

    // Another user trying to link the same subLink -> 409 Conflict
    const n3 = validNonce();
    behavior = {
      mode: 'ok',
      idToken: await signGoogleIdToken({
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub: subLink,
        nonce: n3,
        email: 'linked@example.com',
        email_verified: true,
      }),
    };
    const linkConflict = await container.app.inject({
      method: 'POST',
      url: '/api/v1/auth/customer/google/link',
      headers: { authorization: `Bearer ${googleToken}` },
      payload: { code: `c-conflict-${Date.now()}`, codeVerifier: validCodeVerifier(), redirectUri, clientId, nonce: n3 },
    });
    expect(linkConflict.statusCode).toBe(409);
  });
});
