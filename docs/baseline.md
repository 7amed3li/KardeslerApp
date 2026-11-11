# Independent Engineering Baseline (`docs/baseline.md`)

**Date:** 2026-11-11  
**Project:** Kardeşler Cihangir Food Ordering Backend  
**Note on Source Context:** `PROJECT_CONTEXT.md` is not present in the repository. All claims from the existing progress reports (`docs/Kardesler_Cihangir_Progress_Report_AR_v1.0.docx`, `docs/Kardesler_Cihangir_Progress_Report_TR_v1.0.docx`), `README.md`, and `docs/*.md` were independently tested against a fresh checkout/clean database and live command execution.

---

## 1. Environment & Infrastructure Observed
- **OS / Runtime:** Windows host with WSL `docker-desktop` distro (Alpine Linux); Node.js `v20.19.0`, pnpm `10.11.1`, Python `3.12.7`.
- **Docker Engine Status:** `docker info` reports Client `28.4.0`, but `docker ps` fails because `dockerDesktopLinuxEngine` named pipe is not running on this host.
- **PostgreSQL + PostGIS:** PostgreSQL `16.14` + PostGIS `3.4.2` running inside WSL (`127.0.0.1:5434`).
- **Redis:** Not running at baseline (no `redis-server` binary in `docker-desktop` at baseline; backend currently operates on in-memory fallbacks).
- **`security_attack_scripts/`:** Does **not exist** in the repository. Equivalent attack regressions live in `database/tests.sql` (#14–#23) and `database/tests_phase0.sql` (#1–#6).

---

## 2. Clean Database Verification (Port `5435` Clean PG16 Cluster)
A brand-new PostgreSQL 16.14 + PostGIS 3.4.2 cluster (`/tmp/pg_baseline`) was initialized and executed from scratch:
- `001_extensions_and_roles.sql` run as `postgres` (superuser): **PASS** (`exit code 0`).
- `002_core.sql` through `009_order_flow.sql` run strictly as `app_migrator`: **PASS** (`exit code 0` on every file). *(Observation: `001` grants `SUPERUSER` to `app_migrator`, which is why `008` `CREATE ROLE app_definer` succeeds as `app_migrator`.)*
- `database/tests_phase0.sql` (executes under `app_api` and `app_readonly`): **6 / 6 PASS**.
- `database/tests.sql`: **23 / 23 PASS** (tests #1–#23 all returned `PASS`).

---

## 3. Monorepo Command Baseline (Exact Counts & Failures)

| Command | Exit Code | Exact Result |
| :--- | :---: | :--- |
| `pnpm run lint` | `2` (FAIL) | **FAILED**: ESLint 9.39.5 cannot find `eslint.config.(js\|mjs\|cjs)` in `backend/` or `packages/shared/`. |
| `pnpm run typecheck` | `0` (PASS) | **PASSED**: All 5 workspace packages (`shared`, `backend`, `print-agent`, `admin`, `mobile`) `tsc --noEmit` succeeded. |
| `pnpm run build` | `1` (FAIL) | **FAILED** on `admin`: Vite/Rollup failed with `"formatKurus" is not exported by "../packages/shared/dist/index.js"` (because `packages/shared/tsconfig.json` has `"rootDir": "./src"` outputting to `dist/src/index.js` while `package.json` points `main` to `./dist/index.js`). |
| `pnpm run test` | `0` (PASS) | **PASSED**: `backend` 4 files / **25 tests passed**; `print-agent` 1 file / **2 tests passed**. |

---

## 4. Verification of Previous Report Claims

| Prior Report / Doc Claim | Verification Result | Details |
| :--- | :--- | :--- |
| `tests_phase0.sql` passes 6/6 under `app_api` & `app_readonly` | **VERIFIED** | Reproduced on clean PG16 instance (`6/6 PASS`). |
| `backend` has 25 passing Vitest tests across 4 files | **VERIFIED** | Reproduced (`25/25 PASS`). |
| `print-agent` has 2 passing Vitest tests | **VERIFIED** | Reproduced (`2/2 PASS`). |
| `database/tests.sql` has 13 tests (`README.md`) | **CORRECTED** | `database/tests.sql` actually has **23** tests (Tests #14–#23 test subtotal math, spoofing, event forgery, anonymize auth, audit sanitization, search_path hijack, TRUNCATE protection, child Turkish translation deletion, RLS privacy, and `redeem_coupon` math) — all **23/23 PASS**. |
| `M-3` (child Turkish translation deletion untested in `tests_phase0.sql`) | **VERIFIED / CLARIFIED** | `003_menu.sql` already enforces `trg_deferred_check_*_tr_del` on child tables, and `tests.sql` Test #21 verifies it (as superuser/role test), while `tests_phase0.sql` does not include a child-delete assertion under `app_api`. |
| Monorepo builds cleanly (`pnpm run build`) | **FAILED AT BASELINE** | `backend` builds (`tsc -p tsconfig.build.json`), but `pnpm -r run build` fails on `@kardesler/admin` due to `@kardesler/shared` `dist` layout mismatch. |
| ESLint passes or is configured (`ci.yml` runs `pnpm check`) | **FAILED AT BASELINE** | `pnpm run lint` fails everywhere (`eslint.config.js` missing). |
| `backend` connects with `app_api` & `app_readonly` | **PARTIAL** | Default env URLs use `app_api` and `app_readonly`, and `parseEnv` rejects `postgres:` in `NODE_ENV=production` by string match, but boot does **not** run a PostgreSQL `pg_roles` check verifying `!rolsuper`, `!rolbypassrls`, and non-table-ownership. |
| Routes reject unknown fields | **UNTRUE AT BASELINE** | Zod `.object({...})` schemas in `main.ts` do **not** use `.strict()`, so unknown JSON fields are silently stripped rather than rejected. |
| JWT verifies `alg`, `iss`, `aud`, `exp`, `kid` | **PARTIAL** | `jsonwebtoken` verifies `issuer`, `audience`, and `exp`, but does **not** pin `algorithms: ['HS256']` or support `kid` key rotation. |

---

## 5. Backend Source Code Map (`backend/src/`)

| File | Lines | Responsibility & Current Coupling |
| :--- | :---: | :--- |
| `backend/src/main.ts` | 1,465 | **Monolith**: initializes Fastify, Helmet, CORS, Pino, in-memory `menuCache`, all 36 HTTP endpoints, direct Drizzle/raw SQL queries, business rules, and server startup. |
| `backend/src/modules/auth/auth.service.ts` | 649 | OTP HMAC-SHA256, Argon2id, AES-256-GCM TOTP, `jsonwebtoken` tokens, refresh token rotation, and in-memory `revokedPrintTokenJtis` `Set`. |
| `backend/src/db/schema.ts` | 552 | Drizzle table definitions (missing `heartbeats`? Let's note it includes core + `008`/`009` tables). |
| `backend/src/modules/payments/payment.service.ts` | 288 | `FakePaymentProvider`, `IyzicoPaymentProvider` stub, webhook HMAC verification & DB state transition, auto-refund helper. |
| `backend/src/common/errors.ts` | 180 | `AppError` and global error handler mapping Zod + PostgreSQL SQLSTATE codes (`42501`, `P0002`, `23514`, `23505`, etc.). |
| `backend/src/modules/pricing/pricing.service.ts` | 153 | `PricingEngine.calculate` pure helper (only tested in unit tests; **not used** by `/api/v1/orders/quote` in `main.ts`, which duplicates pricing logic inline!). |
| `backend/src/modules/print/thermal-ticket.service.ts` | 128 | Custom CP857 mapper + Turkish ESC/POS kitchen ticket generator. |
| `backend/src/common/security.ts` | 110 | In-memory `RateLimiter` + bearer auth helpers + language negotiation. |
| `backend/src/config/env.ts` | 95 | Zod env schema + dev default checks in `production`. |
| `backend/src/jobs/background-jobs.service.ts` | 87 | 3 static SQL job methods (`expireUnpaidCardOrders`, `checkUnacceptedOrdersAlert`, `cleanupExpiredAuthRecords`) — **never scheduled or wired to BullMQ**. |
| `backend/src/db/index.ts` | 75 | `postgres` pools (`apiClient`, `readonlyClient`) + `withRlsTx` transaction helper. Raw clients are imported directly by `main.ts` outside repositories. |
| `backend/src/modules/realtime/realtime.service.ts` | 65 | In-memory `RealtimeBroker` (`history[]`, `clients` `Set`) for SSE fan-out. |
| `backend/src/modules/orders/order-state-machine.ts` | 36 | `OrderStateMachine` transition map (only unit-tested; **not called** by `main.ts`, which relies solely on the DB trigger). |

---

## 6. In-Process Memory State Inventory (Breaks on Restart / Multi-Instance)

1. **`rateLimiter` (`backend/src/common/security.ts`):** `store = new Map<string, WindowEntry>()` and `smsCircuitTrippedUntil` timestamp. Lost on restart; ineffective across multiple instances.
2. **`menuCache` (`backend/src/main.ts` line 76):** `new Map<string, { expiresAt: number; data: unknown }>()` with 60s TTL. Cache invalidation (`invalidateMenuCache()`) only clears the local process map.
3. **`realtimeBroker` (`backend/src/modules/realtime/realtime.service.ts`):** `nextEventId` counter, `history` array (max 200), and `clients` `Set<ServerResponse>`. Events & `Last-Event-ID` replay are lost on restart and never cross process boundaries.
4. **`revokedPrintTokenJtis` (`backend/src/modules/auth/auth.service.ts` line 63):** `new Set<string>()`. Revoked print-agent tokens become valid again immediately after a server restart!
5. **`BackgroundJobsService` (`backend/src/jobs/background-jobs.service.ts`):** Not scheduled at all in `main.ts`; no Redis/BullMQ queue or worker exists.
6. **`ConsoleSmsProvider.lastSentCodeByPhone` (`auth.service.ts` line 16):** In-memory `Map` (acceptable only as a test fake, never in production).
7. **Idempotency & OTP state:** `otp_codes.attempts` and `orders.idempotency_key` are persisted in PostgreSQL, **not** in process memory, though HTTP `Idempotency-Key` replay currently exists only on `POST /api/v1/orders` via `create_order` and not as a shared Redis/port idempotency guard.

