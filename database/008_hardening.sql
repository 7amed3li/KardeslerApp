-- ============================================================================
-- Migration: 008_hardening.sql
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Phase 0 security & schema hardening:
--              1. Dedicated NOLOGIN BYPASSRLS role `app_definer` owning all
--                 SECURITY DEFINER functions with locked search_path = public, pg_temp.
--              2. Revoke PUBLIC and app_readonly execution on all functions.
--              3. Audit log secret redaction & append-only TRUNCATE protection.
--              4. Remove direct INSERT on order_events from app_api.
--              5. RLS on print_jobs & narrow SECURITY DEFINER auth helpers.
--              6. Fix loyalty_balances view & system role context.
--              7. Restaurant settings fields for COD limits, payment timeouts,
--                 and heartbeat thresholds.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. DEDICATED SECURITY DEFINER OWNER ROLE: app_definer
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_definer') THEN
        CREATE ROLE app_definer WITH NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
    ELSE
        ALTER ROLE app_definer WITH NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_definer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_definer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_definer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_definer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO app_definer;

-- ----------------------------------------------------------------------------
-- 2. SESSION CONTEXT HELPERS (FAIL-CLOSED, SUPPORT 'system' AND 'print_agent')
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('app.current_role', true), '') = 'customer' THEN
        RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    END IF;
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_current_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN COALESCE(NULLIF(current_setting('app.current_role', true), ''), '');
EXCEPTION WHEN OTHERS THEN
    RETURN '';
END;
$$;

CREATE OR REPLACE FUNCTION public.app_is_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN COALESCE(current_setting('app.current_role', true) IN ('staff', 'owner', 'system'), false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_is_owner_or_system()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN COALESCE(current_setting('app.current_role', true) IN ('owner', 'system'), false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. HARDENED AUDIT LOG TRIGGER & PRICE HISTORY TRIGGER (OWNED BY app_definer)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id uuid;
    v_record_id text;
    v_old jsonb := NULL;
    v_new jsonb := NULL;
    v_action text;
BEGIN
    BEGIN
        v_actor_id := NULLIF(current_setting('app.current_staff_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        v_record_id := NEW.id::text;
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_record_id := NEW.id::text;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_record_id := OLD.id::text;
        v_old := to_jsonb(OLD);
    END IF;

    -- Unconditionally redact secret fields from any audited table
    IF v_new IS NOT NULL THEN
        v_new := v_new - 'password_hash' - 'totp_secret_encrypted' - 'code_hash' - 'salt' - 'token_hash';
    END IF;
    IF v_old IS NOT NULL THEN
        v_old := v_old - 'password_hash' - 'totp_secret_encrypted' - 'code_hash' - 'salt' - 'token_hash';
    END IF;

    INSERT INTO public.audit_logs (actor_staff_id, action, table_name, record_id, old_values, new_values)
    VALUES (v_actor_id, v_action, TG_TABLE_NAME, v_record_id, v_old, v_new);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

ALTER FUNCTION public.fn_audit_log_trigger() OWNER TO app_definer;

CREATE OR REPLACE FUNCTION public.fn_record_price_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff_id uuid;
BEGIN
    IF OLD.price_kurus <> NEW.price_kurus THEN
        BEGIN
            v_staff_id := NULLIF(current_setting('app.current_staff_id', true), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_staff_id := NULL;
        END;

        INSERT INTO public.price_history (menu_item_id, old_price_kurus, new_price_kurus, changed_by_staff_id)
        VALUES (NEW.id, OLD.price_kurus, NEW.price_kurus, v_staff_id);
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_record_price_history() OWNER TO app_definer;

-- ----------------------------------------------------------------------------
-- 4. HARDENED anonymize_user & redeem_coupon (OWNED BY app_definer)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_anon_tag text;
    v_user_phone text;
    v_caller_user_id uuid;
    v_role text;
    v_is_staff boolean;
BEGIN
    v_role := COALESCE(NULLIF(current_setting('app.current_role', true), ''), '');
    BEGIN
        v_caller_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_caller_user_id := NULL;
    END;

    v_is_staff := v_role IN ('staff', 'owner', 'system');

    IF NOT v_is_staff AND v_role = '' AND session_user IN ('postgres', 'app_migrator') THEN
        v_is_staff := true;
    END IF;

    IF NOT v_is_staff AND (v_role <> 'customer' OR v_caller_user_id IS NULL OR v_caller_user_id <> p_user_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot request account erasure for user %', p_user_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT u.phone INTO v_user_phone
    FROM public.users u
    WHERE u.id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found', p_user_id
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_anon_tag := 'ANON_' || substr(replace(p_user_id::text, '-', ''), 1, 12);

    DELETE FROM public.devices WHERE user_id = p_user_id;
    DELETE FROM public.refresh_tokens WHERE user_id = p_user_id;
    DELETE FROM public.addresses WHERE user_id = p_user_id;

    IF v_user_phone IS NOT NULL THEN
        DELETE FROM public.otp_codes WHERE phone = v_user_phone;
    END IF;

    -- Record append-only KVKK consent withdrawal upon account erasure
    INSERT INTO public.consents (user_id, type, granted, source, version)
    VALUES (p_user_id, 'privacy', false, 'account_erasure', 'kvkk-erasure-v1');

    UPDATE public.orders
    SET
        customer_name_snapshot = 'Kullanıcı Silindi (Anonymized)',
        customer_phone_snapshot = '+900000000000',
        customer_note = NULL,
        address_snapshot = jsonb_build_object('anonymized', true)
    WHERE user_id = p_user_id;

    UPDATE public.users
    SET
        phone = NULL,
        name = 'Anonim Kullanıcı',
        email = NULL,
        referral_code = v_anon_tag,
        deleted_at = COALESCE(deleted_at, clock_timestamp()),
        anonymized_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = p_user_id;
END;
$$;

ALTER FUNCTION public.anonymize_user(uuid) OWNER TO app_definer;

CREATE OR REPLACE FUNCTION public.redeem_coupon(
    p_coupon_id uuid,
    p_user_id uuid,
    p_order_id uuid,
    p_discount_kurus bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_coupon public.coupons%ROWTYPE;
    v_order public.orders%ROWTYPE;
    v_user_uses integer;
    v_prior_orders integer;
    v_redemption_id uuid;
    v_expected_discount bigint;
    v_caller_user_id uuid;
    v_role text;
    v_is_staff boolean;
    v_current_time_istanbul time;
    v_has_target_item boolean;
BEGIN
    v_role := COALESCE(NULLIF(current_setting('app.current_role', true), ''), '');
    BEGIN
        v_caller_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_caller_user_id := NULL;
    END;

    v_is_staff := v_role IN ('staff', 'owner', 'system');
    IF NOT v_is_staff AND v_role = '' AND session_user IN ('postgres', 'app_migrator') THEN
        v_is_staff := true;
    END IF;

    IF NOT v_is_staff AND (v_role <> 'customer' OR v_caller_user_id IS NULL OR v_caller_user_id <> p_user_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot redeem coupons on behalf of another patron'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_order.user_id IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Order % does not belong to user %', p_order_id, p_user_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_order.status NOT IN ('new', 'awaiting_payment') THEN
        RAISE EXCEPTION 'Coupons can only be redeemed on newly created orders (current: %)', v_order.status
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE id = p_coupon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Coupon % does not exist', p_coupon_id
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NOT v_coupon.is_active THEN
        RAISE EXCEPTION 'Coupon % is inactive', v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF clock_timestamp() < v_coupon.starts_at OR clock_timestamp() > v_coupon.ends_at THEN
        RAISE EXCEPTION 'Coupon % is expired or not yet active', v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_coupon.active_hours IS NOT NULL THEN
        v_current_time_istanbul := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::time;
        IF v_coupon.active_hours ? 'start' AND v_coupon.active_hours ? 'end' THEN
            IF v_current_time_istanbul < (v_coupon.active_hours->>'start')::time OR
               v_current_time_istanbul > (v_coupon.active_hours->>'end')::time THEN
                RAISE EXCEPTION 'Coupon % is only valid between % and % Istanbul time',
                    v_coupon.code, v_coupon.active_hours->>'start', v_coupon.active_hours->>'end'
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    END IF;

    IF v_coupon.applies_to = 'categories' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.order_items oi
            JOIN public.menu_items mi ON mi.id = oi.menu_item_id
            JOIN public.coupon_categories cc ON cc.category_id = mi.category_id
            WHERE oi.order_id = p_order_id AND cc.coupon_id = p_coupon_id
        ) INTO v_has_target_item;

        IF NOT v_has_target_item THEN
            RAISE EXCEPTION 'Coupon % only applies to specific categories not present in this order', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF v_coupon.applies_to = 'items' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.order_items oi
            JOIN public.coupon_menu_items cmi ON cmi.menu_item_id = oi.menu_item_id
            WHERE oi.order_id = p_order_id AND cmi.coupon_id = p_coupon_id
        ) INTO v_has_target_item;

        IF NOT v_has_target_item THEN
            RAISE EXCEPTION 'Coupon % only applies to specific items not present in this order', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF v_coupon.max_total_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_total_uses THEN
        RAISE EXCEPTION 'Coupon % has reached its total usage limit', v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_user_uses
    FROM public.coupon_redemptions cr
    JOIN public.orders o ON o.id = cr.order_id
    WHERE cr.coupon_id = p_coupon_id
      AND cr.user_id = p_user_id
      AND o.status NOT IN ('cancelled', 'rejected');

    IF v_user_uses >= v_coupon.max_uses_per_user THEN
        RAISE EXCEPTION 'User has already reached maximum allowable redemptions for coupon %', v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_coupon.first_order_only THEN
        SELECT count(*) INTO v_prior_orders
        FROM public.orders
        WHERE user_id = p_user_id
          AND status = 'delivered'
          AND id <> p_order_id;

        IF v_prior_orders > 0 THEN
            RAISE EXCEPTION 'Coupon % is valid only for first-time orders', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF v_order.subtotal_kurus < v_coupon.min_order_kurus THEN
        RAISE EXCEPTION 'Order subtotal (%) is below coupon minimum spend requirement (%)',
            v_order.subtotal_kurus, v_coupon.min_order_kurus
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_coupon.type = 'percent' THEN
        v_expected_discount := round((v_order.subtotal_kurus * v_coupon.value) / 100.0);
        IF v_coupon.max_discount_kurus IS NOT NULL THEN
            v_expected_discount := LEAST(v_expected_discount, v_coupon.max_discount_kurus);
        END IF;
    ELSIF v_coupon.type = 'fixed_amount' THEN
        v_expected_discount := LEAST(v_coupon.value, v_order.subtotal_kurus);
    ELSE
        v_expected_discount := p_discount_kurus;
    END IF;

    IF p_discount_kurus <> v_expected_discount THEN
        RAISE EXCEPTION 'Discount amount mismatch: supplied %, expected % based on coupon % rules',
            p_discount_kurus, v_expected_discount, v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, discount_kurus)
    VALUES (p_coupon_id, p_user_id, p_order_id, p_discount_kurus)
    RETURNING id INTO v_redemption_id;

    UPDATE public.coupons
    SET used_count = used_count + 1
    WHERE id = p_coupon_id;

    RETURN v_redemption_id;
END;
$$;

ALTER FUNCTION public.redeem_coupon(uuid, uuid, uuid, bigint) OWNER TO app_definer;

-- ----------------------------------------------------------------------------
-- 5. REMOVE DIRECT INSERT ON order_events FROM app_api
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_order_events_customer_insert ON public.order_events;
DROP POLICY IF EXISTS pol_order_events_staff_all ON public.order_events;
DROP POLICY IF EXISTS pol_order_events_staff_select ON public.order_events;

CREATE POLICY pol_order_events_staff_select ON public.order_events
FOR SELECT TO app_api
USING (public.app_is_staff());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_events FROM app_api, app_readonly, PUBLIC;
GRANT SELECT ON public.order_events TO app_api;

-- ----------------------------------------------------------------------------
-- 6. RLS ON print_jobs & NARROW AUTH FUNCTIONS
-- ----------------------------------------------------------------------------
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_admin_migrator_print_jobs ON public.print_jobs;
CREATE POLICY pol_admin_migrator_print_jobs ON public.print_jobs
FOR ALL TO app_migrator USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pol_print_jobs_staff_and_agent ON public.print_jobs;
CREATE POLICY pol_print_jobs_staff_and_agent ON public.print_jobs
FOR ALL TO app_api
USING (public.app_current_role() IN ('staff', 'owner', 'system', 'print_agent'))
WITH CHECK (public.app_current_role() IN ('staff', 'owner', 'system', 'print_agent'));

-- Prevent direct SELECT of password_hash and totp_secret_encrypted by customer sessions
-- and provide narrow SECURITY DEFINER functions for authentication flows:
CREATE OR REPLACE FUNCTION public.auth_get_staff_by_email(p_email text)
RETURNS TABLE (
    id uuid,
    email citext,
    password_hash text,
    role text,
    totp_secret_encrypted text,
    totp_enabled boolean,
    is_active boolean,
    last_login_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF public.app_current_role() NOT IN ('system', 'auth', 'staff', 'owner')
       AND session_user NOT IN ('postgres', 'app_migrator') THEN
        RAISE EXCEPTION 'Unauthorized auth lookup' USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    SELECT
        s.id, s.email, s.password_hash, s.role,
        s.totp_secret_encrypted, s.totp_enabled, s.is_active, s.last_login_at
    FROM public.staff_users s
    WHERE s.email = p_email::citext
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.auth_get_staff_by_email(text) OWNER TO app_definer;
ALTER FUNCTION public.find_delivery_zone(double precision, double precision) SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.find_delivery_zone(double precision, double precision) OWNER TO app_definer;
ALTER FUNCTION public.business_date_of(timestamptz) SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.business_date_of(timestamptz) OWNER TO app_definer;

-- ----------------------------------------------------------------------------
-- 7. FIX loyalty_balances VIEW & GRANTS + AUTH CONTEXT POLICIES
-- ----------------------------------------------------------------------------
-- Allow 'auth' context (used strictly during pre-token OTP/login verification)
-- to manage otp_codes, users, and refresh_tokens while keeping customer sessions isolated.
DROP POLICY IF EXISTS pol_otp_codes_auth_all ON public.otp_codes;
CREATE POLICY pol_otp_codes_auth_all ON public.otp_codes
FOR ALL TO app_api
USING (public.app_current_role() IN ('auth', 'system', 'owner'))
WITH CHECK (public.app_current_role() IN ('auth', 'system', 'owner'));

DROP POLICY IF EXISTS pol_users_auth_all ON public.users;
CREATE POLICY pol_users_auth_all ON public.users
FOR ALL TO app_api
USING (public.app_current_role() IN ('auth', 'system'))
WITH CHECK (public.app_current_role() IN ('auth', 'system'));

DROP POLICY IF EXISTS pol_refresh_tokens_auth_all ON public.refresh_tokens;
CREATE POLICY pol_refresh_tokens_auth_all ON public.refresh_tokens
FOR ALL TO app_api
USING (public.app_current_role() IN ('auth', 'system'))
WITH CHECK (public.app_current_role() IN ('auth', 'system'));

DROP POLICY IF EXISTS pol_staff_users_auth_update ON public.staff_users;
CREATE POLICY pol_staff_users_auth_update ON public.staff_users
FOR ALL TO app_api
USING (public.app_current_role() IN ('auth', 'system', 'staff', 'owner'))
WITH CHECK (public.app_current_role() IN ('auth', 'system', 'staff', 'owner'));

GRANT SELECT ON public.loyalty_ledger TO app_readonly;

DROP POLICY IF EXISTS pol_loyalty_ledger_readonly ON public.loyalty_ledger;
CREATE POLICY pol_loyalty_ledger_readonly ON public.loyalty_ledger
FOR SELECT TO app_readonly
USING (true);

CREATE OR REPLACE VIEW public.loyalty_balances
WITH (security_invoker = true)
AS
SELECT
    user_id,
    COALESCE(SUM(points), 0)::bigint AS current_balance,
    COALESCE(SUM(
        CASE
            WHEN points > 0 AND (expires_at IS NULL OR expires_at > clock_timestamp()) THEN points
            WHEN points < 0 THEN points
            ELSE 0
        END
    ), 0)::bigint AS active_balance
FROM public.loyalty_ledger
GROUP BY user_id;

GRANT SELECT ON public.loyalty_balances TO app_api, app_readonly;

-- ----------------------------------------------------------------------------
-- 8. RESTAURANT SETTINGS: COD LIMITS, PAYMENT TIMEOUT, HEARTBEAT GRACE
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

ALTER TABLE public.menu_items
    ADD COLUMN IF NOT EXISTS available_from time,
    ADD COLUMN IF NOT EXISTS available_until time;

ALTER TABLE public.restaurant_settings
    ADD COLUMN IF NOT EXISTS cod_max_amount_kurus bigint NOT NULL DEFAULT 150000
        CONSTRAINT chk_settings_cod_max_amount CHECK (cod_max_amount_kurus >= 0),
    ADD COLUMN IF NOT EXISTS cod_max_open_orders integer NOT NULL DEFAULT 1
        CONSTRAINT chk_settings_cod_max_open CHECK (cod_max_open_orders >= 0),
    ADD COLUMN IF NOT EXISTS payment_timeout_minutes integer NOT NULL DEFAULT 15
        CONSTRAINT chk_settings_payment_timeout CHECK (payment_timeout_minutes > 0),
    ADD COLUMN IF NOT EXISTS unaccepted_order_alert_minutes integer NOT NULL DEFAULT 5
        CONSTRAINT chk_settings_unaccepted_alert CHECK (unaccepted_order_alert_minutes > 0),
    ADD COLUMN IF NOT EXISTS heartbeat_grace_seconds integer NOT NULL DEFAULT 120
        CONSTRAINT chk_settings_heartbeat_grace CHECK (heartbeat_grace_seconds > 0);

-- ----------------------------------------------------------------------------
-- 9. ADDITIONAL FOREIGN KEY INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_device ON public.notifications(device_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON public.reviews(user_id);

-- ----------------------------------------------------------------------------
-- 10. STRICT FUNCTION EXECUTION GRANTS
-- ----------------------------------------------------------------------------
-- Ensure PostGIS, pgcrypto, and citext extension functions in public remain callable
-- by app_api, app_definer, and app_migrator, while revoking sensitive functions
-- from PUBLIC and app_readonly.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_api, app_definer, app_migrator;

REVOKE EXECUTE ON FUNCTION
    public.app_user_id(),
    public.app_current_role(),
    public.app_is_staff(),
    public.app_is_owner_or_system(),
    public.business_date_of(timestamptz),
    public.next_order_number(date),
    public.find_delivery_zone(double precision, double precision),
    public.redeem_coupon(uuid, uuid, uuid, bigint),
    public.anonymize_user(uuid),
    public.auth_get_staff_by_email(text),
    public.fn_validate_allergens(text[]),
    public.fn_process_menu_import_staging()
FROM PUBLIC, app_readonly;

GRANT EXECUTE ON FUNCTION
    public.app_user_id(),
    public.app_current_role(),
    public.app_is_staff(),
    public.app_is_owner_or_system(),
    public.business_date_of(timestamptz),
    public.next_order_number(date),
    public.find_delivery_zone(double precision, double precision),
    public.redeem_coupon(uuid, uuid, uuid, bigint),
    public.anonymize_user(uuid),
    public.auth_get_staff_by_email(text),
    public.fn_validate_allergens(text[]),
    public.fn_process_menu_import_staging()
TO app_api, app_definer, app_migrator;

GRANT EXECUTE ON FUNCTION
    public.business_date_of(timestamptz),
    public.find_delivery_zone(double precision, double precision)
TO app_readonly;

COMMIT;
