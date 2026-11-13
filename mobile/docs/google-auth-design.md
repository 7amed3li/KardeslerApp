# Google Sign-In Architecture & Security Design — Kardeşler Cihangir

**Status:** Implemented (Backend + Mobile); External Google Cloud OAuth Client IDs / Secrets marked `NEEDS CONFIRMATION` until provisioned in Google Cloud Console.

---

## 1. Selected OAuth/OIDC Flow

- **Protocol:** OAuth 2.0 Authorization Code Flow with **PKCE (`S256`)**, OpenID Connect (`openid email profile`), `state`, and `nonce`, executed via the OS system browser (`expo-web-browser` / `ASWebAuthenticationSession` on iOS, Chrome Custom Tabs on Android, system popup/redirect on Web).
- **Why this flow fits:**
  - Works uniformly across Expo Go, Expo Development Builds, standalone iOS/Android builds, and Expo Web without requiring embedded WebViews (which Google blocks and OAuth BCP forbids).
  - Keeps the mobile app as a **public client**: no Google client secret is bundled in the app.
  - The Fastify backend performs the authorization code exchange (`https://oauth2.googleapis.com/token`) and independently verifies the returned `id_token` signature (Google JWKS `https://www.googleapis.com/oauth2/v3/certs`), `iss`, `aud`, `exp`, `iat`, `nonce`, `sub`, and `email_verified` before issuing the app's own short-lived JWT + rotatable refresh token.

---

## 2. End-to-End Sequence

1. Customer taps **"Google ile devam et"** on `AuthModalScreen` (triggered from Profile or Checkout).
2. Mobile generates cryptographically random `codeVerifier` (+ `S256` `codeChallenge`), `state`, and `nonce` (`expo-crypto` / Web Crypto).
3. Mobile opens the system browser to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id` (platform public ID), `redirect_uri` (allowlisted), `response_type=code`, `scope=openid email profile`, `code_challenge`, `code_challenge_method=S256`, `state`, and `nonce`.
4. Google redirects back to the app's allowlisted callback URI with `code` and `state`.
5. Mobile validates `state` matches the in-memory session (rejecting mismatches, missing `code`, or `error` parameters).
6. Mobile sends `POST /api/v1/auth/customer/google/exchange` with `{ code, codeVerifier, redirectUri, clientId, nonce }`.
7. Backend validates `clientId` and `redirectUri` against strict allowlists, enforces rate limits + code-replay protection in Redis/state store, exchanges `code` with Google, and verifies the `id_token` with Google JWKS (`jose`).
8. Backend runs a serializable/atomic PostgreSQL transaction (`user_identities` + `users` + `refresh_tokens`):
   - Finds existing `(provider='google', provider_subject=sub)` user, OR atomically provisions a new `users` + `user_identities` row (handling concurrent first-login `23505` safely).
   - Never silently merges with an existing legacy phone/email user.
9. Backend returns `{ accessToken, refreshToken, user }`. Mobile stores `accessToken` in memory only and `refreshToken` in `expo-secure-store` (or memory-only/session guard on Web), then resumes checkout/profile without losing cart state.

---

## 3. Derived Platform Configuration (from `mobile/app.config.ts`)

| Platform | Identifier / URI | Status |
|---|---|---|
| App Scheme | `kardesler` | Confirmed in `mobile/app.config.ts` |
| iOS Bundle ID | `com.kardeslercihangir.app` | Confirmed in `mobile/app.config.ts` |
| Android Package | `com.kardeslercihangir.app` | Confirmed in `mobile/app.config.ts` |
| Native Redirect URI | `kardesler://auth/google` (or reverse-DNS scheme `com.kardeslercihangir.app:/oauthredirect` / iOS reversed client ID) | `NEEDS CONFIRMATION` in Google Cloud Console |
| Web Redirect URI (dev) | `http://localhost:8081/auth` | Local dev |
| Android SHA-1 / SHA-256 | Release / Play App Signing & debug keystore fingerprints | `NEEDS CONFIRMATION` (from EAS `eas credentials`) |
| Google OAuth Client IDs | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `NEEDS CONFIRMATION` |
| Backend Confidential Client Secret | `GOOGLE_WEB_CLIENT_SECRET` (for Web OAuth client if confidential) | `NEEDS CONFIRMATION` |

---

## 4. Backend Changes, Migration & Rollback

### Database Migration (`user_identities`)
- New table `public.user_identities`:
  - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`
  - `provider text NOT NULL` (`'google'`)
  - `provider_subject text NOT NULL`
  - `email_at_link citext`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `UNIQUE (provider, provider_subject)`
  - `UNIQUE (user_id, provider)`
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `app_api` (and `SELECT` to `app_readonly`), owned by `app_migrator`.
- KVKK `public.anonymize_user(uuid)` updated to delete `user_identities` rows for anonymized customers so re-login creates a clean new account rather than reviving an anonymized user.
- **Rollback:** `DROP TABLE IF EXISTS public.user_identities;` (existing `users` and `otp_codes` remain untouched).

### New / Updated Routes
- `POST /api/v1/auth/customer/google/exchange` — public (rate-limited, PKCE + nonce + allowlist verified).
- `POST /api/v1/auth/customer/google/link` — authenticated customer only; links Google identity to current user without merging other accounts.
- `DELETE /api/v1/auth/customer/identities/:provider` — authenticated customer only; unlinks provider if and only if another login method (`phone`) exists.
- `PATCH /api/v1/users/me` — extended to accept optional validated `phone` (`PHONE_E164_REGEX`) so Google-authenticated delivery customers can supply a reachable contact number at checkout without SMS OTP.

---

## 5. Legacy Phone/OTP Migration & Phone Scope

- Existing `users` created via SMS OTP retain their `id`, `orders`, `addresses`, `consents`, and `loyalty_ledger`.
- **No silent email merge:** Signing in with Google never auto-links to an unlinked phone account based on matching `email`. To link Google to a legacy phone account, the customer logs into their legacy account first and triggers explicit linking (`POST /api/v1/auth/customer/google/link`).
- **Phone at checkout:** Customers can browse and sign in with Google without a phone number. Delivery orders require a reachable contact phone (`+905XXXXXXXXX`) collected at Checkout via `PATCH /api/v1/users/me` — no paid SMS OTP is required for ordinary login or checkout.

---

## 6. Threat Model Summary

| Threat | Mitigation |
|---|---|
| Client-side email spoofing / account takeover | Backend verifies signed Google `id_token` via Google JWKS; uses immutable `sub`, never email alone; no silent email merge. |
| Authorization code / token replay | `state` + `nonce` verified; backend tracks used `jti`/codes in rate/replay cache; refresh rotation detects reuse and revokes token family. |
| Open redirect / rogue client ID | Strict allowlists (`GOOGLE_CLIENT_IDS`, `GOOGLE_REDIRECT_URIS`); fail closed on mismatch. |
| Concurrent first-login duplicate users | PostgreSQL `UNIQUE (provider, provider_subject)` + `23505` conflict recovery inside transaction. |
| Secret leakage in mobile bundle | Only public OAuth client IDs in `EXPO_PUBLIC_*`; confidential secret stays on backend only; no tokens/codes/emails logged. |
| Stranded account after unlink | `DELETE /api/v1/auth/customer/identities/:provider` rejects unlink if user has no `phone`. |

