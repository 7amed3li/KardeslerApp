# التقرير الفني الشامل لمشروع **Kardeşler Cihangir Ordering System**

> **تاريخ التقرير:** 2026-11-11  
> **النطاق:** توثيق تفصيلي كامل لكل ما تم تنفيذه والتحقق منه فعلياً في قاعدة البيانات (`PostgreSQL 16 + PostGIS`), الخادم الخلفي (`backend/`), طبقة `Redis 7 + BullMQ`, وكيل الطباعة الحرارية (`print-agent/`), جميع الـ **66 Endpoint** بالتفصيل، والاختبارات والملفات المتبقية قبل الإطلاق.

---

## 1. النظرة المعمارية العامة وترتيب المستودع (`Monorepo`)

المشروع مُنظّم كـ **pnpm workspace monorepo** يضم الحزم والملفات التالية:

| المسار | الدور والحالة الحالية |
|---|---|
| `database/` | 9 ملفات SQL migrations (`001`–`009`) + حزمتا اختبارات (`tests_phase0.sql` و`tests.sql`). |
| `packages/shared/` | الثوابت المشتركة والـ types والأنماط (`ORDER_STATUSES`, `PAYMENT_METHODS`, `SUPPORTED_LANGUAGES`, `PHONE_E164_REGEX`, `VALID_ALLERGENS`). |
| `backend/` | **Node.js 20/22 + TypeScript Strict + Fastify 5 + Drizzle ORM + Zod + Pino + Jose + BullMQ + ioredis** (منفذ ومختبر بـ **66 Endpoint**). |
| `print-agent/` | خدمة محلية بالمطعم تطبع تذاكر المطبخ بالعربية/التركية فقط عبر **ESC/POS** بترميز **CP857** لطابعة **SUNLUX RP8020**. |
| `admin/` | مشروع React + Vite (البناء والإنتاج والتحقق من الأنواع ناجحان؛ شاشات لوحة التحكم نفسها لم تُبنَ بعد). |
| `mobile/` | مشروع Expo / React Native (التحقق من الأنواع ناجح؛ الشاشات لم تُبنَ بعد). |
| `docs/` | تقارير الأساس (`baseline.md`), جرد المسارات (`api-inventory.md`), التوثيق التلقائي (`api.md`), مصفوفة الاختبارات (`test-matrix.md`), الفرضيات (`assumptions.md`), والمخطط (`database_schema.md`). |

### هيكل Clean Architecture داخل `backend/src/`

تخضع التبعيات لقواعد صارمة مفروضة تلقائياً عبر [.dependency-cruiser.cjs](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/.dependency-cruiser.cjs) و[eslint.config.mjs](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/eslint.config.mjs) (`max-lines: 400` للملف، `max-lines-per-function: 60` للدالة، `main.ts <= 80` سطر):

1. `backend/src/domain/` — **قواعد البزنس الصافية 100%** (لا تستورد Fastify أو Drizzle أو Postgres أو ioredis أو `process.env` أو `node:crypto`):
   - `pricing/pricing.domain.ts`, `coupons/coupon.domain.ts`, `orders/order-state-machine.ts`, `loyalty/loyalty.domain.ts`, `payments/payment.domain.ts`, `delivery/delivery.domain.ts`, `print/thermal-ticket.domain.ts`, `errors.ts`.
2. `backend/src/ports/` — **واجهات التجريد (Interfaces/Ports)**:
   - `repositories.ts`, `providers.ts`, `state.ts`, `clock.ts`.
3. `backend/src/application/` — **حالات الاستخدام وتنسيق العمليات (Use Cases & Policies)**:
   - `auth/`, `users/`, `menu/`, `orders/`, `payments/`, `loyalty/`, `print/`, `admin/`, `jobs/`, `policies/authorization.policy.ts`.
4. `backend/src/http/` — **طبقة الـ HTTP والتحقق من الطلبات (بدون منطق بزنس)**:
   - `server.ts`, `auth-hooks.ts`, `error-mapper.ts`, `schemas/api.schemas.ts` (كل Schemas بـ `.strict()` لرفض أي حقول زائدة), و8 ملفات في `routes/`.
5. `backend/src/infrastructure/` — **تطبيقات البنية التحتية والتكاملات**:
   - `db/` (`client.ts`, `schema-core.ts`, `schema-menu.ts`, `schema-orders.ts`, `schema.ts`, `health.adapter.ts`)
   - `repositories/` (8 ملفات تنفيذ عبر `withTx`)
   - `redis/` (`redis-client.ts`, `redis-rate-limiter.ts`, `redis-cache-and-tokens.ts`, `redis-event-bus.ts`, `in-memory-adapters.ts`)
   - `jobs/` (`bullmq.adapter.ts`)
   - `security/` (`jose-token.service.ts`, `crypto.adapter.ts`)
   - `providers/` (`payment.providers.ts`, `sms.providers.ts`, `push.providers.ts`, `system-clock.ts`)
6. `backend/src/composition-root.ts` و `backend/src/main.ts` (`25` سطراً فقط).

---

## 2. قاعدة البيانات (`PostgreSQL 16 + PostGIS`): الأدوار، الهجرات، كل الجداول والـ Triggers

### أ. تسلسل ملفات Migration (`001` إلى `009`) وأدوار التنفيذ

| الملف | الدور المنفِّذ | المحتوى الأساسي |
|---|---|---|
| `001_extensions_and_roles.sql` | `postgres` (superuser) | تفعيل `pgcrypto`, `citext`, `postgis`؛ إنشاء الأدوار `app_migrator`, `app_definer`, `app_api`, `app_readonly` وسحب صلاحيات `PUBLIC`. |
| `002_core.sql` | `app_migrator` | إعدادات المطعم، طاقم العمل، المستخدمون، الـ OTP، جلسات التحديث، الأجهزة، العناوين، الموافقات (`consents`), مناطق التوصيل، السائقون، سجل التدقيق (`audit_logs`)، ودالة `anonymize_user`. |
| `003_menu.sql` | `app_migrator` | الفئات، المنتجات، الوسوم، مجموعات الخيارات والخيارات، جداول الترجمة (`tr`, `en`, `ar`)، سجل تاريخ الأسعار، استيراد المنيو المجمع `menu_import_staging`، وتريجر إجبارية الترجمة التركية. |
| `004_orders.sql` | `app_migrator` | عداد الطلبات اليومي (قطع اليوم عند `06:00 Europe/Istanbul`)، الطلبات، عناصر الطلب وخياراتها، أحداث الطلب، المدفوعات، عمليات الطباعة. |
| `005_promotions.sql` | `app_migrator` | الكوبونات، استرداد الكوبون، الإحالات، دفتر الولاء + `loyalty_balances` view، البنرات، التقييمات، الإشعارات، دالة `redeem_coupon`. |
| `006_security_rls.sql` | `app_migrator` | تفعيل `ENABLE + FORCE ROW LEVEL SECURITY` على الجداول الحساسة وصلاحيات `app_api` و`app_readonly`. |
| `007_seed.sql` | `app_migrator` | بيانات تجريبية/مبدئية (`PLACEHOLDER`) تشمل المنيو والمناطق وكوبون `HOSGELDIN` — **محمية بحارس يمنع تنفيذها إذا كان `app.node_env = 'production'`**. |
| `008_hardening.sql` | `postgres` | تقوية `SECURITY DEFINER` (`app_definer` + `SET search_path = public, pg_catalog, pg_temp`), منع `TRUNCATE` على الجداول الإلحاقية، تطهير الحقول الحساسة من `audit_logs`, جدول `fraud_flags`, `heartbeats`, ودالة `auth_get_staff_by_email`. |
| `009_order_flow.sql` | `postgres` | دعم حالة `awaiting_payment` للبطاقة الأونلاين وإخفاؤها عن المطبخ (`staff`), `payment_events`, `refunds`, الدالة المحصنة `create_order(...)`، وتريجرات تطابق الرياضيات (`subtotal_kurus`, `line_total_kurus`) ومنع `INSERT` المباشر من العميل. |

### ب. أدوار التشغيل وسياق `withTx` (`SET LOCAL`)

- **`app_api`**: دور التطبيق الرئيسي؛ ليس superuser، لا يملك `BYPASSRLS`، لا يملك أي جدول. يُعزَل عبر [client.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/src/infrastructure/db/client.ts) الذي ينفذ في بداية كل معاملة:
  `set_config('app.current_role' / 'app.current_user_id' / 'app.current_staff_id' / 'app.current_actor_type' / 'app.current_actor_id', ..., true)` (**`SET LOCAL`** حتى لا يتسرب السياق بين الطلبات على نفس الـ Connection Pool)، مع `statement_timeout: 30000`, `lock_timeout: 5000`, `idle_in_transaction_session_timeout: 60000`.
- **`app_readonly`**: pool مستقل مخصص للقراءات العامة والتقارير (`statement_timeout: 15000`), ممنوع تماماً من الجداول الحساسة (`staff_users`, `users`, `otp_codes`, `refresh_tokens`, `audit_logs`, `consents`, `payments`, `addresses`) وممنوع من تنفيذ الدوال الإجرائية.
- يرفض السيرفر الإقلاع عبر `verifyDbSecurityPosture()` إذا اتصل كـ `postgres` أو أي دور غير `app_api`/`app_readonly`.

### ج. جميع الجداول والـ Views في قاعدة البيانات (44 جدول عمل + `spatial_ref_sys` + `loyalty_balances`)

#### 1) المجموعة الأساسية والأمان والمراقبة (13 جدولاً)
1. **`restaurant_settings`** (صف وحيد `id = 1`): اسم المطعم، الهاتف، العنوان، حالة القبول `is_accepting_orders`, ساعات العمل `opening_hours` (jsonb), ساعة قطع يوم العمل `business_day_cutoff` (`06:00:00`), `min_app_version`, `currency` (`TRY`), `cod_max_amount_kurus` (`150000`), `cod_max_open_orders` (`1`), `payment_timeout_minutes` (`15`), `unaccepted_order_alert_minutes` (`5`), `heartbeat_grace_seconds` (`120`).
   - *الحماية والـ Triggers:* تمنع `trg_restaurant_settings_prevent_delete` الحذف؛ وتُسجل `trg_audit_restaurant_settings` التعديلات؛ وتُحدّث `trg_restaurant_settings_updated_at` التاريخ.
2. **`staff_users`**: `id`, `email` (`citext UNIQUE`), `password_hash` (Argon2id), `role` (`owner` | `staff`), `totp_secret_encrypted` (AES-256-GCM مشفر), `totp_enabled`, `is_active`, `last_login_at`.
   - *الحماية:* مخفية تماماً عن العملاء بـ RLS؛ يُستعلم عنها للمصادقة عبر دالة `auth_get_staff_by_email` (`SECURITY DEFINER`)؛ ويُسجل تعديلها في `audit_logs` مع **حذف تلقائي (`redaction`)** لحقول `password_hash` و`totp_secret_encrypted`.
3. **`users`**: `id`, `phone` (E.164 فريد أثناء `deleted_at IS NULL`), `name`, `email`, `preferred_language` (`tr`/`en`/`ar`), `referral_code` (فريد), `is_blocked`, `deleted_at` (للتجهيل KVKK).
4. **`otp_codes`**: `id`, `phone`, `code_hash` (HMAC-SHA256), `salt`, `attempts` (الحد الأقصى 5), `expires_at`, `consumed_at`, `ip`.
5. **`refresh_tokens`**: `id`, `user_id` (FK->users), `token_hash` (SHA-256), `family_id` (لاكتشاف إعادة الاستخدام Reuse Detection وحرق العائلة كلها), `expires_at`, `revoked_at`, `replaced_by_id`, `device_info`.
6. **`devices`**: `id`, `user_id` (FK->users), `push_token` (UNIQUE), `platform` (`ios`/`android`), `app_version`, `last_seen_at`.
7. **`addresses`**: `id`, `user_id` (FK->users), `label`, `full_address`, `location` (`geography(Point, 4326)` مع فهرس `GIST`), `building`, `floor`, `apartment`, `notes`, `deleted_at`.
8. **`consents`** (**Append-Only**): `id`, `user_id`, `type` (`terms`, `privacy`, `marketing_sms`, `marketing_push`, `marketing_email`), `granted`, `source`, `version`, `ip`, `created_at`. تمنع الصلاحيات والتريجر `UPDATE`/`DELETE`.
9. **`delivery_zones`**: `id`, `name`, `area` (`geography(Polygon, 4326)` مع فهرس `GIST`), `min_order_kurus`, `delivery_fee_kurus` (`0` = التوصيل مجاني دائماً), `estimated_minutes`, `is_active`.
10. **`drivers`**: `id`, `name`, `phone`, `is_active`.
11. **`audit_logs`** (**Append-Only + No Truncate**): `id`, `actor_type`, `actor_id`, `action`, `table_name`, `record_id`, `old_data` (jsonb), `new_data` (jsonb), `created_at`. يمر عبر `fn_audit_log_trigger` التي تضبط `search_path` وتطهر أسرار كلمات المرور والـ TOTP والرموز، وتمنع `trg_audit_logs_prevent_mutation` و`trg_audit_logs_prevent_truncate` أي تعديل أو حذف أو مسح.
12. **`fraud_flags`**: `id`, `user_id`, `order_id`, `flag_type` (`payment_amount_mismatch`, `otp_abuse`, `cod_abuse`, `webhook_replay`), `severity`, `details` (jsonb), `resolved_at`, `resolved_by`.
13. **`heartbeats`**: `device_id` (PK), `kind` (`print_agent` | `staff_tablet`), `last_seen_at`, `meta` (jsonb). تُستخدم لحساب `orderingAvailable` (Kill-Switch التلقائي).

#### 2) مجموعة المنيو والترجمات والأسعار (13 جدولاً)
14. **`categories`** + 15. **`category_translations`** (`tr`/`en`/`ar`): تصنيفات المنيو بـ `sort_order`, `is_active`.
16. **`menu_items`** + 17. **`menu_item_translations`**: `category_id` (RESTRICT), `price_kurus` (`>=0`), `vat_rate_percent`, `image_url`, `allergens` (`text[]` مُتحقق عبر `fn_validate_allergens`), `is_available`, `sort_order`, `deleted_at`.
18. **`tags`** + 19. **`tag_translations`** + 20. **`menu_item_tags`**: وسوم مثل `Baharatlı`, `Yeni` إلخ.
21. **`option_groups`** + 22. **`option_group_translations`**: `menu_item_id`, `min_select`, `max_select`, `is_required`, `is_active`.
23. **`options`** + 24. **`option_translations`**: `option_group_id`, `price_delta_kurus`, `is_available`, `sort_order`.
    - *تريجرات المنيو:* **8 constraint triggers** (`trg_deferred_check_*_tr` و`*_tr_del`) تفرض إجبارياً وجود ترجمة تركية `tr` غير فارغة عند إنشاء أي كيان منيو وتمنع حذف صف الـ `tr` الطفل.
25. **`price_history`** (**Append-Only + No Truncate**): يسجل أوتوماتيكياً عبر `trg_menu_items_price_history` أي تغيير في `price_kurus`.
26. **`menu_import_staging`**: جدول مرحلي للاستيراد المجمع للـ Excel/CSV وتعالجه دالة `fn_process_menu_import_staging()`.

#### 3) مجموعة الطلبات والمدفوعات والطباعة (9 جداول)
27. **`daily_order_counters`**: (`business_date` PK, `last_number`), تُولد رقم الطلب التسلسلي اليومي (`next_order_number`) مع قطع اليوم الساعة `06:00` صباحاً بتوقيت إسطنبول عبر `business_date_of`.
28. **`orders`**: قلب النظام:
    - المعرفات والعميل: `id`, `user_id` (`ON DELETE SET NULL` للاحتفاظ الضريبي), `delivery_zone_id`, `driver_id`, `order_number`, `business_date`, `idempotency_key` (`UNIQUE` لكل مستخدم أو مفتاح).
    - النوع والحالة: `order_type` (`delivery`/`pickup`), `status` (`awaiting_payment`, `new`, `accepted`, `on_the_way`, `delivered`, `cancelled`, `rejected`), `payment_method` (`card_online`/`cash_on_delivery`).
    - الماليات الثابتة بالقروش: `subtotal_kurus`, `discount_kurus`, `delivery_fee_kurus`, `total_kurus` (`= subtotal - discount + delivery_fee`), `min_order_kurus_applied` (بشرط `total_kurus >= min_order_kurus_applied`).
    - اللقطات التاريخية: `customer_name_snapshot`, `customer_phone_snapshot`, `address_snapshot` (jsonb), `customer_note`, `cancel_reason`, الطوابع `accepted_at`, `delivered_at`, `cancelled_at`.
    - *الحماية والتريجرات على `orders`:*
      - لا يمكن للعميل عمل `INSERT` مباشر (فقط عبر دالة `create_order` `SECURITY DEFINER`).
      - `trg_orders_enforce_defaults`: تصحح القيم الافتراضية وتمنع العميل من تزوير الحالة أو الرقم أو التاريخ.
      - `trg_orders_lifecycle_and_immutability`: تمنع تعديل الأعمدة المالية واللقطات بعد الإنشاء، وتفرض مخطط الانتقالات (`awaiting_payment -> new|cancelled`, `new -> accepted|rejected|cancelled`, `accepted -> on_the_way|cancelled`, `on_the_way -> delivered|cancelled`)، وتُنشئ أوتوماتيكياً صف `print_jobs` من نوع `kitchen_ticket` عند الانتقال `new -> accepted`، وتستعيد `coupons.used_count` عند الإلغاء/الرفض، وتسجل الحدث في `order_events`.
      - `trg_deferred_order_subtotal_integrity`: تتأكد عند نهاية المعاملة أن `orders.subtotal_kurus = SUM(order_items.line_total_kurus)` وبوجود عنصر واحد على الأقل.
29. **`order_items`** + 30. **`order_item_options`** (جداول **غير قابلة للتعديل بعد الإنشاء `Immutable`**): تحفظ `name_snapshot`, `unit_price_snapshot_kurus`, `vat_rate_snapshot`, `quantity`, `line_total_kurus` وخياراته، مع تريجر `trg_deferred_order_item_line_math` للتحقق من المعادلة الحسابية.
31. **`order_events`** (**Append-Only + No Truncate**): يسجل كل تغيير في الحالة (`from_status`, `to_status`, `actor_type`, `actor_id`, `note`).
32. **`payments`**: `order_id`, `method`, `status` (`pending`/`paid`/`failed`/`refunded`), `amount_kurus`, `provider`, `provider_ref` (unique partial index).
33. **`payment_events`** (**Append-Only + No Truncate**): `provider`, `provider_event_id` (`UNIQUE`), `order_id`, `raw_payload`, `processed_at` — لمنع تكرار معالجة نفس Webhook.
34. **`refunds`**: `order_id`, `payment_id`, `amount_kurus`, `reason`, `status`, `provider_refund_ref`, `initiated_by`.
35. **`print_jobs`**: `order_id`, `kind` (`kitchen_ticket`/`reprint`), `status` (`pending`/`printing`/`printed`/`failed`), `attempts`, `last_error`, `printed_at`.

#### 4) مجموعة العروض والولاء والتقييمات والإشعارات (9 جداول + 1 View)
36. **`coupons`** + 37. **`coupon_categories`** + 38. **`coupon_menu_items`**: أكواد الخصم (`percent`, `fixed_amount`, `free_item`), `min_order_kurus`, `max_discount_kurus`, `max_total_uses`, `used_count`, `max_uses_per_user`, `first_order_only`, `applies_to` (`all`/`categories`/`items`), `active_hours`.
39. **`coupon_redemptions`**: قيد `UNIQUE(order_id)` لضمان **كوبون واحد فقط لكل طلب**، وتدار حصرياً ذرياً عبر `redeem_coupon(...)` (`SELECT ... FOR UPDATE`).
40. **`referrals`**: `referrer_user_id`, `referred_user_id` (`UNIQUE`), `status` (`pending`/`rewarded`), `order_id`, `rewarded_at`.
41. **`loyalty_ledger`** (**Append-Only + No Truncate**) + View **`loyalty_balances`**: سجل النقاط (+ أو -)، وتجميع الرصيد في View متاحة للقراءة.
42. **`banners`**: عروض الواجهة الترويجية بصور وروابط وعناوين متعددة اللغات ونطاق زمني (`starts_at`..`ends_at`).
43. **`reviews`**: تقييم `1..5` وتعليق على الطلب، محمي بتريجر `trg_reviews_delivered_only` لمنع التقييم إلا للطلبات بحالة `delivered`.
44. **`notifications`**: سجل إشعارات الدفع (`device_id`, `title`, `body`, `status` `pending`/`sent`/`failed`, `retry_count`).

---

## 3. الدوال المخصصة في PostgreSQL (27 دالة)

- **دوال `SECURITY DEFINER` (مملوكة لـ `app_definer` ومضبوطة `search_path`):**
  1. `create_order(p_order_type, p_payment_method, p_idempotency_key, p_items, p_address_id, p_address_snapshot, p_coupon_code, p_customer_note)` — تحسب الأسعار والخيارات وتفحص الكوبون (على الـ subtotal) ومنطقة التوصيل والحد الأدنى (بعد الخصم) وحدود COD وتنشئ الطلب وعناصره وخياراته والمدفوعات المبدئية ذرياً.
  2. `redeem_coupon(p_coupon_id, p_user_id, p_order_id, p_discount_kurus)` — قفل صف الكوبون `FOR UPDATE` وزيادة `used_count`.
  3. `find_delivery_zone(p_lat, p_lng)` — فحص `ST_Covers` بـ PostGIS.
  4. `anonymize_user(p_user_id)` — تنفيذ محو الهوية (KVKK/GDPR) وحذف `devices`, `addresses`, `refresh_tokens`, `otp_codes` وتجهيل لقطات الطلبات مع الاحتفاظ بالسجل المالي وتسجيل سحب الموافقة.
  5. `auth_get_staff_by_email(p_email)` — جلب بيانات الموظف وقت تسجيل الدخول فقط.
  6. دوال التريجرات المحمية (`fn_audit_log_trigger`, `fn_orders_enforce_defaults`, `fn_order_status_and_immutability_trigger`, `fn_order_created_event`, `fn_enforce_order_item_immutability`, `fn_enforce_order_item_options_immutability`, `fn_enforce_order_item_line_math`, `fn_enforce_order_subtotal_matches_items`, `fn_record_price_history`).
- **دوال `INVOKER` المساعدة:**
  - `app_current_role()`, `app_user_id()`, `app_is_staff()`, `app_is_owner_or_system()`, `business_date_of(timestamptz)` (قطع `06:00` إسطنبول), `next_order_number(date)`, `fn_set_updated_at()`, `fn_prevent_mutation()`, `fn_prevent_settings_delete()`, `fn_enforce_turkish_translation()`, `fn_enforce_review_only_delivered()`, `fn_validate_allergens(text[])`, `fn_process_menu_import_staging()`.

---

## 4. الدليل التفصيلي لجميع الـ 66 Endpoint (المسارات، المصادقة، البزنس، والداتابيز)

> كل الـ Schemas تستخدم `.strict()` لرفض أي حقل غير معروف (`400 VALIDATION_ERROR`)، والحد الأقصى لحجم الطلب `100 KB` (`413`)، وكل الأخطاء موحدة في شكل `{ error: { code, message, requestId } }` بدون كشف أي تفاصيل SQL أو Stack Trace.

### أ. الصحة والوثائق (`src/http/routes/health.routes.ts` — 4 مسارات)
1. `GET /health` (`public`) — فحص حياة سريع يرجع `{ status: 'ok', service, timestamp }`.
2. `GET /healthz` (`public`) — Liveness probe لـ Docker/Kubernetes.
3. `GET /readyz` (`public`) — Readiness probe ينفذ `PostgresHealthAdapter.verifyPosture()` ويثبت أن `api = app_api` و`readonly = app_readonly` (لا superuser، لا `BYPASSRLS`, `0` owned tables)؛ يرجع `200` أو `503`.
4. `GET /docs` (`public`, ومخفي بـ `404` في `NODE_ENV=production`) — يُرجع مواصفات OpenAPI 3.1 الحية من `@fastify/swagger`.

### ب. المصادقة ورموز الطباعة (`src/http/routes/auth.routes.ts` — 9 مسارات)
5. `POST /api/v1/auth/customer/otp/request` (`public`) — Schema: `{ phone }` (E.164 تركي +90 حصراً).
   - *البزنس وRedis/DB:* يفحص `RedisRateLimiter.checkSmsCircuitBreaker(50)` (يسقط بـ `503` fail-closed إذا تعطل Redis، أو `429` إذا فُتحت الدائرة)، وحد الـ IP (`10 / 15m`) وحد الرقم (`5 / 24h`)؛ يولد كود 6 أرقام + HMAC-SHA256 في `otp_codes` لمدة 5 دقائق ويرسل عبر `SmsProvider`.
6. `POST /api/v1/auth/customer/otp/verify` (`public`) — Schema: `{ phone, code }`.
   - *البزنس/DB:* يفحص rate limit IP، يطابق `otp_codes` بـ `timingSafeEqual` (أقصى 5 محاولات)، **ينشئ المستخدم في `users` تلقائياً لو جديداً بكود `KC...`**، يحفظ `refresh_tokens` بـ `family_id`، ويرجع `accessToken` (`jose HS256`, `aud: kardesler-customer`) + `refreshToken` + بيانات العميل. (يرفض بـ `403` لو `is_blocked`).
7. `POST /api/v1/auth/customer/refresh` (`public`) — Schema: `{ refreshToken }`.
   - *البزنس/DB:* تدوير ذري لـ `refresh_tokens`؛ لو تم استخدام توكن مسحوب مسبقاً (**Reuse Detection**) يلغي العائلة كلها (`family_id`) ويرجع `401`.
8. `POST /api/v1/auth/customer/logout` (`customer JWT`) — Schema اختياري `{ refreshToken? }`؛ يلغي توكن التحديث الخاص بالمستخدم في `refresh_tokens`.
9. `POST /api/v1/auth/staff/login` (`public`) — Schema: `{ email, password, totpCode? }`.
   - *البزنس/DB:* Rate limit (`5 / 15m`)، يستعلم عبر `auth_get_staff_by_email`، يتحقق من كلمة المرور بـ `argon2.verify`. لو TOTP غير مفعل يرجع `{ totpSetupRequired: true, setupToken }` (`aud: kardesler-staff-totp-setup`)؛ لو مفعل يفرض تحقق الـ 6 أرقام من TOTP المشفر في `staff_users.totp_secret_encrypted` ويرجع `accessToken` (`aud: kardesler-staff`, `role: staff|owner`).
10. `POST /api/v1/auth/staff/totp/setup` (`totp_setup JWT`) — يولد سر TOTP جديد و`otpauthUrl`.
11. `POST /api/v1/auth/staff/totp/verify-setup` (`totp_setup JWT`) — يتحقق من الكود، يشفر السر بـ AES-256-GCM ويُفعّل `totp_enabled = true` في `staff_users` ثم يصدر الـ `accessToken`.
12. `POST /api/v1/print-agent/token` (`owner JWT`) — Schema: `{ deviceId }`. يصدر JWT طويل الأمد بـ `jti` (`UUID`) و`aud: kardesler-print-agent`.
13. `POST /api/v1/print-agent/token/revoke` (`owner JWT`) — Schema: `{ jti }`. يضيف الـ `jti` لقائمة السحب في Redis (`RedisRevokedTokenStore`) بمدة TTL؛ يتم رفضه بـ `401` فوراً عند أي نداء لاحق.

### ج. حساب العميل والأجهزة والإحالات والعناوين (`src/http/routes/users.routes.ts` — 8 مسارات)
14. `DELETE /api/v1/users/me` (`customer JWT`) — يستدعي دالة DB `anonymize_user(userId)` (حذف `devices`, `addresses`, `refresh_tokens`, `otp_codes`، وتجهيل الاسم والهاتف مع إبقاء سجل الطلبات المالي، وتسجيل سحب موافقة KVKK في `consents`).
15. `PATCH /api/v1/users/me` (`customer JWT`) — Schema: `{ name?, email?, preferredLanguage? }`؛ تحديث مباشر في `users` تحت RLS.
16. `POST /api/v1/devices` (`customer JWT`) — Schema: `{ pushToken, platform, appVersion }`؛ Upsert في `devices` على `push_token`.
17. `GET /api/v1/referrals/me` (`customer JWT`) — يرجع `referralCode` للعميل وقائمة إحالاته من `referrals`.
18. `GET /api/v1/addresses` (`customer JWT`) — جلب عناوين العميل (`deleted_at IS NULL`) مع `lat/lng` مستخرجة من PostGIS `ST_Y`/`ST_X`.
19. `POST /api/v1/addresses` (`customer JWT`) — إنشاء عنوان في `addresses` بتحويل `(lng, lat)` إلى `geography(Point, 4326)`.
20. `PATCH /api/v1/addresses/:id` (`customer JWT`) — تعديل عنوان العميل تحت RLS (أي محاولة لعميل آخر ترجع `404`).
21. `DELETE /api/v1/addresses/:id` (`customer JWT`) — حذف عنوان العميل من `addresses` عبر سياسة `pol_addresses_customer_delete` (`404` لغير صاحبه).

### د. المنيو العام والبنرات والتغطية وإدارة المنيو (`src/http/routes/menu.routes.ts` — 9 مسارات)
22. `GET /api/v1/menu` (`public`, يدعم `Accept-Language` / `?lang=tr|en|ar`) — يقرأ من `RedisCacheAdapter` (`menu:<lang>`, TTL 60s) أو يجمع الفئات والمنتجات والترجمات والخيارات والوسوم عبر `app_readonly`.
23. `GET /api/v1/banners` (`public`) — يرجع البنرات النشطة في نافذة الزمن الحالية من `banners`.
24. `GET /api/v1/settings/public` (`public`) — يرجع إعدادات المطعم العامة + حالة القبول الفعلي `orderingAvailable` التي تحسب Kill-Switch من `heartbeats` الأخيرة ومهلة `heartbeat_grace_seconds`.
25. `POST /api/v1/delivery/check` (`public`) — Schema: `{ lat, lng }`؛ يستدعي `find_delivery_zone(lat, lng)` (PostGIS `ST_Covers`) و`DeliveryDomain.evaluateCoverage` لإرجاع `{ covered, zone }`.
26. `PATCH /api/v1/admin/menu/items/:id` (`owner JWT`) — تحديث السعر/التوافر/مسببات الحساسية في `menu_items` (يفعّل `price_history` + `audit_logs`) ويمسح كاش المنيو بـ prefix `menu:`.
27. `POST /api/v1/admin/menu/items` (`owner JWT`) — إنشاء منتج في `menu_items` + ترجماته (`tr` إلزامي) في `menu_item_translations` ويمسح الكاش.
28. `DELETE /api/v1/admin/menu/items/:id` (`owner JWT`) — حذف ناعم (`deleted_at = clock_timestamp(), is_available = false`) في `menu_items` (احتراماً لفواتير `order_items` السابقة) ويمسح الكاش.
29. `POST /api/v1/admin/menu/categories` (`owner JWT`) — إنشاء فئة في `categories` + ترجماتها ويمسح الكاش.
30. `PATCH /api/v1/admin/menu/categories/:id` (`owner JWT`) — تعديل ترتيب/تفعيل/ترجمات الفئة ويمسح الكاش.

### هـ. التسعير والطلبات والمدفوعات (`src/http/routes/orders.routes.ts` — 8 مسارات)
31. `POST /api/v1/orders/quote` (`public`) و32. `POST /api/v1/cart/price` (`public`) — Schema: `{ items, order_type, coupon_code?, lat?, lng? }`. يحسب الأسعار كلياً في السيرفر بالقروش via `PricingDomain.calculateQuote` + تحقق منطقة التوصيل + معاينة الكوبون والحد الأدنى بعد الخصم (بدون إنشاء طلب).
33. `POST /api/v1/orders` (`customer JWT`) — يدعم `idempotency-key` في الهيدر أو الجسم. يفحص rate limit (`20 / 5m`) ثم يستدعي دالة DB المحصنة `create_order(...)` (تكرار نفس الـ `idempotency_key` يرجع نفس الطلب بأمان):
    - لطلبات **`card_online`**: يبدأ الطلب في حالة `awaiting_payment` (مخفي عن `staff`) ويرجع `paymentCheckout`.
    - لطلبات **`cash_on_delivery`**: يبدأ في `new` وينشر حدث `order.created` في `RedisEventBus`.
34. `GET /api/v1/orders` (`customer JWT`) — قائمة طلبات العميل (RLS يفرض `user_id = app_user_id()`).
35. `GET /api/v1/orders/:id` (`customer JWT`) — تفاصيل الطلب + `order_items` + `order_events` (`404` لطلبات الغير).
36. `POST /api/v1/orders/:id/cancel` (`customer JWT`) — يأخذ Row Lock `FOR UPDATE`؛ يسمح بالإلغاء في `awaiting_payment` أو `new` فقط (أي حالة لاحقة مثل `accepted` ترجع `409 INVALID_STATE_TRANSITION`). لو مدفوع أونلاين ينفذ Refund عبر `PaymentProvider` ويسجل في `refunds`.
37. `POST /api/v1/orders/:id/reorder` (`customer JWT`) — يعاين عناصر الطلب القديم مقابل `menu_items` الحالية (`availableItems`, `unavailableItems`, `priceChanges`, `newSubtotalKurus`).
38. `POST /api/v1/payments/webhook` (`HMAC-SHA256` verification in body + `timingSafeEqual`) — يتحقق من التوقيع؛ يمنع التكرار عبر `payment_events.provider_event_id` (`idempotentReplay: true`)؛ ولو اختلف المبلغ عن `orders.total_kurus` يسجل `fraud_flags` (`payment_amount_mismatch`) ويرد `422`؛ ولو سليم يحدث `payments = 'paid'` وينقل الطلب `awaiting_payment -> new` وينشر `order.created` للمطبخ.

### و. عمليات المطبخ والطباعة والزمن الحقيقي (`src/http/routes/staff.routes.ts` — 10 مسارات)
39. `GET /api/v1/staff/orders` (`staff` / `owner JWT`) — يرجع الطلبات التشغيلية (`staff` لا يرى `awaiting_payment` بفضل سياسة RLS `pol_orders_staff_operational`).
40. `POST /api/v1/staff/orders/:id/status` و41. `PATCH /api/v1/orders/:id/status` (`staff` / `owner JWT`) — تحديث الحالة مع `FOR UPDATE` والتحقق عبر `OrderStateMachine` وتريجر DB:
    - عند `new -> accepted`: يُنشأ `print_jobs` (`kitchen_ticket`) أوتوماتيكياً في DB.
    - عند `cancelled` / `rejected`: يسترد مبلغ البطاقة المدفوعة عبر `refunds` + يسترجع `coupons.used_count`.
    - عند `delivered`: يمنح نقاط الولاء في `loyalty_ledger` (**1 نقطة لكل 100 قرش / 1 ليرة**) ويفعّل مكافأة الإحالة لو أول طلب (`100` للداعي + `50` للمدعو).
    - ينشر الحدث `order.status_changed` على SSE.
42. `POST /api/v1/staff/orders/:id/driver` (`staff` / `owner JWT`) — تعيين سائق (`driverId`) للطلب في `orders`.
43. `POST /api/v1/staff/orders/:id/reprint` (`staff` / `owner JWT`) — إنشاء `print_jobs` إضافي من نوع `reprint` (`201`).
44. `POST /api/v1/staff/settings/pause` (`staff` / `owner JWT`) — تشغيل/إيقاف استقبال الطلبات الفوري (`restaurant_settings.is_accepting_orders`).
45. `GET /api/v1/realtime/staff` (`staff` / `owner JWT`) — قناة **SSE** حية من `RedisEventBus` مع استئناف الأحداث الفائتة via `Last-Event-ID` (أو نمط JSON snapshot عبر هيدر `x-sse-mode: snapshot`)؛ يرجع `503` إذا كان Redis متوقفاً.
46. `GET /api/v1/print-agent/jobs/poll` (`print_agent JWT`) — يسجل نبضة `heartbeats` (`kind: print_agent`) ويجلب حتى `100` عملية `pending` من `print_jobs` مع تذكرة نصية بالتركية + payload طابعة `SUNLUX RP8020` المشفر `escPosBase64` (`CP857`).
47. `POST /api/v1/print-agent/jobs/:id/ack` (`print_agent JWT`) — تحديث حالة `print_jobs` (`printed` أو `failed` مع نص الخطأ وزيادة `attempts`).
48. `POST /api/v1/heartbeats` (`staff` / `owner JWT`) — تسجيل نبضة `staff_tablet` أو `print_agent` في `heartbeats`.

### ز. الولاء والتقييمات والموافقات (`src/http/routes/loyalty.routes.ts` — 3 مسارات)
49. `GET /api/v1/loyalty/me` (`customer JWT`) — رصيد النقاط من `loyalty_balances` + آخر حركات `loyalty_ledger`.
50. `POST /api/v1/reviews` (`customer JWT`) — إضافة تقييم (`1..5`)؛ يفشل بـ `422` لغير الطلبات بحالة `delivered` (محمي كذلك بتريجر DB `trg_reviews_delivered_only`).
51. `POST /api/v1/consents` (`customer JWT`) — تسجيل موافقة أو سحبها في `consents` (Append-Only).

### ح. لوحة المالك والتقارير والحوكمة (`src/http/routes/admin.routes.ts` — 15 مساراً، جميعها `owner JWT` فقط وترفض `staff` بـ `403`)
52. `GET /api/v1/admin/reports/daily-summary` — ملخص اليوم (بإمكانه تمرير `businessDate`) عبر `readonlyClient` (`app_readonly`): إجمالي الطلبات، المدفوعة، المُلغاة، المرفوضة، وصافي الإيرادات بالقروش.
53. `GET /api/v1/admin/audit-logs` — أحدث سجلات التدقيق من `audit_logs`.
54. `GET /api/v1/admin/coupons` / 55. `POST /api/v1/admin/coupons` / 56. `PATCH /api/v1/admin/coupons/:id` — عرض وإنشاء وتعديل الكوبونات.
57. `GET /api/v1/admin/zones` / 58. `PATCH /api/v1/admin/zones/:id` — عرض مناطق التوصيل وتحديث الحد الأدنى/المدة/التفعيل (مع فهرسة تدقيق في `audit_logs`).
59. `GET /api/v1/admin/drivers` / 60. `POST /api/v1/admin/drivers` — عرض وإضافة السائقين.
61. `GET /api/v1/admin/staff` — عرض قائمة طاقم العمل (بدون إرجاع أي `password_hash` أو `totp_secret`).
62. `GET /api/v1/admin/fraud-flags` / 63. `POST /api/v1/admin/fraud-flags/:id/resolve` — عرض وإغلاق إنذارات الاحتيال في `fraud_flags`.
64. `GET /api/v1/admin/banners` / 65. `POST /api/v1/admin/banners` — عرض وإضافة البنرات الترويجية في `banners`.
66. `PATCH /api/v1/admin/settings` — تعديل إعدادات المطعم العامة (`isAcceptingOrders`, `codMaxAmountKurus`, `codMaxOpenOrders`, `paymentTimeoutMinutes`, `heartbeatGraceSeconds`).

---

## 5. حالة Redis 7 و BullMQ و وكيل الطباعة (`print-agent`)

- **إدارة الحالة الموزعة في Redis (`backend/src/infrastructure/redis/`):**
  - تم القضاء على الحالة داخل ذاكرة العملية؛ جميع الحالات (محددات المعدل، كاش المنيو، قائمة سحب `jti` لطابعة المطبخ، قناة SSE + آخر 200 حدث، والمهام الخلفية) تعمل على Redis 7 عبر `ioredis` و`BullMQ`.
  - في حال توقف Redis، تفشل طلبات الـ OTP بوضع **Fail-Closed (`503 SERVICE_UNAVAILABLE`)** دون إرسال أي كود، وتُغلق طلبات SSE الجديدة بـ `503` مع بقاء عملية الخادم مستقرة (`GET /healthz -> 200`).
- **المهام المجدولة في BullMQ ([bullmq.adapter.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/src/infrastructure/jobs/bullmq.adapter.ts)):**
  1. إلغاء طلبات البطاقة المنتهية الصلاحية (`expireUnpaidCardOrders` كل دقيقة).
  2. تنبيه الطلبات التي تأخرت في القبول (`checkUnacceptedOrdersAlert` كل دقيقة).
  3. تسوية المدفوعات المعلقة للطلبات الملغاة (`reconcilePendingPayments` كل 5 دقائق).
  4. تنظيف رموز OTP والتحديث المنتهية (`cleanupExpiredAuthRecords` كل ساعة).
  5. إعادة محاولة إشعارات الدفع الفاشلة (`retryFailedNotifications` كل دقيقتين).
- **وكيل الطباعة ([print-agent/src/index.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/print-agent/src/index.ts)):**
  - `PrintAgentWorker` يسحب المهام دورياً عبر `GET /api/v1/print-agent/jobs/poll`، يحوّل الصيغة عبر `toTicketData` إلى `EscPosTicketFormatter` (CP857)، يمنع إعادة الطباعة عبر `printedJobIds` (`Set` بسقف 5000 عنصر)، ويرسل التأكيد `printed` أو `failed` إلى `POST /api/v1/print-agent/jobs/:id/ack`.

---

## 6. ملخص نتائج الاختبارات والتحقق المرصودة

- **قاعدة البيانات (`PostgreSQL 16.14 + PostGIS 3.4.2`, قاعدة نظيفة `001`–`009`):**
  - `database/tests_phase0.sql`: **7 / 7 PASS** (أدوار `app_readonly` و`app_api`, `RLS`, `create_order`, `anonymize_user`, `audit_logs`, deferred math, منع حذف `tr` الطفل واستيراد `105` منتجات).
  - `database/tests.sql`: **23 / 23 PASS**.
- **بوابة المستودع (`pnpm check` بعد آخر تعديل على الكود):**
  - **ESLint + TypeScript (`tsc --noEmit`) + Production Build (`pnpm build`)**: **PASS** على جميع الـ 5 حزم (`shared`, `backend`, `print-agent`, `admin`, `mobile`).
  - **Dependency-Cruiser (`arch`)**: `84 modules, 138 dependencies cruised`, **0 violations** (وتم إثبات الفشل المقصود عند أي كسر لطبقات `domain`, `application`, `http`).
  - **Backend Tests (`vitest run`)**: **13 / 13 ملفاً (57 / 57 اختباراً) PASS** — تشمل التغطية الحتمية للـ **66/66 endpoint** ([route-coverage.test.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/tests/route-coverage.test.ts) + [endpoint-matrix.test.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/tests/endpoint-matrix.test.ts)), سباقات الكوبون والإلغاء المتزامن ([concurrency.test.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/tests/concurrency.test.ts)), وتطابق `OrderStateMachine` مع تريجر PostgreSQL ([architecture.test.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/tests/architecture.test.ts)).
  - **Print-Agent Tests (`vitest run`)**: **2 / 2 ملف (3 / 3 اختبارات) PASS**.
  - **Coverage (`vitest run --coverage` لطبقتي `src/domain` و`src/application`)**: **98.72% Statements | 90.7% Branches | 99.03% Functions | 98.72% Lines** (تم رصده قبل آخر تعديل بسيط لسطر واحد في `http/error-mapper.ts` وتعديل `redis-client`/`redis-rate-limiter`/`redis-event-bus` التي تقع خارج نطاق coverage `domain/application`).
  - **Stryker Mutation Testing** (على `pricing.domain.ts` و`coupon.domain.ts`): **77.12% total (`77.99%` covered — `209/271` killed)** (تم رصده قبل إضافة تعديل Redis/error-mapper).
  - **Dependency Audit (`pnpm audit --prod --audit-level=high`)**: ترقية `drizzle-orm` إلى `^0.45.2` أغلقت `GHSA-gpj5-g38j-94v9`؛ وبقيت ملاحظة `zod < 4.6.6` (`GHSA-mrhx-c7xc-m3w5` المرتبطة بـ Zod 3 / `fastify-type-provider-zod@4`) و38 ملاحظة عابرة داخل حزمة `mobile` (`expo`/`react-native`).

---

## 7. ما المتبقي لإكمال المشروع وإطلاقه؟

1. **ربط مزودي الخدمة الإنتاجيين (Real HTTP Adapters)** بدلاً من المحاكيات الموصولة حالياً في [composition-root.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/src/composition-root.ts):
   - بوابة الدفع التركية الفعلية (**iyzico** أو **PayTR** Checkout + Webhook) في [payment.providers.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/src/infrastructure/providers/payment.providers.ts).
   - خدمة **Netgsm SMS** الفعلية في [sms.providers.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/src/infrastructure/providers/sms.providers.ts).
   - خدمة **Expo Push API** الفعلية في [push.providers.ts](file:///C:/Users/Hp/OneDrive/Desktop/kardeslerAPP/backend/src/infrastructure/providers/push.providers.ts).
2. **نقاط Auth/Staff إضافية اختيارية للوحة التحكم:**
   - إضافة `GET /api/v1/users/me` لبيانات العميل الحالي (لو احتاجه الموبايل عند التشغيل).
   - مسارات **نسيت/تغيير كلمة المرور للموظف/المالك** و**إنشاء/تعطيل/إعادة ضبط TOTP لموظف** (`POST/PATCH /api/v1/admin/staff`).
3. **بناء واجهات المستخدم بالكامل:**
   - تطبيق الموبايل للعملاء (`mobile/src/`).
   - لوحة تحكم المطبخ والإدارة (`admin/src/`).
4. **تجهيزات النشر الفعلي:**
   - استبدال بيانات التجربة في `007_seed.sql` بكلمات مرور وأسعار حقيقية وتجهيز `.env` الإنتاجية.
   - تجهيز حسابات المتاجر (Apple/Google), حساب الدفع التركي، خادم Docker/Redis/Postgres وربط طابعة **SUNLUX RP8020** بـ `print-agent`.
