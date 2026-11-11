-- ============================================================================
-- Migration: 004_orders.sql (Hardened Production Grade)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Orders schema: business day logic, atomic order numbering,
--              server-enforced order defaults, subtotal-to-items validation,
--              expanded snapshot immutability, coupon restoration on cancel,
--              and foreign key indexes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUSINESS DAY & CONCURRENT ORDER NUMBERING
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_date_of(p_ts timestamptz)
RETURNS date AS $$
DECLARE
    v_cutoff time := '06:00:00';
BEGIN
    SELECT business_day_cutoff INTO v_cutoff
    FROM restaurant_settings
    LIMIT 1;

    IF v_cutoff IS NULL THEN
        v_cutoff := '06:00:00';
    END IF;

    -- Local Europe/Istanbul time projected backwards by shift cutoff
    RETURN ((p_ts AT TIME ZONE 'Europe/Istanbul') - v_cutoff)::date;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION business_date_of(timestamptz) IS 'Calculates restaurant business date relative to Europe/Istanbul shift cutoff across midnight.';

CREATE TABLE daily_order_counters (
    business_date date PRIMARY KEY,
    last_order_number integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION next_order_number(p_business_date date)
RETURNS integer AS $$
DECLARE
    v_num integer;
BEGIN
    INSERT INTO daily_order_counters (business_date, last_order_number)
    VALUES (p_business_date, 1)
    ON CONFLICT (business_date)
    DO UPDATE SET
        last_order_number = daily_order_counters.last_order_number + 1,
        updated_at = clock_timestamp()
    RETURNING last_order_number INTO v_num;

    RETURN v_num;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. ORDERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    order_type text NOT NULL,
    status text NOT NULL DEFAULT 'new',
    business_date date NOT NULL,
    order_number integer NOT NULL,
    idempotency_key text NOT NULL,

    -- Financial snapshot (all in integer kuruş, CHECK >= 0)
    subtotal_kurus bigint NOT NULL,
    discount_kurus bigint NOT NULL DEFAULT 0,
    delivery_fee_kurus bigint NOT NULL DEFAULT 0,
    total_kurus bigint NOT NULL,
    min_order_kurus_applied bigint NOT NULL DEFAULT 0,

    -- Customer & Delivery Snapshots
    address_snapshot jsonb,
    customer_name_snapshot text NOT NULL,
    customer_phone_snapshot text NOT NULL,
    customer_note text,
    payment_method text NOT NULL,
    delivery_zone_id uuid,
    driver_id uuid,

    -- Lifecycle timestamps
    accepted_at timestamptz,
    delivered_at timestamptz,
    cancelled_at timestamptz,
    cancel_reason text,

    -- e-Arşiv integration
    invoice_number text,
    invoice_status text NOT NULL DEFAULT 'not_required',

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_delivery_zone FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE RESTRICT,
    CONSTRAINT fk_orders_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,

    CONSTRAINT uq_orders_business_number UNIQUE (business_date, order_number),
    CONSTRAINT uq_orders_user_idempotency UNIQUE (user_id, idempotency_key),

    CONSTRAINT chk_orders_type CHECK (order_type IN ('delivery', 'pickup')),
    CONSTRAINT chk_orders_status CHECK (status IN ('new', 'accepted', 'on_the_way', 'delivered', 'cancelled', 'rejected')),
    CONSTRAINT chk_orders_payment_method CHECK (payment_method IN ('card_online', 'cash_on_delivery')),
    CONSTRAINT chk_orders_invoice_status CHECK (invoice_status IN ('not_required', 'pending', 'issued', 'failed')),
    CONSTRAINT chk_orders_customer_note_len CHECK (customer_note IS NULL OR length(customer_note) <= 100),

    -- Financial invariant constraints
    CONSTRAINT chk_orders_subtotal_non_neg CHECK (subtotal_kurus >= 0),
    CONSTRAINT chk_orders_discount_non_neg CHECK (discount_kurus >= 0),
    CONSTRAINT chk_orders_delivery_fee_non_neg CHECK (delivery_fee_kurus >= 0),
    CONSTRAINT chk_orders_total_non_neg CHECK (total_kurus >= 0),
    CONSTRAINT chk_orders_discount_le_subtotal CHECK (discount_kurus <= subtotal_kurus),
    CONSTRAINT chk_orders_total_math CHECK (total_kurus = subtotal_kurus - discount_kurus + delivery_fee_kurus),
    CONSTRAINT chk_orders_min_order_met CHECK (total_kurus >= min_order_kurus_applied)
);

CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_active_status ON orders(status, created_at) WHERE status IN ('new', 'accepted', 'on_the_way');
CREATE INDEX idx_orders_business_date ON orders(business_date, order_number);
CREATE INDEX idx_orders_driver ON orders(driver_id);
CREATE INDEX idx_orders_delivery_zone ON orders(delivery_zone_id);

CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Enforce server defaults and protect against customer injection of statuses/dates
CREATE OR REPLACE FUNCTION fn_orders_enforce_defaults()
RETURNS TRIGGER AS $$
DECLARE
    v_is_staff boolean;
BEGIN
    BEGIN
        v_is_staff := COALESCE(current_setting('app.current_role', true) IN ('staff', 'owner', 'system'), false);
    EXCEPTION WHEN OTHERS THEN
        v_is_staff := false;
    END;

    IF NOT v_is_staff AND NULLIF(current_setting('app.current_role', true), '') IS NULL AND session_user IN ('postgres', 'app_migrator') THEN
        v_is_staff := true;
    END IF;

    -- If created by non-staff (customer or standard API):
    IF NOT v_is_staff THEN
        NEW.status := 'new';
        NEW.business_date := business_date_of(clock_timestamp());
        NEW.order_number := next_order_number(NEW.business_date);
        NEW.invoice_status := 'not_required';
        NEW.invoice_number := NULL;
        NEW.accepted_at := NULL;
        NEW.delivered_at := NULL;
        NEW.cancelled_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_enforce_defaults
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION fn_orders_enforce_defaults();

-- ----------------------------------------------------------------------------
-- 3. ORDER ITEMS & ORDER ITEM OPTIONS (IMMUTABLE)
-- ----------------------------------------------------------------------------
CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    name_snapshot text NOT NULL,
    unit_price_snapshot_kurus bigint NOT NULL,
    vat_rate_snapshot integer NOT NULL,
    quantity integer NOT NULL,
    line_total_kurus bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT,
    CONSTRAINT chk_order_items_quantity_pos CHECK (quantity > 0),
    CONSTRAINT chk_order_items_unit_price CHECK (unit_price_snapshot_kurus >= 0),
    CONSTRAINT chk_order_items_line_total CHECK (line_total_kurus >= 0),
    CONSTRAINT chk_order_items_vat_rate CHECK (vat_rate_snapshot >= 0),
    CONSTRAINT chk_order_items_line_math CHECK (line_total_kurus >= unit_price_snapshot_kurus * quantity)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_menu_item ON order_items(menu_item_id);

CREATE TABLE order_item_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL,
    option_id uuid NOT NULL,
    name_snapshot text NOT NULL,
    price_delta_snapshot_kurus bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_order_item_options_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_item_options_option FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE RESTRICT
);

CREATE INDEX idx_order_item_options_item ON order_item_options(order_item_id);
CREATE INDEX idx_order_item_options_option ON order_item_options(option_id);

-- Enforce immutability on order items
CREATE OR REPLACE FUNCTION fn_enforce_order_item_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_order_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_order_status
        FROM orders
        WHERE id = NEW.order_id;

        IF v_order_status <> 'new' THEN
            RAISE EXCEPTION 'Cannot add items to order % with status % (must be new)', NEW.order_id, v_order_status
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'order_items records are immutable and cannot be updated or deleted.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION fn_enforce_order_item_immutability();

CREATE OR REPLACE FUNCTION fn_enforce_order_item_options_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_order_status text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT o.status INTO v_order_status
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = NEW.order_item_id;

        IF v_order_status <> 'new' THEN
            RAISE EXCEPTION 'Cannot add options to order item % because order status is %', NEW.order_item_id, v_order_status
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'order_item_options records are immutable and cannot be updated or deleted.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_item_options_immutability
BEFORE INSERT OR UPDATE OR DELETE ON order_item_options
FOR EACH ROW EXECUTE FUNCTION fn_enforce_order_item_options_immutability();

-- ----------------------------------------------------------------------------
-- 4. ORDER SUBTOTAL & ITEMS MATH INTEGRITY CONSTRAINT
-- ----------------------------------------------------------------------------
-- Enforces that an order's subtotal MUST match the exact sum of its order_items line_total
CREATE OR REPLACE FUNCTION fn_enforce_order_subtotal_matches_items()
RETURNS TRIGGER AS $$
DECLARE
    v_items_sum bigint;
BEGIN
    SELECT COALESCE(sum(line_total_kurus), 0) INTO v_items_sum
    FROM order_items
    WHERE order_id = NEW.id;

    -- Allow zero sum only if order has no items yet during creation transaction,
    -- but at COMMIT time, sum must equal subtotal_kurus!
    IF v_items_sum <> NEW.subtotal_kurus THEN
        RAISE EXCEPTION 'Order subtotal (%) does not match sum of order items (%). Tampering detected.',
            NEW.subtotal_kurus, v_items_sum
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_deferred_order_subtotal_integrity
AFTER INSERT OR UPDATE OF subtotal_kurus ON orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_order_subtotal_matches_items();

-- ----------------------------------------------------------------------------
-- 5. ORDER EVENTS (APPEND-ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE order_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    note text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT chk_order_events_from_status CHECK (from_status IS NULL OR from_status IN ('new', 'accepted', 'on_the_way', 'delivered', 'cancelled', 'rejected')),
    CONSTRAINT chk_order_events_to_status CHECK (to_status IN ('new', 'accepted', 'on_the_way', 'delivered', 'cancelled', 'rejected')),
    CONSTRAINT chk_order_events_actor_type CHECK (actor_type IN ('customer', 'staff', 'driver', 'system'))
);

CREATE INDEX idx_order_events_order ON order_events(order_id);
CREATE INDEX idx_order_events_order_time ON order_events(order_id, created_at ASC);

CREATE TRIGGER trg_order_events_prevent_mutation
BEFORE UPDATE OR DELETE ON order_events
FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

CREATE TRIGGER trg_order_events_prevent_truncate
BEFORE TRUNCATE ON order_events
FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_mutation();

-- ----------------------------------------------------------------------------
-- 6. ORDER STATUS MACHINE & COMPREHENSIVE IMMUTABILITY
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_order_status_and_immutability_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_type text := 'system';
    v_actor_id text := NULL;
    v_coupon_id uuid;
BEGIN
    -- 1. Expanded Immutability: Block modification of financial AND snapshot columns!
    IF (OLD.subtotal_kurus <> NEW.subtotal_kurus) OR
       (OLD.discount_kurus <> NEW.discount_kurus) OR
       (OLD.delivery_fee_kurus <> NEW.delivery_fee_kurus) OR
       (OLD.total_kurus <> NEW.total_kurus) OR
       (OLD.min_order_kurus_applied <> NEW.min_order_kurus_applied) OR
       (OLD.business_date <> NEW.business_date) OR
       (OLD.order_number <> NEW.order_number) OR
       (OLD.idempotency_key <> NEW.idempotency_key) OR
       (OLD.customer_name_snapshot <> NEW.customer_name_snapshot AND NEW.customer_name_snapshot NOT LIKE 'Kullanıcı Silindi%') OR
       (OLD.customer_phone_snapshot <> NEW.customer_phone_snapshot AND NEW.customer_phone_snapshot <> '+900000000000') OR
       (OLD.payment_method <> NEW.payment_method) OR
       (OLD.order_type <> NEW.order_type) OR
       (OLD.user_id IS DISTINCT FROM NEW.user_id) OR
       (OLD.delivery_zone_id IS DISTINCT FROM NEW.delivery_zone_id) THEN
        RAISE EXCEPTION 'Order core financial snapshot and identification columns are strictly immutable.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- 2. State transition graph
    IF OLD.status <> NEW.status THEN
        IF OLD.status = 'new' AND NEW.status IN ('accepted', 'rejected', 'cancelled') THEN
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
        ELSIF NEW.status = 'delivered' THEN
            NEW.delivered_at := clock_timestamp();
        ELSIF NEW.status IN ('cancelled', 'rejected') THEN
            NEW.cancelled_at := clock_timestamp();

            -- COUPON RESTORATION UPON CANCELLATION:
            -- If order had a redeemed coupon, decrement used_count so customer does not burn their voucher!
            BEGIN
                SELECT coupon_id INTO v_coupon_id
                FROM coupon_redemptions
                WHERE order_id = NEW.id;

                IF v_coupon_id IS NOT NULL THEN
                    UPDATE coupons
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

        INSERT INTO order_events (order_id, from_status, to_status, actor_type, actor_id, note)
        VALUES (NEW.id, OLD.status, NEW.status, v_actor_type, v_actor_id, NEW.cancel_reason);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_orders_lifecycle_and_immutability
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_order_status_and_immutability_trigger();

CREATE OR REPLACE FUNCTION fn_order_created_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO order_events (order_id, from_status, to_status, actor_type, actor_id, note)
    VALUES (NEW.id, NULL, NEW.status, 'customer', NEW.user_id::text, 'Sipariş oluşturuldu (Order created)');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_created_event
AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION fn_order_created_event();

-- ----------------------------------------------------------------------------
-- 7. PAYMENTS & THERMAL PRINT JOBS
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    method text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    amount_kurus bigint NOT NULL,
    provider text NOT NULL,
    provider_ref text,
    provider_event_id text UNIQUE,
    failure_reason text,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT chk_payments_method CHECK (method IN ('card_online', 'cash_on_delivery')),
    CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded')),
    CONSTRAINT chk_payments_amount_non_neg CHECK (amount_kurus >= 0)
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE UNIQUE INDEX idx_payments_provider_ref ON payments(provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE print_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    kind text NOT NULL DEFAULT 'kitchen_ticket',
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    printed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_print_jobs_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT chk_print_jobs_kind CHECK (kind IN ('kitchen_ticket', 'reprint')),
    CONSTRAINT chk_print_jobs_status CHECK (status IN ('pending', 'printing', 'printed', 'failed')),
    CONSTRAINT chk_print_jobs_attempts CHECK (attempts >= 0)
);

CREATE INDEX idx_print_jobs_order ON print_jobs(order_id);
CREATE INDEX idx_print_jobs_pending ON print_jobs(status, created_at ASC)
WHERE status IN ('pending', 'failed');

CREATE TRIGGER trg_print_jobs_updated_at
BEFORE UPDATE ON print_jobs
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
