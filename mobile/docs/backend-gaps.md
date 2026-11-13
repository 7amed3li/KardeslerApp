# Backend Gaps & Limitations Discovered During Mobile Integration

This document records real gaps between the mobile application requirements and the existing backend API (`backend/`), based on direct inspection of `backend/src/http/routes/**`, `backend/src/http/schemas/api.schemas.ts`, `backend/src/application/**`, and `mobile/src/api/generated/openapi.json`.

No endpoints or fields have been invented in the mobile app. Each gap below is handled transparently or documented as requiring backend work before full production rollout.

## 1. Missing `GET /api/v1/users/me`
- **Current state:** `backend/src/http/routes/users.routes.ts` exposes `PATCH /api/v1/users/me` and `DELETE /api/v1/users/me`, but there is no `GET /api/v1/users/me` endpoint.
- **Impact:** After cold app launch using an existing refresh token (`POST /api/v1/auth/customer/refresh`), the backend returns `{ accessToken, refreshToken }` without a `user` object. The app cannot fetch the latest profile fields (`name`, `email`, `preferredLanguage`, `referralCode`) without an extra profile read endpoint.
- **Mobile workaround:** Cache the `user` object returned by `POST /api/v1/auth/customer/otp/verify` and `PATCH /api/v1/users/me` in local query/storage state (non-secret metadata). Update cached profile whenever `PATCH /api/v1/users/me` succeeds.
- **Backend action needed:** Add `GET /api/v1/users/me` returning the authenticated `UserProfile`.

## 2. Missing Customer Coupon List (`GET /api/v1/coupons`)
- **Current state:** Only `GET /api/v1/admin/coupons` (owner-only) exists.
- **Impact:** Mobile cannot display a list of available/active customer promotions or coupons; customers must manually enter coupon codes into the cart screen, where `POST /api/v1/orders/quote` validates and applies them.
- **Backend action needed:** Add a customer-safe `GET /api/v1/coupons` (or include eligible promo metadata in `/api/v1/banners`) if browsable coupons are desired.

## 3. Referral Code Application During Onboarding / Signup
- **Current state:** `GET /api/v1/referrals/me` returns `{ referralCode, referrals }` for sharing, and `transitionOrderAsStaff` awards referrer/referred bonuses (`referrerBonus: 100, referredBonus: 50`), but `OtpVerifyBodySchema` is `.strict()` with only `{ phone, code }`, and there is no `POST /api/v1/referrals/apply` endpoint.
- **Impact:** A new customer cannot enter or apply a friend's referral code via the mobile API during OTP signup or post-signup.
- **Mobile workaround:** Display the user's own referral code and sharing UI from `GET /api/v1/referrals/me`, and omit an unbacked "enter referral code" submission until the backend supports it.
- **Backend action needed:** Add `POST /api/v1/referrals/apply` or optional `referralCode` on `OtpVerifyBodySchema`.

## 4. Server-Side Favorites
- **Current state:** No `/favorites` endpoint exists in the backend.
- **Impact:** Favorites cannot be synced across devices.
- **Mobile workaround:** Store favorite menu item IDs locally on the device (Zustand + AsyncStorage), scoped as non-sensitive UI preference.

## 5. Device Unregistration on Logout (`DELETE /api/v1/devices`)
- **Current state:** `POST /api/v1/devices` registers `{ pushToken, platform, appVersion }`, but there is no `DELETE /api/v1/devices` endpoint to unlink a push token on logout.
- **Impact:** On logout, the mobile client clears local push registration flags and tokens, and calls `POST /api/v1/auth/customer/logout`, but cannot explicitly deactivate the push token server-side.
- **Backend action needed:** Add `DELETE /api/v1/devices` (accepting `{ pushToken }` or device id) and call it during logout before clearing auth tokens.

## 6. Push Notification Delivery Pipeline (`FakePushProvider` & Missing Status Dispatch)
- **Current state:** `backend/src/adapters/composition-root.ts` wires `FakePushProvider`, and `BackgroundJobsUseCases` only calls `pushProvider.send(...)` in `retryFailedNotifications()`. `OrdersUseCases.transitionOrderAsStaff` publishes to `eventBus` (`order.status_changed`) but does not enqueue customer push notifications into `notification_outbox`.
- **Impact:** Real APNs/FCM push notifications via Expo Push Service will not be delivered until the backend replaces `FakePushProvider` with an Expo Push Service adapter and enqueues customer status-change notifications.
- **Mobile readiness:** Mobile implements the complete client pipeline (`expo-notifications`, contextual permission after 1st order, `POST /devices`, token rotation detection, foreground/background/terminated tap handling, whitelist deep-link routing, notification preferences via `POST /consents`).

## 7. Hosted Checkout Payment Gateway (`FakePaymentProvider`)
- **Current state:** `POST /api/v1/orders/:id/payment-session` exists and returns `{ checkoutUrl, sessionId, expiresAt? }` via `PaymentProvider.initializePayment`. In dev/test, `FakePaymentProvider` is wired.
- **Impact:** Production online card payments require wiring the real iyzico (or equivalent) `PaymentProvider` adapter in `backend/` and ensuring callback URLs return to the app's registered scheme (`kardesler://payment-return`).

## 8. Customer Order Tracking Transport
- **Current state:** `GET /api/v1/staff/orders/stream` (SSE) is staff/owner-only. No customer SSE or WebSocket stream exists.
- **Mobile workaround:** Active order tracking uses adaptive polling of `GET /api/v1/orders/:id` (every 12s for active orders, backing off on errors/background, stopping on terminal statuses `delivered`, `cancelled`, `payment_failed`).

## 9. KVKK Privacy Policy / Terms Hosting URLs & Public Minimum App Version
- **Current state:** `GET /api/v1/settings/public` returns restaurant open/paused status and opening hours; verify whether `min_app_version` / `minimum_app_version` is present in `settings/public` or requires adding to `settings.public`.
- **Mobile workaround:** Mobile checks `min_app_version` defensively if present in `GET /api/v1/settings/public` and documents required store legal URLs in `mobile/docs/store-readiness.md`.

