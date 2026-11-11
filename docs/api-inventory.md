# Live API Route Inventory & Documentation Diff (`docs/api-inventory.md`)

**Date:** 2026-11-11  
**Source:** Live inspection of `app.printRoutes({ commonPrefix: false })` on `@kardesler/backend` + line-by-line review of `backend/src/main.ts`, `docs/api.md`, and `GET /docs`.

---

## 1. Live Fastify Route Table (36 Routes + CORS `*`)

> **Schema Note:** At baseline, Fastify uses manual `zodSchema.parse(...)` inside handlers without `.strict()` (so unknown request fields are stripped, not rejected) and **none** of the routes attach Fastify response serialization schemas.

| # | Method | Path | Auth | Allowed Roles | Input Validation | Response Schema | Handler File |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| 1 | `GET` | `/health` | Public | Any | None | No | `src/main.ts:82` |
| 2 | `GET` | `/healthz` | Public | Any | None | No | `src/main.ts:88` |
| 3 | `GET` | `/readyz` | Public | Any | None | No | `src/main.ts:94` |
| 4 | `GET` | `/docs` | Public (non-prod) | Any | None | No | `src/main.ts:112` |
| 5 | `POST` | `/api/v1/auth/customer/otp/request` | Public + RL | Any | Yes (Zod, non-strict) | No | `src/main.ts:143` |
| 6 | `POST` | `/api/v1/auth/customer/otp/verify` | Public + RL | Any | Yes (Zod, non-strict) | No | `src/main.ts:163` |
| 7 | `POST` | `/api/v1/auth/customer/refresh` | Public + RL | Any | Yes (Zod, non-strict) | No | `src/main.ts:175` |
| 8 | `POST` | `/api/v1/auth/customer/logout` | Bearer JWT | `customer` | Optional Zod | No | `src/main.ts:187` |
| 9 | `DELETE` | `/api/v1/users/me` | Bearer JWT | `customer` | None | No | `src/main.ts:197` |
| 10 | `POST` | `/api/v1/auth/staff/login` | Public + RL | Any | Yes (Zod, non-strict) | No | `src/main.ts:208` |
| 11 | `POST` | `/api/v1/auth/staff/totp/setup` | Setup JWT | `totp_setup` | Yes (Zod, non-strict) | No | `src/main.ts:227` |
| 12 | `POST` | `/api/v1/auth/staff/totp/verify-setup` | Setup JWT | `totp_setup` | Yes (Zod, non-strict) | No | `src/main.ts:238` |
| 13 | `GET` | `/api/v1/menu` | Public | Any | Query/Header lang | No | `src/main.ts:258` |
| 14 | `PATCH` | `/api/v1/admin/menu/items/:id` | Bearer JWT | `owner` | Params + Body Zod | No | `src/main.ts:338` |
| 15 | `POST` | `/api/v1/delivery/check` | Public | Any | Yes (Zod, non-strict) | No | `src/main.ts:370` |
| 16 | `GET` | `/api/v1/addresses` | Bearer JWT | `customer` | None | No | `src/main.ts:401` |
| 17 | `POST` | `/api/v1/addresses` | Bearer JWT | `customer` | Yes (Zod, non-strict) | No | `src/main.ts:417` |
| 18 | `GET` | `/api/v1/settings/public` | Public | Any | None | No | `src/main.ts:457` |
| 19 | `POST` | `/api/v1/orders/quote` | Public | Any | Yes (Zod, non-strict) | No | `src/main.ts:609` |
| 20 | `POST` | `/api/v1/cart/price` | Public | Any | Yes (Zod, non-strict) | No | `src/main.ts:610` |
| 21 | `POST` | `/api/v1/orders` | Bearer JWT + RL | `customer` | Yes (Zod, non-strict) | No | `src/main.ts:612` |
| 22 | `GET` | `/api/v1/orders` | Bearer JWT | `customer` | None | No | `src/main.ts:703` |
| 23 | `GET` | `/api/v1/orders/:id` | Bearer JWT | `customer` | Params UUID Zod | No | `src/main.ts:714` |
| 24 | `POST` | `/api/v1/orders/:id/cancel` | Bearer JWT | `customer` | Params + Body Zod | No | `src/main.ts:745` |
| 25 | `POST` | `/api/v1/orders/:id/reorder` | Bearer JWT | `customer` | Params UUID Zod | No | `src/main.ts:800` |
| 26 | `GET` | `/api/v1/staff/orders` | Bearer JWT | `staff`, `owner` | None | No | `src/main.ts:877` |
| 27 | `POST` | `/api/v1/staff/orders/:id/status` | Bearer JWT | `staff`, `owner` | Params + Body Zod | No | `src/main.ts:987` |
| 28 | `PATCH` | `/api/v1/orders/:id/status` | Bearer JWT | `staff`, `owner` | Params + Body Zod | No | `src/main.ts:988` |
| 29 | `POST` | `/api/v1/staff/orders/:id/driver` | Bearer JWT | `staff`, `owner` | Params + Body Zod | No | `src/main.ts:990` |
| 30 | `POST` | `/api/v1/staff/orders/:id/reprint` | Bearer JWT | `staff`, `owner` | Params UUID Zod | No | `src/main.ts:1011` |
| 31 | `POST` | `/api/v1/staff/settings/pause` | Bearer JWT | `staff`, `owner` | Yes (Zod, non-strict) | No | `src/main.ts:1030` |
| 32 | `GET` | `/api/v1/realtime/staff` | Bearer JWT | `staff`, `owner` | Header `last-event-id` | No | `src/main.ts:1048` |
| 33 | `POST` | `/api/v1/print-agent/token` | Bearer JWT | `owner` | Yes (Zod, non-strict) | No | `src/main.ts:1074` |
| 34 | `POST` | `/api/v1/print-agent/token/revoke` | Bearer JWT | `owner` | Yes (Zod, non-strict) | No | `src/main.ts:1081` |
| 35 | `GET` | `/api/v1/print-agent/jobs/poll` | Bearer JWT | `print_agent` | None | No | `src/main.ts:1088` |
| 36 | `POST` | `/api/v1/print-agent/jobs/:id/ack` | Bearer JWT | `print_agent` | Params + Body Zod | No | `src/main.ts:1187` |
| 37 | `POST` | `/api/v1/heartbeats` | Bearer JWT | `staff`, `owner` | Yes (Zod, non-strict) | No | `src/main.ts:1218` |
| 38 | `POST` | `/api/v1/payments/webhook` | HMAC Signature | Provider | Yes (Zod, non-strict) | No | `src/main.ts:1249` |
| 39 | `GET` | `/api/v1/loyalty/me` | Bearer JWT | `customer` | None | No | `src/main.ts:1275` |
| 40 | `POST` | `/api/v1/reviews` | Bearer JWT | `customer` | Yes (Zod, non-strict) | No | `src/main.ts:1305` |
| 41 | `POST` | `/api/v1/consents` | Bearer JWT | `customer` | Yes (Zod, non-strict) | No | `src/main.ts:1350` |
| 42 | `GET` | `/api/v1/admin/reports/daily-summary` | Bearer JWT | `owner` | Query Zod | No | `src/main.ts:1381` |
| 43 | `GET` | `/api/v1/admin/audit-logs` | Bearer JWT | `owner` | None | No | `src/main.ts:1441` |

*(Count note: Fastify registers 43 HTTP method+path combinations excluding auto-generated `HEAD` shadows and `* OPTIONS` CORS handler.)*

---

## 2. Mismatches: Live Routes vs `docs/api.md` vs `GET /docs`

1. **`GET /api/v1/orders/my` (`docs/api.md`) vs `GET /api/v1/orders` (live `main.ts`):** `docs/api.md` documents `/api/v1/orders/my`, which returns **404** on the live server.
2. **`GET /api/v1/admin/orders/stream` (`docs/api.md`) vs `GET /api/v1/realtime/staff` (live `main.ts`):** `docs/api.md` references an unimplemented path.
3. **`GET /api/v1/print/jobs/poll` & `POST /api/v1/print/jobs/:id/ack` (`docs/api.md`) vs `/api/v1/print-agent/jobs/*` (live `main.ts`):** Prefix mismatch (`/print/` vs `/print-agent/`).
4. **Staff login field mismatch (`docs/api.md` vs `main.ts`):** `docs/api.md` says `totp_code` (snake_case), while `main.ts:212` parses `totpCode` (camelCase)!
5. **`GET /docs` OpenAPI output is hardcoded & incomplete:** `GET /docs` only lists **12 paths** out of **43 live endpoints** and declares zero request/response schemas, security schemes, or HTTP error definitions.
6. **Undocumented live endpoints in `docs/api.md`:** `/health`, `/healthz`, `/readyz`, `/api/v1/auth/customer/refresh`, `/api/v1/auth/customer/logout`, `/api/v1/auth/staff/totp/setup`, `/api/v1/auth/staff/totp/verify-setup`, `/api/v1/admin/menu/items/:id`, `/api/v1/delivery/check`, `/api/v1/addresses`, `/api/v1/settings/public`, `/api/v1/orders/quote`, `/api/v1/orders/:id`, `/api/v1/orders/:id/cancel`, `/api/v1/staff/*`, `/api/v1/print-agent/token*`, `/api/v1/heartbeats`, `/api/v1/payments/webhook`, `/api/v1/loyalty/me`, `/api/v1/reviews`, `/api/v1/consents`, `/api/v1/admin/reports/daily-summary`, `/api/v1/admin/audit-logs`.
7. **Missing routes expected for production (Step 6):** `PATCH/DELETE /api/v1/addresses/:id`, `PATCH /api/v1/users/me`, full Admin CRUD for categories, menu items (create/delete), option groups/options, coupons, banners, delivery zones, drivers, staff users, restaurant settings, fraud flags, and customer `devices` / `referrals`.

