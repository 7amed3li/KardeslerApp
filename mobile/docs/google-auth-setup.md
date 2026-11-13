# Google Sign-In Operational Setup Guide — Kardeşler Cihangir

## 1. Google Cloud Console Setup

1. Create or select a Google Cloud project (e.g., `kardesler-cihangir-prod`).
2. Configure **OAuth consent screen**:
   - User Type: **External**
   - App name: `Kardeşler Cihangir`
   - Scopes: `openid`, `email`, `profile` (minimal scopes only — do **not** add contacts/Drive/etc.).
   - Add test users while in **Testing** mode; submit for **Production** verification before store release.

## 2. OAuth Client IDs to Create

| Client Type | Identifier | Where Used |
|---|---|---|
| **iOS** | Bundle ID: `com.kardeslercihangir.app` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (public) + `GOOGLE_CLIENT_IDS` |
| **Android** | Package: `com.kardeslercihangir.app` + SHA-1 (`eas credentials` / Play App Signing) | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (public) + `GOOGLE_CLIENT_IDS` |
| **Web** | Authorized redirect URIs: `http://localhost:8081/auth`, staging/prod web origins, and `https://auth.expo.io/...` if used | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (public) + `GOOGLE_WEB_CLIENT_SECRET` (backend secret only) + `GOOGLE_CLIENT_IDS` |

## 3. Environment Variables (Public vs Secret)

### Mobile (`mobile/.env`, public bundle only)
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — **Public**
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` — **Public**
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — **Public**
- `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` — **Public** (e.g. `kardesler://auth/google` on native, `http://localhost:8081/auth` on local web)

### Backend (`backend/.env`, server-side only)
- `GOOGLE_CLIENT_IDS` — Comma-separated allowlist of valid Google OAuth Client IDs (`aud` check).
- `GOOGLE_REDIRECT_URIS` — Comma-separated allowlist of valid redirect URIs.
- `GOOGLE_WEB_CLIENT_SECRET` — **SECRET** (required only if exchanging codes issued to a confidential Web OAuth client; never put in `mobile/`).

## 4. Key Rotation, Revocation & Incident Response

- **Google signing key rotation:** Backend verifies ID tokens via Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`) using `jose` `createRemoteJWKSet`, which automatically refreshes unknown `kid`s.
- **Revocation / Unlink:** Users can unlink Google from Profile (if they have a phone fallback) or delete their entire account (`DELETE /api/v1/users/me`), which revokes refresh tokens and removes `user_identities`.
- **Incident response:** Rotate `GOOGLE_WEB_CLIENT_SECRET` in Google Cloud Console + backend secret manager; revoke compromised refresh token families in PostgreSQL `refresh_tokens`.

## 5. Current External Blockers (`NEEDS CONFIRMATION`)

- Google Cloud project & OAuth Consent Screen publishing status
- Production iOS / Android / Web OAuth Client IDs and Android Play Signing SHA-1 fingerprint
- `GOOGLE_WEB_CLIENT_SECRET` stored in production secret manager

