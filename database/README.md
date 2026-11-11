# Kardeşler Cihangir - PostgreSQL 16 + PostGIS Database Architecture

This directory houses the complete PostgreSQL schema and automated test suite for the **Kardeşler Cihangir** food ordering mobile application (iOS & Android) and staff operations terminal.

Security, financial immutability, data isolation, and Turkish KVKK compliance are enforced directly in the database layer.

---

## 1. Table Inventory

| Category | Table Name | Purpose / Security Scope |
| :--- | :--- | :--- |
| **Settings & Staff** | `restaurant_settings` | Singleton configuration (hours, business day cutoff 06:00, order pause switch). |
| | `staff_users` | Backoffice accounts (Argon2id hashes, 2FA TOTP, owner/staff roles). |
| **Patrons & Auth** | `users` | Customers (E.164 phone, referral code, KVKK deletion tracking). |
| | `otp_codes` | Hashed 6-digit verification codes (5 attempts max, never raw codes). |
| | `refresh_tokens` | Rotating token families with instant breach/reuse detection. |
| | `devices` | Registered push tokens for Expo/FCM/APNs notifications. |
| | `addresses` | PostGIS point coordinates, building/floor details. RLS protected. |
| | `consents` | Append-only Turkish KVKK & İYS consent audit trail. |
| **Delivery & Fleet** | `delivery_zones` | PostGIS valid polygons with minimum spend and estimated delivery times. |
| | `drivers` | Internal delivery couriers employed by the restaurant. |
| **Menu Catalog** | `categories` | Product categories (Kebaplar, Dürümler, Pide, etc.). |
| | `category_translations`| Multilingual labels. **Turkish translation is strictly mandatory.** |
| | `menu_items` | Kuruş prices, KDV vat rate, allergens, sold-out availability switch. |
| | `menu_item_translations`| Item titles & descriptions. Turkish translation is mandatory. |
| | `tags` & `tag_translations`| Promotional badges (Best Seller, Chef's Choice, Spicy, Vegetarian). |
| | `menu_item_tags` | Many-to-many relationship mapping badges to dishes. |
| | `option_groups` & `_translations` | Modifier sets (Porsiyon, Pişme Derecesi, Soğan Tercihi). Turkish required. |
| | `options` & `_translations` | Modifier choices with fixed Turkish names for kitchen thermal printing. |
| | `price_history` | Automated audit trail logging all price changes with staff actor attribution. |
| | `menu_import_staging` | Staging pipeline for importing 100+ menu items from CSV/COPY. |
| **Orders & Fulfillment** | `daily_order_counters` | Concurrency-safe atomic daily sequence counter table. |
| | `orders` | Financial snapshot in kuruş, status machine, delivery address snapshot. |
| | `order_items` | Immutable ordered line items with Turkish name and unit price snapshot. |
| | `order_item_options` | Immutable option choices snapshotting Turkish ticket labels. |
| | `order_events` | Append-only status transition log with timestamp tracking. |
| | `payments` | Tokenized payment records (iyzico/PayTR & cash). Zero card/PAN data. |
| | `print_jobs` | SUNLUX RP8020 80mm ESC/POS kitchen thermal printing queue. |
| **Promotions & Growth** | `coupons` | Case-insensitive codes, date windows, caps, first-order restrictions. |
| | `coupon_categories` | Targeted coupon category rules. |
| | `coupon_menu_items` | Targeted coupon item rules. |
| | `coupon_redemptions` | Single coupon per order (`UNIQUE(order_id)`), atomic `redeem_coupon()`. |
| | `referrals` | Dual-sided reward ledger triggered upon first delivered order. |
| | `loyalty_ledger` | Append-only points debit/credit ledger (`loyalty_balances` view). |
| | `banners` | Seasonal mobile carousel promotions. |
| | `reviews` | Customer ratings restricted strictly to **delivered** orders. |
| | `notifications` | Delivery status of mobile push messages. |
| **Audit & Governance** | `audit_logs` | Append-only administrative activity capture via automated triggers. |

---

## 2. How to Run Migrations & Test Suite

### Migration Sequence
Execute the files in numerical order on a fresh PostgreSQL 16 database with PostGIS:

```bash
# 1. Extensions, roles (app_migrator, app_api, app_readonly) & permissions
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/001_extensions_and_roles.sql

# 2. Settings, staff, patrons, addresses, delivery zones, KVKK consents
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/002_core.sql

# 3. Categories, items, options, translations, triggers, staging import
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/003_menu.sql

# 4. Midnight cutoff, counter, orders, immutable items, status machine, thermal print jobs
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/004_orders.sql

# 5. Coupons, atomic redeem_coupon(), loyalty ledger, reviews
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/005_promotions.sql

# 6. RLS enablement, FORCE ROW LEVEL SECURITY, and role grants
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/006_security_rls.sql

# 7. Seed data (restaurant settings, staff owner, 3 zones, 2 drivers, 15 dishes, 3 coupons)
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/007_seed.sql

# 8. Execute automated verification test suite
psql -U postgres -d kardesler_db -v ON_ERROR_STOP=1 -f database/tests.sql
```

---

## 3. Assumptions Needing Confirmation (Marked "NEEDS CONFIRMATION")

1. **VAT Rate (`vat_rate_percent`) [NEEDS CONFIRMATION]:**
   - Configured with a default of `1` (1% KDV applied on takeaway bread/basic food in Turkey). If restaurant delivery service is legally classified under 10% VAT in the restaurant's tax accounting, this can be set to `10`.
2. **Business Day Cutoff (`business_day_cutoff`) [NEEDS CONFIRMATION]:**
   - Set to `06:00:00 Europe/Istanbul` so late-night orders placed up to 02:00 or 03:00 AM count towards the previous evening's business day reports and order numbering.
3. **Delivery Fees [NEEDS CONFIRMATION]:**
   - In accordance with business rules, delivery is always free (`delivery_fee_kurus = 0`), and profitability is protected via polygon-specific minimum order thresholds (`min_order_kurus` evaluated **after** coupons).
4. **Thermal Printer Model [NEEDS CONFIRMATION]:**
   - SUNLUX RP8020 (80mm, ESC/POS, Turkish Code Page CP857). Print jobs snapshot clean Turkish labels directly from menu items and ready-made option selections.
