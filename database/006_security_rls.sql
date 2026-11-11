-- ============================================================================
-- Migration: 006_security_rls.sql (Hardened Production Grade)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Complete Row-Level Security (RLS) enforcement, customer isolation,
--              migrator administrative bypass, and least-privileged role grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS SESSION CONTEXT HELPER FUNCTIONS (FAIL-CLOSED)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_user_id()
RETURNS uuid AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION app_is_staff()
RETURNS boolean AS $$
BEGIN
    RETURN COALESCE(current_setting('app.current_role', true) IN ('staff', 'owner', 'system'), false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 2. ENABLE & FORCE RLS ON ALL SENSITIVE & CUSTOMER-OWNED TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users FORCE ROW LEVEL SECURITY;

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes FORCE ROW LEVEL SECURITY;

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses FORCE ROW LEVEL SECURITY;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_options FORCE ROW LEVEL SECURITY;

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events FORCE ROW LEVEL SECURITY;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;

ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_ledger FORCE ROW LEVEL SECURITY;

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions FORCE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. ADMINISTRATIVE POLICIES FOR APP_MIGRATOR
-- ----------------------------------------------------------------------------
-- Fixes RLS failure during initial migration, seed data loading, and maintenance
CREATE POLICY pol_admin_migrator_users ON users FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_staff ON staff_users FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_otp ON otp_codes FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_tokens ON refresh_tokens FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_addresses ON addresses FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_orders ON orders FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_items ON order_items FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_options ON order_item_options FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_events ON order_events FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_payments ON payments FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_devices ON devices FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_consents ON consents FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_loyalty ON loyalty_ledger FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_reviews ON reviews FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_redemptions ON coupon_redemptions FOR ALL TO app_migrator USING (true) WITH CHECK (true);
CREATE POLICY pol_admin_migrator_notifications ON notifications FOR ALL TO app_migrator USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. APPLICATION POLICIES FOR APP_API
-- ----------------------------------------------------------------------------

-- --- users ---
CREATE POLICY pol_users_staff_all ON users FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_users_customer_select ON users FOR SELECT TO app_api
USING (id = app_user_id() AND deleted_at IS NULL);

CREATE POLICY pol_users_customer_update ON users FOR UPDATE TO app_api
USING (id = app_user_id() AND deleted_at IS NULL) WITH CHECK (id = app_user_id());

-- --- staff_users ---
CREATE POLICY pol_staff_users_staff_all ON staff_users FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());
-- Non-staff / customers see 0 rows from staff_users

-- --- otp_codes ---
CREATE POLICY pol_otp_codes_staff_all ON otp_codes FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_otp_codes_service_insert ON otp_codes FOR INSERT TO app_api
WITH CHECK (true); -- Backend auth service generates OTPs

-- --- refresh_tokens ---
CREATE POLICY pol_refresh_tokens_staff_all ON refresh_tokens FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_refresh_tokens_customer_all ON refresh_tokens FOR ALL TO app_api
USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- --- addresses ---
CREATE POLICY pol_addresses_staff_all ON addresses FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_addresses_customer_select ON addresses FOR SELECT TO app_api
USING (user_id = app_user_id() AND deleted_at IS NULL);

CREATE POLICY pol_addresses_customer_insert ON addresses FOR INSERT TO app_api
WITH CHECK (user_id = app_user_id());

CREATE POLICY pol_addresses_customer_update ON addresses FOR UPDATE TO app_api
USING (user_id = app_user_id() AND deleted_at IS NULL) WITH CHECK (user_id = app_user_id());

CREATE POLICY pol_addresses_customer_delete ON addresses FOR DELETE TO app_api
USING (user_id = app_user_id());

-- --- orders ---
CREATE POLICY pol_orders_staff_all ON orders FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_orders_customer_select ON orders FOR SELECT TO app_api
USING (user_id = app_user_id());

CREATE POLICY pol_orders_customer_insert ON orders FOR INSERT TO app_api
WITH CHECK (
    user_id = app_user_id() AND
    status = 'new' AND
    invoice_status = 'not_required' AND
    invoice_number IS NULL AND
    accepted_at IS NULL AND
    delivered_at IS NULL AND
    cancelled_at IS NULL
);

-- --- order_items ---
CREATE POLICY pol_order_items_staff_all ON order_items FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_order_items_customer_select ON order_items FOR SELECT TO app_api
USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = app_user_id()));

CREATE POLICY pol_order_items_customer_insert ON order_items FOR INSERT TO app_api
WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = app_user_id()));

-- --- order_item_options ---
CREATE POLICY pol_order_item_options_staff_all ON order_item_options FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_order_item_options_customer_select ON order_item_options FOR SELECT TO app_api
USING (EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_options.order_item_id AND o.user_id = app_user_id()
));

CREATE POLICY pol_order_item_options_customer_insert ON order_item_options FOR INSERT TO app_api
WITH CHECK (EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_options.order_item_id AND o.user_id = app_user_id()
));

-- --- order_events ---
CREATE POLICY pol_order_events_staff_all ON order_events FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_order_events_customer_select ON order_events FOR SELECT TO app_api
USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_events.order_id AND orders.user_id = app_user_id()));

CREATE POLICY pol_order_events_customer_insert ON order_events FOR INSERT TO app_api
WITH CHECK (
    actor_type = 'customer' AND
    actor_id = app_user_id()::text AND
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_events.order_id AND orders.user_id = app_user_id())
);

-- --- payments ---
CREATE POLICY pol_payments_staff_all ON payments FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_payments_customer_select ON payments FOR SELECT TO app_api
USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.user_id = app_user_id()));

-- --- devices ---
CREATE POLICY pol_devices_staff_select ON devices FOR SELECT TO app_api
USING (app_is_staff());

CREATE POLICY pol_devices_customer_all ON devices FOR ALL TO app_api
USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- --- consents ---
CREATE POLICY pol_consents_staff_select ON consents FOR SELECT TO app_api
USING (app_is_staff());

CREATE POLICY pol_consents_customer_select ON consents FOR SELECT TO app_api
USING (user_id = app_user_id());

CREATE POLICY pol_consents_customer_insert ON consents FOR INSERT TO app_api
WITH CHECK (user_id = app_user_id());

-- --- loyalty_ledger ---
CREATE POLICY pol_loyalty_ledger_staff_all ON loyalty_ledger FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_loyalty_ledger_customer_select ON loyalty_ledger FOR SELECT TO app_api
USING (user_id = app_user_id());

-- --- reviews ---
CREATE POLICY pol_reviews_read_all ON reviews FOR SELECT TO app_api
USING (true);

CREATE POLICY pol_reviews_staff_manage ON reviews FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_reviews_customer_insert ON reviews FOR INSERT TO app_api
WITH CHECK (user_id = app_user_id());

-- --- coupon_redemptions ---
CREATE POLICY pol_coupon_redemptions_staff_all ON coupon_redemptions FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_coupon_redemptions_customer_select ON coupon_redemptions FOR SELECT TO app_api
USING (user_id = app_user_id());

CREATE POLICY pol_coupon_redemptions_customer_insert ON coupon_redemptions FOR INSERT TO app_api
WITH CHECK (user_id = app_user_id());

-- --- notifications ---
CREATE POLICY pol_notifications_staff_all ON notifications FOR ALL TO app_api
USING (app_is_staff()) WITH CHECK (app_is_staff());

CREATE POLICY pol_notifications_customer_select ON notifications FOR SELECT TO app_api
USING (user_id = app_user_id());

-- ----------------------------------------------------------------------------
-- 5. EXPLICIT GRANTS & PRIVILEGE ENFORCEMENT
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
    restaurant_settings,
    staff_users,
    users,
    otp_codes,
    refresh_tokens,
    devices,
    addresses,
    delivery_zones,
    drivers,
    categories,
    category_translations,
    menu_items,
    menu_item_translations,
    tags,
    tag_translations,
    menu_item_tags,
    option_groups,
    option_group_translations,
    options,
    option_translations,
    orders,
    order_items,
    order_item_options,
    payments,
    print_jobs,
    coupons,
    coupon_categories,
    coupon_menu_items,
    coupon_redemptions,
    referrals,
    banners,
    reviews,
    notifications,
    daily_order_counters,
    menu_import_staging
TO app_api;

-- Append-only tables: SELECT and INSERT only (strictly NO UPDATE or DELETE for app_api)
GRANT SELECT, INSERT ON
    order_events,
    audit_logs,
    consents,
    loyalty_ledger,
    price_history
TO app_api;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_api;
GRANT SELECT ON loyalty_balances TO app_api;

-- Function Execution Grants:
-- Strictly revoke from PUBLIC and grant ONLY to app_api
REVOKE EXECUTE ON FUNCTION
    app_user_id,
    app_is_staff,
    business_date_of,
    next_order_number,
    find_delivery_zone,
    redeem_coupon,
    anonymize_user,
    fn_validate_allergens,
    fn_process_menu_import_staging
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    app_user_id,
    app_is_staff,
    business_date_of,
    next_order_number,
    find_delivery_zone,
    redeem_coupon,
    anonymize_user,
    fn_validate_allergens,
    fn_process_menu_import_staging
TO app_api;

-- ----------------------------------------------------------------------------
-- 6. APP_READONLY ROLE PRIVILEGES (SAFE ANALYTICS SUBSET)
-- ----------------------------------------------------------------------------
GRANT SELECT ON
    restaurant_settings,
    delivery_zones,
    drivers,
    categories,
    category_translations,
    menu_items,
    menu_item_translations,
    tags,
    tag_translations,
    menu_item_tags,
    option_groups,
    option_group_translations,
    options,
    option_translations,
    price_history,
    daily_order_counters,
    banners,
    loyalty_balances,
    reviews
TO app_readonly;

-- Revoke all access to sensitive PII and credential tables
REVOKE ALL ON staff_users, users, otp_codes, refresh_tokens, audit_logs, consents, payments, addresses FROM app_readonly;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM app_readonly;
