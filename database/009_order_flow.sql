-- ============================================================================
-- Migration: 009_order_flow.sql
-- Project: Kardeşler Cihangir Food Ordering System (Phase 0 Order Flow & Tables)
-- Description:
--   1. New operational & security tables: heartbeats, payment_events, refunds,
--      fraud_flags with full RLS and least-privilege grants.
--   2. Add 'awaiting_payment' status for online card orders; hide 'awaiting_payment'
--      orders from kitchen/staff role until payment is confirmed.
--   3. Strict column-whitelist immutability trigger on orders + automatic
--      kitchen_ticket print_job creation ONLY when transitioning new -> accepted.
--   4. Deferred constraint triggers enforcing both:
--        - subtotal_kurus = SUM(order_items.line_total_kurus)
--        - line_total_kurus = (unit_price_snapshot_kurus + SUM(option_deltas)) * quantity
--   5. Remove direct customer INSERT on orders, order_items, order_item_options.
--   6. Provide public.create_order(...) (SECURITY DEFINER owned by app_definer)
--      that computes all prices server-side in integer kuruş, validates PostGIS
--      delivery zone, option group min/max rules, coupons, post-discount zone
--      minimum, COD limits, and assigns business_date & order_number.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. NEW TABLES: heartbeats, payment_events, refunds, fraud_flags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.heartbeats (
    device_id text PRIMARY KEY,
    kind text NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_heartbeats_device_id_len CHECK (length(btrim(device_id)) BETWEEN 1 AND 120),
    CONSTRAINT chk_heartbeats_kind CHECK (kind IN ('print_agent', 'staff_tablet'))
);

CREATE TABLE IF NOT EXISTS public.payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    provider_event_id text NOT NULL UNIQUE,
    order_id uuid,
    event_type text NOT NULL,
    raw_payload jsonb NOT NULL,
    signature_valid boolean NOT NULL DEFAULT true,
    processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_payment_events_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order ON public.payment_events(order_id);

-- payment_events is an append-only audit trail of webhook deliveries
DROP TRIGGER IF EXISTS trg_payment_events_prevent_mutation ON public.payment_events;
CREATE TRIGGER trg_payment_events_prevent_mutation
BEFORE UPDATE OR DELETE ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_mutation();

DROP TRIGGER IF EXISTS trg_payment_events_prevent_truncate ON public.payment_events;
CREATE TRIGGER trg_payment_events_prevent_truncate
BEFORE TRUNCATE ON public.payment_events
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_prevent_mutation();

CREATE TABLE IF NOT EXISTS public.refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL,
    order_id uuid NOT NULL,
    amount_kurus bigint NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    provider_ref text,
    failure_reason text,
    initiated_by text,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT,
    CONSTRAINT chk_refunds_amount_pos CHECK (amount_kurus > 0),
    CONSTRAINT chk_refunds_status CHECK (status IN ('pending', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON public.refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds(order_id);

DROP TRIGGER IF EXISTS trg_refunds_updated_at ON public.refunds;
CREATE TRIGGER trg_refunds_updated_at
BEFORE UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TABLE IF NOT EXISTS public.fraud_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    order_id uuid,
    flag_type text NOT NULL,
    severity text NOT NULL DEFAULT 'medium',
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    resolved boolean NOT NULL DEFAULT false,
    resolved_by uuid,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_fraud_flags_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_fraud_flags_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_fraud_flags_resolved_by FOREIGN KEY (resolved_by) REFERENCES public.staff_users(id) ON DELETE SET NULL,
    CONSTRAINT chk_fraud_flags_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON public.fraud_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_order ON public.fraud_flags(order_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_unresolved ON public.fraud_flags(created_at DESC) WHERE resolved = false;

-- Enable & Force RLS on new tables
ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeats FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags FORCE ROW LEVEL SECURITY;

-- Migrator policies
DROP POLICY IF EXISTS pol_admin_migrator_heartbeats ON public.heartbeats;
CREATE POLICY pol_admin_migrator_heartbeats ON public.heartbeats FOR ALL TO app_migrator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pol_admin_migrator_payment_events ON public.payment_events;
CREATE POLICY pol_admin_migrator_payment_events ON public.payment_events FOR ALL TO app_migrator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pol_admin_migrator_refunds ON public.refunds;
CREATE POLICY pol_admin_migrator_refunds ON public.refunds FOR ALL TO app_migrator USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pol_admin_migrator_fraud_flags ON public.fraud_flags;
CREATE POLICY pol_admin_migrator_fraud_flags ON public.fraud_flags FOR ALL TO app_migrator USING (true) WITH CHECK (true);

-- Application policies on new tables
DROP POLICY IF EXISTS pol_heartbeats_select_all ON public.heartbeats;
CREATE POLICY pol_heartbeats_select_all ON public.heartbeats
FOR SELECT TO app_api USING (true);

DROP POLICY IF EXISTS pol_heartbeats_write_agents ON public.heartbeats;
CREATE POLICY pol_heartbeats_write_agents ON public.heartbeats
FOR ALL TO app_api
USING (public.app_current_role() IN ('staff', 'owner', 'system', 'print_agent'))
WITH CHECK (public.app_current_role() IN ('staff', 'owner', 'system', 'print_agent'));

DROP POLICY IF EXISTS pol_payment_events_staff_system ON public.payment_events;
CREATE POLICY pol_payment_events_staff_system ON public.payment_events
FOR ALL TO app_api
USING (public.app_current_role() IN ('staff', 'owner', 'system'))
WITH CHECK (public.app_current_role() IN ('staff', 'owner', 'system'));

DROP POLICY IF EXISTS pol_refunds_staff_system ON public.refunds;
CREATE POLICY pol_refunds_staff_system ON public.refunds
FOR ALL TO app_api
USING (public.app_is_staff())
WITH CHECK (public.app_is_staff());

DROP POLICY IF EXISTS pol_refunds_customer_select ON public.refunds;
CREATE POLICY pol_refunds_customer_select ON public.refunds
FOR SELECT TO app_api
USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refunds.order_id AND o.user_id = public.app_user_id()
));

DROP POLICY IF EXISTS pol_fraud_flags_staff_system ON public.fraud_flags;
CREATE POLICY pol_fraud_flags_staff_system ON public.fraud_flags
FOR ALL TO app_api
USING (public.app_is_staff())
WITH CHECK (public.app_is_staff());

DROP POLICY IF EXISTS pol_fraud_flags_customer_insert ON public.fraud_flags;
CREATE POLICY pol_fraud_flags_customer_insert ON public.fraud_flags
FOR INSERT TO app_api
WITH CHECK (user_id = public.app_user_id() OR public.app_is_staff());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.heartbeats, public.refunds, public.fraud_flags TO app_api;
GRANT SELECT, INSERT ON public.payment_events TO app_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.heartbeats, public.payment_events, public.refunds, public.fraud_flags TO app_definer;

-- ----------------------------------------------------------------------------
-- 2. ADD 'awaiting_payment' STATE TO orders AND order_events
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_status;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_status
    CHECK (status IN ('awaiting_payment', 'new', 'accepted', 'on_the_way', 'delivered', 'cancelled', 'rejected'));

ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS chk_order_events_from_status;
ALTER TABLE public.order_events ADD CONSTRAINT chk_order_events_from_status
    CHECK (from_status IS NULL OR from_status IN ('awaiting_payment', 'new', 'accepted', 'on_the_way', 'delivered', 'cancelled', 'rejected'));

ALTER TABLE public.order_events DROP CONSTRAINT IF EXISTS chk_order_events_to_status;
ALTER TABLE public.order_events ADD CONSTRAINT chk_order_events_to_status
    CHECK (to_status IN ('awaiting_payment', 'new', 'accepted', 'on_the_way', 'delivered', 'cancelled', 'rejected'));

DROP INDEX IF EXISTS public.idx_orders_active_status;
CREATE INDEX idx_orders_active_status ON public.orders(status, created_at)
    WHERE status IN ('awaiting_payment', 'new', 'accepted', 'on_the_way');

-- ----------------------------------------------------------------------------
-- 3. HARDENED ORDER IMMUTABILITY, STATE MACHINE & PRINT JOB CREATION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_orders_enforce_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role text;
BEGIN
    v_role := public.app_current_role();

    -- Unless explicitly inserted by app_migrator/postgres during seeding,
    -- always enforce initial status, business_date, order_number, and clean timestamps.
    IF v_role NOT IN ('owner', 'system') AND NOT (v_role = '' AND session_user IN ('postgres', 'app_migrator')) THEN
        IF NEW.payment_method = 'card_online' THEN
            NEW.status := 'awaiting_payment';
        ELSE
            NEW.status := 'new';
        END IF;
        NEW.business_date := public.business_date_of(clock_timestamp());
        NEW.order_number := public.next_order_number(NEW.business_date);
        NEW.invoice_status := 'not_required';
        NEW.invoice_number := NULL;
        NEW.accepted_at := NULL;
        NEW.delivered_at := NULL;
        NEW.cancelled_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_orders_enforce_defaults() OWNER TO app_definer;

CREATE OR REPLACE FUNCTION public.fn_order_created_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.order_events (order_id, from_status, to_status, actor_type, actor_id, note)
    VALUES (NEW.id, NULL, NEW.status, 'customer', NEW.user_id::text, 'Sipariş oluşturuldu (Order created)');
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_order_created_event() OWNER TO app_definer;

CREATE OR REPLACE FUNCTION public.fn_order_status_and_immutability_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_type text := 'system';
    v_actor_id text := NULL;
    v_coupon_id uuid;
    v_is_anonymizing boolean := false;
BEGIN
    -- Detect KVKK anonymization scrub executed by anonymize_user()
    IF NEW.customer_phone_snapshot = '+900000000000'
       AND NEW.customer_name_snapshot LIKE 'Kullanıcı Silindi%'
       AND NEW.customer_note IS NULL THEN
        v_is_anonymizing := true;
    END IF;

    -- 1. Strict Whitelist of Mutable Columns:
    -- ONLY status, driver_id, accepted_at, delivered_at, cancelled_at, cancel_reason,
    -- invoice_number, invoice_status, updated_at (plus anonymization scrub) may change.
    IF (OLD.subtotal_kurus <> NEW.subtotal_kurus) OR
       (OLD.discount_kurus <> NEW.discount_kurus) OR
       (OLD.delivery_fee_kurus <> NEW.delivery_fee_kurus) OR
       (OLD.total_kurus <> NEW.total_kurus) OR
       (OLD.min_order_kurus_applied <> NEW.min_order_kurus_applied) OR
       (OLD.business_date <> NEW.business_date) OR
       (OLD.order_number <> NEW.order_number) OR
       (OLD.idempotency_key <> NEW.idempotency_key) OR
       (OLD.payment_method <> NEW.payment_method) OR
       (OLD.order_type <> NEW.order_type) OR
       (OLD.delivery_zone_id IS DISTINCT FROM NEW.delivery_zone_id) OR
       (OLD.created_at IS DISTINCT FROM NEW.created_at) OR
       (NOT v_is_anonymizing AND (
           (OLD.user_id IS DISTINCT FROM NEW.user_id) OR
           (OLD.customer_name_snapshot IS DISTINCT FROM NEW.customer_name_snapshot) OR
           (OLD.customer_phone_snapshot IS DISTINCT FROM NEW.customer_phone_snapshot) OR
           (OLD.address_snapshot IS DISTINCT FROM NEW.address_snapshot) OR
           (OLD.customer_note IS DISTINCT FROM NEW.customer_note)
       )) THEN
        RAISE EXCEPTION 'Order core financial snapshot and identification columns are strictly immutable.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- 2. State transition graph
    IF OLD.status <> NEW.status THEN
        IF OLD.status = 'awaiting_payment' AND NEW.status IN ('new', 'cancelled') THEN
            NULL;
        ELSIF OLD.status = 'new' AND NEW.status IN ('accepted', 'rejected', 'cancelled') THEN
            NULL;
        ELSIF OLD.status = 'accepted' AND NEW.status IN ('on_the_way', 'cancelled') THEN
            NULL;
        ELSIF OLD.status = 'on_the_way' AND NEW.status IN ('delivered', 'cancelled') THEN
            NULL;
        ELSE
            RAISE EXCEPTION 'Invalid order status transition from % to % for order %', OLD.status, NEW.status, OLD.id
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        IF NEW.status = 'accepted' AND OLD.status = 'new' THEN
            NEW.accepted_at := clock_timestamp();

            -- Automatically enqueue kitchen ticket print job ONLY when order is accepted
            INSERT INTO public.print_jobs (order_id, kind, status)
            VALUES (NEW.id, 'kitchen_ticket', 'pending');

        ELSIF NEW.status = 'delivered' THEN
            NEW.delivered_at := clock_timestamp();
        ELSIF NEW.status IN ('cancelled', 'rejected') THEN
            NEW.cancelled_at := clock_timestamp();

            -- Restore coupon usage count upon cancellation/rejection
            BEGIN
                SELECT coupon_id INTO v_coupon_id
                FROM public.coupon_redemptions
                WHERE order_id = NEW.id;

                IF v_coupon_id IS NOT NULL THEN
                    UPDATE public.coupons
                    SET used_count = GREATEST(used_count - 1, 0)
                    WHERE id = v_coupon_id;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;

        BEGIN
            v_actor_type := COALESCE(NULLIF(current_setting('app.current_actor_type', true), ''), 'system');
            v_actor_id := NULLIF(current_setting('app.current_actor_id', true), '');
        EXCEPTION WHEN OTHERS THEN
            v_actor_type := 'system';
            v_actor_id := NULL;
        END;

        INSERT INTO public.order_events (order_id, from_status, to_status, actor_type, actor_id, note)
        VALUES (NEW.id, OLD.status, NEW.status, v_actor_type, v_actor_id, NEW.cancel_reason);
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_order_status_and_immutability_trigger() OWNER TO app_definer;

-- ----------------------------------------------------------------------------
-- 4. ORDER ITEMS IMMUTABILITY & DEFERRED MATH INTEGRITY TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_order_item_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status NOT IN ('new', 'awaiting_payment') THEN
            RAISE EXCEPTION 'Cannot add items to order % with status % (must be new or awaiting_payment)', NEW.order_id, v_order_status
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'order_items records are immutable and cannot be updated or deleted.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
END;
$$;

ALTER FUNCTION public.fn_enforce_order_item_immutability() OWNER TO app_definer;

CREATE OR REPLACE FUNCTION public.fn_enforce_order_item_options_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT o.status INTO v_order_status
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.id = NEW.order_item_id;

        IF v_order_status NOT IN ('new', 'awaiting_payment') THEN
            RAISE EXCEPTION 'Cannot add options to order item % because order status is %', NEW.order_item_id, v_order_status
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'order_item_options records are immutable and cannot be updated or deleted.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
END;
$$;

ALTER FUNCTION public.fn_enforce_order_item_options_immutability() OWNER TO app_definer;

-- Deferred trigger on order_items verifying:
-- line_total_kurus = (unit_price_snapshot_kurus + SUM(price_delta_snapshot_kurus)) * quantity
CREATE OR REPLACE FUNCTION public.fn_enforce_order_item_line_math()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_options_sum bigint;
    v_expected_line_total bigint;
BEGIN
    SELECT COALESCE(SUM(price_delta_snapshot_kurus), 0) INTO v_options_sum
    FROM public.order_item_options
    WHERE order_item_id = NEW.id;

    v_expected_line_total := (NEW.unit_price_snapshot_kurus + v_options_sum) * NEW.quantity;

    IF NEW.line_total_kurus <> v_expected_line_total THEN
        RAISE EXCEPTION 'Order item line_total_kurus (%) does not match (unit_price % + options %) * quantity % = %',
            NEW.line_total_kurus, NEW.unit_price_snapshot_kurus, v_options_sum, NEW.quantity, v_expected_line_total
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_enforce_order_item_line_math() OWNER TO app_definer;

DROP TRIGGER IF EXISTS trg_deferred_order_item_line_math ON public.order_items;
CREATE CONSTRAINT TRIGGER trg_deferred_order_item_line_math
AFTER INSERT ON public.order_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_order_item_line_math();

CREATE OR REPLACE FUNCTION public.fn_enforce_order_subtotal_matches_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_items_sum bigint;
    v_items_count integer;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(line_total_kurus), 0)
    INTO v_items_count, v_items_sum
    FROM public.order_items
    WHERE order_id = NEW.id;

    IF v_items_count = 0 THEN
        RAISE EXCEPTION 'Order % must contain at least one order_item at transaction commit', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_items_sum <> NEW.subtotal_kurus THEN
        RAISE EXCEPTION 'Order subtotal (%) does not match sum of order items (%). Tampering detected.',
            NEW.subtotal_kurus, v_items_sum
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.fn_enforce_order_subtotal_matches_items() OWNER TO app_definer;

-- ----------------------------------------------------------------------------
-- 5. RLS ON ORDERS: NO DIRECT CUSTOMER INSERT; HIDE awaiting_payment FROM STAFF
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_orders_customer_insert ON public.orders;
DROP POLICY IF EXISTS pol_order_items_customer_insert ON public.order_items;
DROP POLICY IF EXISTS pol_order_item_options_customer_insert ON public.order_item_options;
DROP POLICY IF EXISTS pol_coupon_redemptions_customer_insert ON public.coupon_redemptions;

-- Replace pol_orders_staff_all so kitchen/staff role cannot see 'awaiting_payment' orders,
-- while owner and system (webhook/expiry jobs) can see and transition them.
DROP POLICY IF EXISTS pol_orders_staff_all ON public.orders;
DROP POLICY IF EXISTS pol_orders_staff_operational ON public.orders;

CREATE POLICY pol_orders_staff_operational ON public.orders
FOR ALL TO app_api
USING (
    public.app_current_role() IN ('owner', 'system')
    OR (public.app_current_role() IN ('staff', 'print_agent') AND status <> 'awaiting_payment')
)
WITH CHECK (
    public.app_current_role() IN ('owner', 'system')
    OR (public.app_current_role() = 'staff' AND status <> 'awaiting_payment')
);

DROP POLICY IF EXISTS pol_order_items_print_agent_select ON public.order_items;
CREATE POLICY pol_order_items_print_agent_select ON public.order_items
FOR SELECT TO app_api
USING (public.app_current_role() = 'print_agent');

DROP POLICY IF EXISTS pol_order_item_options_print_agent_select ON public.order_item_options;
CREATE POLICY pol_order_item_options_print_agent_select ON public.order_item_options
FOR SELECT TO app_api
USING (public.app_current_role() = 'print_agent');

-- Allow customer to cancel their own order ONLY while it is in 'awaiting_payment' or 'new'
DROP POLICY IF EXISTS pol_orders_customer_cancel ON public.orders;
CREATE POLICY pol_orders_customer_cancel ON public.orders
FOR UPDATE TO app_api
USING (user_id = public.app_user_id() AND status IN ('awaiting_payment', 'new'))
WITH CHECK (user_id = public.app_user_id() AND status = 'cancelled');

-- ----------------------------------------------------------------------------
-- 6. SERVER-SIDE ORDER CREATION FUNCTION: public.create_order(...)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_order_type text,
    p_payment_method text,
    p_idempotency_key text,
    p_items jsonb,
    p_address_id uuid DEFAULT NULL,
    p_address_snapshot jsonb DEFAULT NULL,
    p_coupon_code text DEFAULT NULL,
    p_customer_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_user record;
    v_existing_order_id uuid;
    v_settings record;
    v_address record;
    v_addr_json jsonb := NULL;
    v_lat double precision;
    v_lng double precision;
    v_zone record;
    v_zone_id uuid := NULL;
    v_min_order_kurus bigint := 0;
    v_item_elem jsonb;
    v_menu_item record;
    v_item_name_tr text;
    v_qty integer;
    v_opt_id uuid;
    v_opt record;
    v_opt_name_tr text;
    v_item_options_delta bigint;
    v_line_total bigint;
    v_subtotal_kurus bigint := 0;
    v_discount_kurus bigint := 0;
    v_delivery_fee_kurus bigint := 0;
    v_total_kurus bigint := 0;
    v_coupon public.coupons%ROWTYPE;
    v_now_ist time;
    v_user_coupon_uses integer;
    v_prior_delivered integer;
    v_open_cod_orders integer;
    v_initial_status text;
    v_business_date date;
    v_order_number integer;
    v_order_id uuid;
    v_order_item_id uuid;
    v_grp record;
    v_selected_in_grp integer;
    v_selected_opt_ids uuid[];
    v_qualifying_item_found boolean := false;
BEGIN
    -- 1. Verify caller identity from session context
    v_user_id := public.app_user_id();
    v_role := public.app_current_role();

    IF v_user_id IS NULL OR v_role NOT IN ('customer', 'staff', 'owner', 'system') THEN
        RAISE EXCEPTION 'Authentication required to create an order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT id, phone, name, is_blocked, deleted_at
    INTO v_user
    FROM public.users
    WHERE id = v_user_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active user account not found'
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_user.is_blocked THEN
        RAISE EXCEPTION 'User account is blocked from placing orders'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
        RAISE EXCEPTION 'idempotency_key is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 2. Serialize concurrent identical (user_id, idempotency_key) requests via transaction-scoped advisory lock,
    --    then check if order already exists for (user_id, idempotency_key)
    PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_idempotency_key));

    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

    IF v_existing_order_id IS NOT NULL THEN
        RETURN v_existing_order_id;
    END IF;

    -- 3. Validate restaurant settings
    SELECT * INTO v_settings
    FROM public.restaurant_settings
    WHERE id = 1;

    IF NOT FOUND OR NOT v_settings.is_accepting_orders THEN
        RAISE EXCEPTION 'Restaurant is currently paused and not accepting orders'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_order_type NOT IN ('delivery', 'pickup') THEN
        RAISE EXCEPTION 'Invalid order_type: %', p_order_type
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_payment_method NOT IN ('card_online', 'cash_on_delivery') THEN
        RAISE EXCEPTION 'Invalid payment_method: %', p_payment_method
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 4. Delivery address & PostGIS zone validation
    IF p_order_type = 'delivery' THEN
        IF p_address_id IS NOT NULL THEN
            SELECT
                id, label, full_address, building, floor, apartment, notes,
                ST_Y(location::geometry) AS lat,
                ST_X(location::geometry) AS lng
            INTO v_address
            FROM public.addresses
            WHERE id = p_address_id AND user_id = v_user_id AND deleted_at IS NULL;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Delivery address not found or does not belong to user'
                    USING ERRCODE = 'no_data_found';
            END IF;

            v_lat := v_address.lat;
            v_lng := v_address.lng;
            v_addr_json := jsonb_build_object(
                'address_id', v_address.id,
                'label', v_address.label,
                'full_address', v_address.full_address,
                'building', v_address.building,
                'floor', v_address.floor,
                'apartment', v_address.apartment,
                'notes', v_address.notes,
                'lat', v_lat,
                'lng', v_lng
            );
        ELSIF p_address_snapshot IS NOT NULL AND jsonb_typeof(p_address_snapshot) = 'object' THEN
            IF NOT (p_address_snapshot ? 'lat' AND p_address_snapshot ? 'lng') THEN
                RAISE EXCEPTION 'address_snapshot must include lat and lng'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
            v_lat := (p_address_snapshot->>'lat')::double precision;
            v_lng := (p_address_snapshot->>'lng')::double precision;
            v_addr_json := p_address_snapshot;
        ELSE
            RAISE EXCEPTION 'Delivery order requires either address_id or address_snapshot'
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        SELECT * INTO v_zone
        FROM public.find_delivery_zone(v_lat, v_lng);

        IF NOT FOUND OR v_zone.id IS NULL THEN
            RAISE EXCEPTION 'Address coordinates (%, %) are outside our delivery zones', v_lat, v_lng
                USING ERRCODE = 'check_violation';
        END IF;

        v_zone_id := v_zone.id;
        v_min_order_kurus := v_zone.min_order_kurus;
    END IF;

    -- 5. Validate items array and compute subtotal in integer kuruş
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_now_ist := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::time;

    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item_elem->>'quantity')::integer, 0);
        IF v_qty <= 0 OR v_qty > 99 THEN
            RAISE EXCEPTION 'Invalid item quantity: %', v_qty
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        SELECT mi.*, c.is_active AS category_active
        INTO v_menu_item
        FROM public.menu_items mi
        JOIN public.categories c ON c.id = mi.category_id
        WHERE mi.id = (v_item_elem->>'menu_item_id')::uuid;

        IF NOT FOUND OR v_menu_item.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Menu item % does not exist', (v_item_elem->>'menu_item_id')
                USING ERRCODE = 'no_data_found';
        END IF;

        IF NOT v_menu_item.is_available OR NOT v_menu_item.category_active THEN
            RAISE EXCEPTION 'Menu item % is currently unavailable (sold out)', v_menu_item.id
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_menu_item.available_from IS NOT NULL AND v_menu_item.available_until IS NOT NULL THEN
            IF v_menu_item.available_from <= v_menu_item.available_until THEN
                IF v_now_ist < v_menu_item.available_from OR v_now_ist > v_menu_item.available_until THEN
                    RAISE EXCEPTION 'Menu item % is outside its available hours', v_menu_item.id
                        USING ERRCODE = 'check_violation';
                END IF;
            ELSE
                IF v_now_ist < v_menu_item.available_from AND v_now_ist > v_menu_item.available_until THEN
                    RAISE EXCEPTION 'Menu item % is outside its available hours', v_menu_item.id
                        USING ERRCODE = 'check_violation';
                END IF;
            END IF;
        END IF;

        -- Extract selected option IDs for this item
        v_selected_opt_ids := ARRAY[]::uuid[];
        IF v_item_elem ? 'option_ids' AND jsonb_typeof(v_item_elem->'option_ids') = 'array' THEN
            SELECT COALESCE(array_agg((elem)::uuid), ARRAY[]::uuid[])
            INTO v_selected_opt_ids
            FROM jsonb_array_elements_text(v_item_elem->'option_ids') AS elem;
        END IF;

        -- Ensure no duplicate option IDs in the same order item
        IF array_length(v_selected_opt_ids, 1) IS NOT NULL THEN
            IF (SELECT count(DISTINCT u) FROM unnest(v_selected_opt_ids) AS u) <> array_length(v_selected_opt_ids, 1) THEN
                RAISE EXCEPTION 'Duplicate option_id provided for menu item %', v_menu_item.id
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;
        END IF;

        -- Validate every selected option belongs to an option_group of this menu_item and is_available
        v_item_options_delta := 0;
        IF array_length(v_selected_opt_ids, 1) IS NOT NULL THEN
            FOREACH v_opt_id IN ARRAY v_selected_opt_ids
            LOOP
                SELECT o.*, og.menu_item_id
                INTO v_opt
                FROM public.options o
                JOIN public.option_groups og ON og.id = o.option_group_id
                WHERE o.id = v_opt_id;

                IF NOT FOUND OR v_opt.menu_item_id <> v_menu_item.id THEN
                    RAISE EXCEPTION 'Option % does not belong to menu item %', v_opt_id, v_menu_item.id
                        USING ERRCODE = 'check_violation';
                END IF;

                IF NOT v_opt.is_available THEN
                    RAISE EXCEPTION 'Option % is currently unavailable', v_opt_id
                        USING ERRCODE = 'check_violation';
                END IF;

                v_item_options_delta := v_item_options_delta + v_opt.price_delta_kurus;
            END LOOP;
        END IF;

        -- Enforce option_group min_select / max_select / is_required rules
        FOR v_grp IN
            SELECT * FROM public.option_groups WHERE menu_item_id = v_menu_item.id AND is_active = true
        LOOP
            SELECT count(*) INTO v_selected_in_grp
            FROM public.options o
            WHERE o.option_group_id = v_grp.id
              AND o.id = ANY(v_selected_opt_ids);

            IF (v_grp.is_required AND v_selected_in_grp < GREATEST(v_grp.min_select, 1))
               OR v_selected_in_grp < v_grp.min_select THEN
                RAISE EXCEPTION 'Option group % requires at least % selection(s), got %',
                    v_grp.id, GREATEST(v_grp.min_select, CASE WHEN v_grp.is_required THEN 1 ELSE 0 END), v_selected_in_grp
                    USING ERRCODE = 'check_violation';
            END IF;

            IF v_selected_in_grp > v_grp.max_select THEN
                RAISE EXCEPTION 'Option group % allows at most % selection(s), got %',
                    v_grp.id, v_grp.max_select, v_selected_in_grp
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;

        v_line_total := (v_menu_item.price_kurus + v_item_options_delta) * v_qty;
        v_subtotal_kurus := v_subtotal_kurus + v_line_total;
    END LOOP;

    -- 6. Validate and calculate coupon discount (if coupon code provided)
    IF p_coupon_code IS NOT NULL AND length(btrim(p_coupon_code)) > 0 THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE code = btrim(p_coupon_code)::citext
        FOR UPDATE;

        IF NOT FOUND OR NOT v_coupon.is_active THEN
            RAISE EXCEPTION 'Coupon % is invalid or inactive', p_coupon_code
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_coupon.starts_at IS NOT NULL AND clock_timestamp() < v_coupon.starts_at THEN
            RAISE EXCEPTION 'Coupon % is not yet active', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_coupon.ends_at IS NOT NULL AND clock_timestamp() > v_coupon.ends_at THEN
            RAISE EXCEPTION 'Coupon % has expired', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_subtotal_kurus < v_coupon.min_order_kurus THEN
            RAISE EXCEPTION 'Order subtotal (%) is below coupon minimum spend requirement (%)',
                v_subtotal_kurus, v_coupon.min_order_kurus
                USING ERRCODE = 'check_violation';
        END IF;

        IF v_coupon.type = 'percent' THEN
            v_discount_kurus := round((v_subtotal_kurus * v_coupon.value) / 100.0);
            IF v_coupon.max_discount_kurus IS NOT NULL THEN
                v_discount_kurus := LEAST(v_discount_kurus, v_coupon.max_discount_kurus);
            END IF;
        ELSIF v_coupon.type = 'fixed_amount' THEN
            v_discount_kurus := LEAST(v_coupon.value, v_subtotal_kurus);
        ELSE
            v_discount_kurus := 0;
        END IF;
    END IF;

    -- Delivery is always free in Kardeşler Cihangir
    v_delivery_fee_kurus := 0;
    v_total_kurus := v_subtotal_kurus - v_discount_kurus + v_delivery_fee_kurus;

    -- 7. Enforce delivery zone minimum AFTER discount
    IF p_order_type = 'delivery' AND v_total_kurus < v_min_order_kurus THEN
        RAISE EXCEPTION 'Post-discount total (% kuruş) is below delivery zone minimum (% kuruş)',
            v_total_kurus, v_min_order_kurus
            USING ERRCODE = 'check_violation';
    END IF;

    -- 8. Enforce Cash-on-Delivery (COD) anti-fraud limits
    IF p_payment_method = 'cash_on_delivery' THEN
        IF v_total_kurus > v_settings.cod_max_amount_kurus THEN
            RAISE EXCEPTION 'Cash on delivery is not available for orders exceeding % kuruş',
                v_settings.cod_max_amount_kurus
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT count(*) INTO v_open_cod_orders
        FROM public.orders
        WHERE user_id = v_user_id
          AND payment_method = 'cash_on_delivery'
          AND status IN ('new', 'accepted', 'on_the_way');

        IF v_open_cod_orders >= v_settings.cod_max_open_orders THEN
            RAISE EXCEPTION 'Maximum number of concurrent open Cash on Delivery orders (%) reached',
                v_settings.cod_max_open_orders
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 9. Insert Order Header
    v_initial_status := CASE WHEN p_payment_method = 'card_online' THEN 'awaiting_payment' ELSE 'new' END;
    v_business_date := public.business_date_of(clock_timestamp());
    v_order_number := public.next_order_number(v_business_date);

    INSERT INTO public.orders (
        user_id,
        order_type,
        status,
        business_date,
        order_number,
        idempotency_key,
        subtotal_kurus,
        discount_kurus,
        delivery_fee_kurus,
        total_kurus,
        min_order_kurus_applied,
        address_snapshot,
        customer_name_snapshot,
        customer_phone_snapshot,
        customer_note,
        payment_method,
        delivery_zone_id,
        invoice_status
    ) VALUES (
        v_user_id,
        p_order_type,
        v_initial_status,
        v_business_date,
        v_order_number,
        p_idempotency_key,
        v_subtotal_kurus,
        v_discount_kurus,
        v_delivery_fee_kurus,
        v_total_kurus,
        v_min_order_kurus,
        v_addr_json,
        COALESCE(NULLIF(btrim(v_user.name), ''), 'Müşteri'),
        v_user.phone,
        NULLIF(btrim(p_customer_note), ''),
        p_payment_method,
        v_zone_id,
        'not_required'
    ) RETURNING id INTO v_order_id;

    -- 10. Insert Order Items and Order Item Options (Turkish snapshots for kitchen ticket)
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item_elem->>'quantity')::integer;

        SELECT mi.* INTO v_menu_item
        FROM public.menu_items mi
        WHERE mi.id = (v_item_elem->>'menu_item_id')::uuid;

        SELECT mit.name INTO v_item_name_tr
        FROM public.menu_item_translations mit
        WHERE mit.menu_item_id = v_menu_item.id AND mit.language = 'tr';

        v_selected_opt_ids := ARRAY[]::uuid[];
        IF v_item_elem ? 'option_ids' AND jsonb_typeof(v_item_elem->'option_ids') = 'array' THEN
            SELECT COALESCE(array_agg((elem)::uuid), ARRAY[]::uuid[])
            INTO v_selected_opt_ids
            FROM jsonb_array_elements_text(v_item_elem->'option_ids') AS elem;
        END IF;

        v_item_options_delta := 0;
        IF array_length(v_selected_opt_ids, 1) IS NOT NULL THEN
            SELECT COALESCE(SUM(o.price_delta_kurus), 0) INTO v_item_options_delta
            FROM public.options o
            WHERE o.id = ANY(v_selected_opt_ids);
        END IF;

        v_line_total := (v_menu_item.price_kurus + v_item_options_delta) * v_qty;

        INSERT INTO public.order_items (
            order_id,
            menu_item_id,
            name_snapshot,
            unit_price_snapshot_kurus,
            vat_rate_snapshot,
            quantity,
            line_total_kurus
        ) VALUES (
            v_order_id,
            v_menu_item.id,
            COALESCE(v_item_name_tr, 'Ürün'),
            v_menu_item.price_kurus,
            v_menu_item.vat_rate_percent,
            v_qty,
            v_line_total
        ) RETURNING id INTO v_order_item_id;

        IF array_length(v_selected_opt_ids, 1) IS NOT NULL THEN
            FOREACH v_opt_id IN ARRAY v_selected_opt_ids
            LOOP
                SELECT o.* INTO v_opt
                FROM public.options o
                WHERE o.id = v_opt_id;

                SELECT ot.name INTO v_opt_name_tr
                FROM public.option_translations ot
                WHERE ot.option_id = v_opt.id AND ot.language = 'tr';

                INSERT INTO public.order_item_options (
                    order_item_id,
                    option_id,
                    name_snapshot,
                    price_delta_snapshot_kurus
                ) VALUES (
                    v_order_item_id,
                    v_opt.id,
                    COALESCE(v_opt_name_tr, 'Seçenek'),
                    v_opt.price_delta_kurus
                );
            END LOOP;
        END IF;
    END LOOP;

    -- 11. Redeem coupon (validates applies_to against inserted order_items, per-user limits, active_hours)
    IF v_coupon.id IS NOT NULL THEN
        PERFORM public.redeem_coupon(v_coupon.id, v_user_id, v_order_id, v_discount_kurus);
    END IF;

    -- 12. Create initial payment record
    INSERT INTO public.payments (
        order_id,
        method,
        status,
        amount_kurus,
        provider
    ) VALUES (
        v_order_id,
        p_payment_method,
        'pending',
        v_total_kurus,
        CASE WHEN p_payment_method = 'card_online' THEN 'iyzico' ELSE 'cash' END
    );

    RETURN v_order_id;
END;
$$;

ALTER FUNCTION public.create_order(text, text, text, jsonb, uuid, jsonb, text, text) OWNER TO app_definer;

REVOKE EXECUTE ON FUNCTION public.create_order(text, text, text, jsonb, uuid, jsonb, text, text) FROM PUBLIC, app_readonly;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, text, jsonb, uuid, jsonb, text, text) TO app_api, app_definer, app_migrator;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_definer, app_migrator;

COMMIT;
