import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DomainError } from '../../domain/errors.js';
import type {
  GoogleExchangeInput,
  GoogleOidcProviderPort,
  GoogleVerifiedClaims,
} from '../../ports/providers.js';

export interface GoogleOidcConfig {
  clientIds: string[];
  redirectUris: string[];
  webClientSecret?: string;
  tokenEndpoint: string;
  jwksUri: string;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const MAX_FUTURE_IAT_SECONDS = 300;
const TOKEN_EXCHANGE_TIMEOUT_MS = 8000;

export class HttpGoogleOidcProvider implements GoogleOidcProviderPort {
  private readonly allowedClientIds: Set<string>;
  private readonly allowedRedirectUris: Set<string>;
  private readonly webClientSecret?: string;
  private readonly tokenEndpoint: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: GoogleOidcConfig) {
    this.allowedClientIds = new Set(config.clientIds.filter((id) => id.trim().length > 0));
    this.allowedRedirectUris = new Set(config.redirectUris.filter((uri) => uri.trim().length > 0));
    this.webClientSecret = config.webClientSecret?.trim() || undefined;
    this.tokenEndpoint = config.tokenEndpoint;
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri));
  }

  async exchangeCodeAndVerifyIdToken(input: GoogleExchangeInput): Promise<GoogleVerifiedClaims> {
    if (this.allowedClientIds.size === 0 || this.allowedRedirectUris.size === 0) {
      throw new DomainError('SERVICE_UNAVAILABLE', 503, 'Google sign-in is not configured.');
    }
    if (!this.allowedClientIds.has(input.clientId) || !this.allowedRedirectUris.has(input.redirectUri)) {
      throw new DomainError('VALIDATION_ERROR', 400, 'Invalid Google OAuth client or redirect URI.');
    }

    const idToken = await this.fetchIdToken(input);
    return this.verifyIdTokenClaims(idToken, input.clientId, input.nonce);
  }

  private async fetchIdToken(input: GoogleExchangeInput): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });
    if (this.webClientSecret && input.redirectUri.startsWith('http')) {
      params.set('client_secret', this.webClientSecret);
    }

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: params.toString(),
        signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
      });
    } catch {
      throw new DomainError('SERVICE_UNAVAILABLE', 503, 'Unable to reach Google authentication service.');
    }

    if (tokenResponse.status >= 500) {
      throw new DomainError('SERVICE_UNAVAILABLE', 503, 'Google authentication service is temporarily unavailable.');
    }
    if (!tokenResponse.ok) {
      throw new DomainError('UNAUTHORIZED', 401, 'Google authorization code exchange failed.');
    }

    let tokenJson: { id_token?: unknown };
    try {
      tokenJson = (await tokenResponse.json()) as { id_token?: unknown };
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Invalid response from Google authentication service.');
    }

    if (typeof tokenJson.id_token !== 'string' || tokenJson.id_token.length === 0) {
      throw new DomainError('UNAUTHORIZED', 401, 'Google response did not include an ID token.');
    }
    return tokenJson.id_token;
  }

  private async verifyIdTokenClaims(
    idToken: string,
    clientId: string,
    expectedNonce: string,
  ): Promise<GoogleVerifiedClaims> {
    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(idToken, this.jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
        clockTolerance: 60,
      });
      payload = verified.payload as Record<string, unknown>;
    } catch {
      throw new DomainError('UNAUTHORIZED', 401, 'Invalid Google ID token.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + MAX_FUTURE_IAT_SECONDS) {
      throw new DomainError('UNAUTHORIZED', 401, 'Invalid Google ID token issue time.');
    }
    if (typeof payload.nonce !== 'string' || payload.nonce.length === 0 || payload.nonce !== expectedNonce) {
      throw new DomainError('UNAUTHORIZED', 401, 'Google ID token nonce mismatch.');
    }
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new DomainError('UNAUTHORIZED', 401, 'Google ID token missing subject.');
    }
    if (payload.email_verified !== true) {
      throw new DomainError('UNAUTHORIZED', 401, 'Google account email is not verified.');
    }

    const email = typeof payload.email === 'string' && payload.email.trim().length > 0
      ? payload.email.trim().toLowerCase()
      : null;
    const name = typeof payload.name === 'string' && payload.name.trim().length > 0
      ? payload.name.trim().slice(0, 150)
      : null;

    return { sub: payload.sub.trim(), email, emailVerified: true, name };
  }
}
