# Backend Endpoint Test Matrix & Quality Gates

Last updated: 2026-11-11

## Route Coverage Gate

- Enforced by `backend/tests/route-coverage.test.ts` + `backend/tests/endpoint-registry.ts` + `backend/tests/endpoint-matrix.test.ts`.
- Total live Fastify routes verified via `onRoute`: **66 / 66**.
- Any un-registered live route or stale registry entry fails CI immediately.

## Verification Dimensions

1. **Happy path**: All 66 endpoints verified (`endpoint-matrix.test.ts`, `integration-security.test.ts`, `characterization.test.ts`).
2. **Schema validation (`.strict()`) & 100 KB limit**: Unknown fields return `400 VALIDATION_ERROR`; oversized payloads (`>100 KB`) return `413 VALIDATION_ERROR`; SQLi/Unicode payloads safely parameterized via Drizzle/Postgres bindings.
3. **Authentication failures**: Missing token (`401`), malformed `Authorization` header (`401`), `alg=none` unsigned JWT (`401`), wrong-audience cross-role JWT (`401`), revoked print-agent JTI (`401`).
4. **Authorization & cross-tenant IDOR**: Customer B receives `404` on Customer A addresses (`PATCH/DELETE /api/v1/addresses/:id`) and orders (`GET /api/v1/orders/:id`); `staff` receives `403` on `owner`-only admin routes; PostgreSQL RLS (`app_api`) enforces isolation even inside raw SQL queries (`db-rls.test.ts`).
5. **Rate limiting**: OTP requests exceeding threshold return `429 RATE_LIMITED` backed by Redis (`RedisRateLimiter`).
6. **Idempotency**: Duplicate `POST /api/v1/orders` with same `idempotency_key` returns original order without duplicating rows or burning coupons (`concurrency` + `integration-security` + `endpoint-matrix`); duplicate webhooks safely ignored (`payment_events`).
7. **Error shape**: Uniform `{ error: { code, message, requestId } }` JSON across `400`, `401`, `403`, `404`, `409`, `413`, `422`, `429` without stack traces or internal SQL leakage.
8. **Side effects verified in DB**: `order_events`, `print_jobs`, `payment_events`, `loyalty_ledger`, and `audit_logs` counts asserted directly via `withTx`.
9. **Concurrency, DB Parity & Properties**:
   - `concurrency.test.ts`: Coupon `max_total_uses=1` race returns `[201, 422]`; simultaneous staff accept vs customer cancel returns `[200, 409]` without corrupting state.
   - `architecture.test.ts`: `OrderStateMachine` transition graph matches PostgreSQL `fn_order_status_and_immutability_trigger` across all `(from, to)` pairs (`7 x 6 = 42` transitions).
   - `domain-properties.test.ts` + `application-coverage.test.ts`: `fast-check` property-based tests & boundary assertions on `PricingDomain`, `CouponDomain`, `LoyaltyDomain`, `PaymentDomain`, `DeliveryDomain`, `OrderStateMachine`, `ThermalTicketDomain`, and `AuthorizationPolicy`.
   - **Coverage & Mutation Testing (`test:coverage` & `mutate`):**
     - `vitest run --coverage` across `src/domain/` & `src/application/`: **98.72% Statements | 90.02% Branches | 99.03% Functions | 98.72% Lines** (13 test files, 56 tests).
     - Stryker (`stryker run` targeting `pricing.domain.ts` & `coupon.domain.ts`): **77.12% total (`77.99%` covered; 209/271 killed)** — `coupon.domain.ts` 78.43%, `pricing.domain.ts` 75.42%.

## Endpoint Inventory Matrix (66 Routes)

| # | Method | Path | Auth | Matrix Suite |
|---|--------|------|------|--------------|
| 1 | GET | `/health` | public | `endpoint-matrix`, `characterization` |
| 2 | GET | `/healthz` | public | `endpoint-matrix`, `characterization` |
| 3 | GET | `/readyz` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 4 | GET | `/docs` | public | `endpoint-matrix`, `characterization` |
| 5 | POST | `/api/v1/auth/customer/otp/request` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 6 | POST | `/api/v1/auth/customer/otp/verify` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 7 | POST | `/api/v1/auth/customer/refresh` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 8 | POST | `/api/v1/auth/customer/logout` | customer | `endpoint-matrix`, `characterization` |
| 9 | POST | `/api/v1/auth/staff/login` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 10 | POST | `/api/v1/auth/staff/totp/setup` | totp_setup | `endpoint-matrix`, `integration-security`, `characterization` |
| 11 | POST | `/api/v1/auth/staff/totp/verify-setup` | totp_setup | `endpoint-matrix`, `integration-security`, `characterization` |
| 12 | POST | `/api/v1/print-agent/token` | owner | `endpoint-matrix`, `integration-security`, `characterization` |
| 13 | POST | `/api/v1/print-agent/token/revoke` | owner | `endpoint-matrix`, `characterization` |
| 14 | DELETE | `/api/v1/users/me` | customer | `endpoint-matrix`, `integration-security`, `characterization` |
| 15 | PATCH | `/api/v1/users/me` | customer | `endpoint-matrix` |
| 16 | POST | `/api/v1/devices` | customer | `endpoint-matrix` |
| 17 | GET | `/api/v1/referrals/me` | customer | `endpoint-matrix` |
| 18 | GET | `/api/v1/addresses` | customer | `endpoint-matrix`, `characterization` |
| 19 | POST | `/api/v1/addresses` | customer | `endpoint-matrix`, `characterization` |
| 20 | PATCH | `/api/v1/addresses/:id` | customer | `endpoint-matrix` |
| 21 | DELETE | `/api/v1/addresses/:id` | customer | `endpoint-matrix` |
| 22 | GET | `/api/v1/menu` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 23 | GET | `/api/v1/banners` | public | `endpoint-matrix` |
| 24 | GET | `/api/v1/settings/public` | public | `endpoint-matrix`, `characterization` |
| 25 | POST | `/api/v1/delivery/check` | public | `endpoint-matrix`, `integration-security`, `characterization` |
| 26 | PATCH | `/api/v1/admin/menu/items/:id` | owner | `endpoint-matrix`, `integration-security`, `characterization` |
| 27 | POST | `/api/v1/admin/menu/items` | owner | `endpoint-matrix` |
| 28 | DELETE | `/api/v1/admin/menu/items/:id` | owner | `endpoint-matrix` |
| 29 | POST | `/api/v1/admin/menu/categories` | owner | `endpoint-matrix` |
| 30 | PATCH | `/api/v1/admin/menu/categories/:id` | owner | `endpoint-matrix` |
| 31 | POST | `/api/v1/orders/quote` | public | `endpoint-matrix`, `characterization` |
| 32 | POST | `/api/v1/cart/price` | public | `endpoint-matrix`, `characterization` |
| 33 | POST | `/api/v1/orders` | customer | `endpoint-matrix`, `integration-security`, `characterization`, `concurrency` |
| 34 | GET | `/api/v1/orders` | customer | `endpoint-matrix`, `characterization` |
| 35 | GET | `/api/v1/orders/:id` | customer | `endpoint-matrix`, `characterization` |
| 36 | POST | `/api/v1/orders/:id/cancel` | customer | `endpoint-matrix`, `characterization`, `concurrency` |
| 37 | POST | `/api/v1/orders/:id/reorder` | customer | `endpoint-matrix`, `characterization` |
| 38 | POST | `/api/v1/payments/webhook` | hmac | `endpoint-matrix`, `integration-security`, `characterization` |
| 39 | GET | `/api/v1/staff/orders` | staff | `endpoint-matrix`, `integration-security`, `characterization` |
| 40 | POST | `/api/v1/staff/orders/:id/status` | staff | `endpoint-matrix`, `integration-security`, `characterization`, `concurrency` |
| 41 | PATCH | `/api/v1/orders/:id/status` | staff | `endpoint-matrix` |
| 42 | POST | `/api/v1/staff/orders/:id/driver` | staff | `endpoint-matrix`, `characterization` |
| 43 | POST | `/api/v1/staff/orders/:id/reprint` | staff | `endpoint-matrix`, `characterization` |
| 44 | POST | `/api/v1/staff/settings/pause` | staff | `endpoint-matrix`, `characterization` |
| 45 | GET | `/api/v1/realtime/staff` | staff | `endpoint-matrix`, `characterization` |
| 46 | GET | `/api/v1/print-agent/jobs/poll` | print_agent | `endpoint-matrix`, `integration-security`, `characterization` |
| 47 | POST | `/api/v1/print-agent/jobs/:id/ack` | print_agent | `endpoint-matrix`, `integration-security`, `characterization` |
| 48 | POST | `/api/v1/heartbeats` | staff | `endpoint-matrix`, `characterization` |
| 49 | GET | `/api/v1/loyalty/me` | customer | `endpoint-matrix`, `integration-security`, `characterization` |
| 50 | POST | `/api/v1/reviews` | customer | `endpoint-matrix`, `characterization` |
| 51 | POST | `/api/v1/consents` | customer | `endpoint-matrix`, `characterization` |
| 52 | GET | `/api/v1/admin/reports/daily-summary` | owner | `endpoint-matrix`, `integration-security`, `characterization` |
| 53 | GET | `/api/v1/admin/audit-logs` | owner | `endpoint-matrix`, `characterization` |
| 54 | GET | `/api/v1/admin/coupons` | owner | `endpoint-matrix` |
| 55 | POST | `/api/v1/admin/coupons` | owner | `endpoint-matrix` |
| 56 | PATCH | `/api/v1/admin/coupons/:id` | owner | `endpoint-matrix` |
| 57 | GET | `/api/v1/admin/zones` | owner | `endpoint-matrix` |
| 58 | PATCH | `/api/v1/admin/zones/:id` | owner | `endpoint-matrix` |
| 59 | GET | `/api/v1/admin/drivers` | owner | `endpoint-matrix` |
| 60 | POST | `/api/v1/admin/drivers` | owner | `endpoint-matrix` |
| 61 | GET | `/api/v1/admin/staff` | owner | `endpoint-matrix` |
| 62 | GET | `/api/v1/admin/fraud-flags` | owner | `endpoint-matrix` |
| 63 | POST | `/api/v1/admin/fraud-flags/:id/resolve` | owner | `endpoint-matrix` |
| 64 | GET | `/api/v1/admin/banners` | owner | `endpoint-matrix` |
| 65 | POST | `/api/v1/admin/banners` | owner | `endpoint-matrix` |
| 66 | PATCH | `/api/v1/admin/settings` | owner | `endpoint-matrix` |

