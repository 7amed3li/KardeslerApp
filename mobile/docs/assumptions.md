# Mobile Application Assumptions & Unresolved Decisions

## Architectural & Product Assumptions

1. **Turkish-First & Multi-Language (`tr`, `en`, `ar`)**
   - Default language is Turkish (`tr`), matching `packages/shared` (`SUPPORTED_LANGUAGES = ['tr', 'en', 'ar']`).
   - Arabic (`ar`) enables full RTL layout via `I18nManager.forceRTL(true)`. On native platforms where `I18nManager` requires an app reload to flip layout direction, the user is prompted or the app restarts/updates layout cleanly.

2. **Guest Browsing Allowed**
   - Customers can browse the menu, inspect product details, check delivery coverage (`POST /api/v1/delivery/check`), and build a cart/quote (`POST /api/v1/orders/quote`) before authenticating.
   - Authentication (Turkish `+905XXXXXXXXX` phone OTP) is required before submitting `POST /api/v1/orders`, managing saved addresses, viewing order history, loyalty points, or referrals.

3. **Monetary Representation**
   - All prices, fees, discounts, and totals are integer kuruş (`100 kuruş = 1 TRY`).
   - Formatted exclusively with `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })`.
   - Local arithmetic is strictly limited to provisional UI hints (e.g., item count badge on cart icon). All checkout/cart totals come from `POST /api/v1/orders/quote`.

4. **Customer Auth & Token Storage**
   - Access token is kept in memory only; refresh token is persisted in `expo-secure-store`.
   - Never stored in AsyncStorage, URLs, logs, or Sentry events.

5. **Payment Flow & Redirect Safety**
   - `card_online` orders return `paymentCheckout` from `POST /api/v1/orders` or via `POST /api/v1/orders/:id/payment-session`.
   - `expo-web-browser` opens the checkout URL. Regardless of redirect/dismissal result, the app ALWAYS re-fetches `GET /api/v1/orders/:id` to verify the authoritative server status.

6. **Customer Note Length & Turkish Casing**
   - `CreateOrderBodySchema` allows `customer_note` up to 500 characters on the backend; the mobile product/cart UI caps per-item or order notes at 100 characters where specified, and uses `toLocaleUpperCase('tr-TR')` / `toLocaleLowerCase('tr-TR')` for Turkish-safe casing (`İ`/`ı`).

7. **Needs Confirmation**
   - `NEEDS CONFIRMATION`: Exact restaurant support phone number (`tel:` link in Order Tracking / Help) and physical pickup address in Cihangir, Istanbul for pickup instructions and map centering fallback. Using configurable constants in `src/config/restaurant.ts` until confirmed.
   - `NEEDS CONFIRMATION`: Exact production API domain (`https://api.kardeslercihangir.com`), Sentry DSN, EAS Project ID, Apple Team ID, and Google Play package signing credentials.
   - `NEEDS CONFIRMATION`: Whether `GET /api/v1/settings/public` should include `min_app_version` and `restaurant_phone` fields in the backend response.
   - `NEEDS CONFIRMATION`: Whether `POST /api/v1/consents` `type` enum values (`'marketing_push'`, `'kvkk'`, `'sms_marketing'`) match backend analytics/marketing expectations.

