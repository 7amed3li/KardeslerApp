# Store Readiness Checklist (iOS App Store & Google Play)

## 1. App Identity & Bundle Configuration
- **Bundle ID (iOS):** `com.kardeslercihangir.app` (`mobile/app.config.ts`)
- **Application ID (Android):** `com.kardeslercihangir.app` (`mobile/app.config.ts`)
- **URL Scheme:** `kardesler://`
- **EAS Profiles:** `development`, `preview`, `production` (`mobile/eas.json`)
- **EAS Project ID:** `NEEDS CONFIRMATION` (`EXPO_PUBLIC_EAS_PROJECT_ID`)

## 2. Store Credentials & Signing (`NEEDS CONFIRMATION`)
- [ ] Apple Developer Team ID, App Store Connect API Key, and Push Notification Key (`.p8` for APNs).
- [ ] Google Play Console Service Account JSON and Android Keystore (managed via EAS).
- [ ] FCM v1 Server Credentials uploaded to EAS (`eas credentials`).

## 3. Privacy, Permissions & Legal Disclosures
- **Location (`NSLocationWhenInUseUsageDescription` / `ACCESS_FINE_LOCATION`):** Declared in `app.config.ts` with Turkish rationale for delivery zone checking and address pinning.
- **Push Notifications:** Contextual permission request (never on cold launch); marketing consent recorded via `POST /api/v1/consents`.
- **Account Deletion (KVKK / App Store Guideline 5.1.1(v)):** Implemented via 2-step confirmation calling `DELETE /api/v1/users/me`.
- **Privacy Policy & Terms URLs:** `NEEDS CONFIRMATION` (host KVKK & Terms URLs on `kardeslercihangir.com` and link in App Store Connect / Play Console).

## 4. Production Environment Variables
- `EXPO_PUBLIC_API_URL` -> `NEEDS CONFIRMATION` (e.g. `https://api.kardeslercihangir.com`)
- `EXPO_PUBLIC_SENTRY_DSN` -> `NEEDS CONFIRMATION` (Sentry PII `beforeSend` scrubber active in `src/lib/sentry.ts`)
- **Zero Secrets in Bundle:** Verified no API secrets, HMAC keys, or JWT secrets exist in `mobile/`.

## 5. Real-Device Verification Checklist (Before Submission)
- [ ] Physical iOS & Android push notification delivery (foreground, background, terminated tap).
- [ ] Real iyzico hosted checkout redirect (`kardesler://payment-return`) and server status verification.
- [ ] Arabic RTL layout inspection on physical device after `I18nManager.forceRTL(true)`.
