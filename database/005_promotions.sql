-- ============================================================================
-- Migration: 005_promotions.sql (Hardened Production Grade)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Growth and promotions schema: coupons, targeted coupon rules,
--              hardened redeem_coupon with discount & category verification,
--              referrals, loyalty ledger, loyalty balances, and foreign key indexes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COUPONS & TARGETING RULES
-- ----------------------------------------------------------------------------
CREATE TABLE coupons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code citext UNIQUE NOT NULL,
    type text NOT NULL,
    value bigint NOT NULL,
    max_discount_kurus bigint,
    min_order_kurus bigint NOT NULL DEFAULT 0,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    max_total_uses integer,
    max_uses_per_user integer NOT NULL DEFAULT 1,
    first_order_only boolean NOT NULL DEFAULT false,
    applies_to text NOT NULL DEFAULT 'all',
    active_hours jsonb,
    is_active boolean NOT NULL DEFAULT true,
    used_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_coupons_type CHECK (type IN ('percent', 'fixed_amount', 'free_item')),
    CONSTRAINT chk_coupons_value_pos CHECK (value > 0),
    CONSTRAINT chk_coupons_max_discount CHECK (max_discount_kurus IS NULL OR max_discount_kurus >= 0),
    CONSTRAINT chk_coupons_min_order CHECK (min_order_kurus >= 0),
    CONSTRAINT chk_coupons_date_range CHECK (ends_at > starts_at),
    CONSTRAINT chk_coupons_max_total_uses CHECK (max_total_uses IS NULL OR max_total_uses > 0),
    CONSTRAINT chk_coupons_max_per_user CHECK (max_uses_per_user > 0),
    CONSTRAINT chk_coupons_used_count_non_neg CHECK (used_count >= 0),
    CONSTRAINT chk_coupons_applies_to CHECK (applies_to IN ('all', 'categories', 'items'))
);

CREATE INDEX idx_coupons_active_dates ON coupons(starts_at, ends_at) WHERE is_active = true;

CREATE TRIGGER trg_coupons_updated_at
BEFORE UPDATE ON coupons
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_audit_coupons
AFTER INSERT OR UPDATE OR DELETE ON coupons
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

CREATE TABLE coupon_categories (
    coupon_id uuid NOT NULL,
    category_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT pk_coupon_categories PRIMARY KEY (coupon_id, category_id),
    CONSTRAINT fk_coupon_categories_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_categories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX idx_coupon_categories_cat ON coupon_categories(category_id);

CREATE TABLE coupon_menu_items (
    coupon_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT pk_coupon_menu_items PRIMARY KEY (coupon_id, menu_item_id),
    CONSTRAINT fk_coupon_menu_items_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_menu_items_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_coupon_menu_items_item ON coupon_menu_items(menu_item_id);

-- ----------------------------------------------------------------------------
-- 2. COUPON REDEMPTIONS & HARDENED VERIFICATION FUNCTION
-- ----------------------------------------------------------------------------
CREATE TABLE coupon_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid NOT NULL,
    discount_kurus bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE RESTRICT,
    CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT uq_coupon_redemptions_order UNIQUE (order_id),
    CONSTRAINT chk_coupon_redemptions_discount CHECK (discount_kurus >= 0)
);

CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX idx_coupon_redemptions_coupon_user ON coupon_redemptions(coupon_id, user_id);

CREATE OR REPLACE FUNCTION redeem_coupon(
    p_coupon_id uuid,
    p_user_id uuid,
    p_order_id uuid,
    p_discount_kurus bigint
)
RETURNS uuid
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_coupon coupons%ROWTYPE;
    v_order orders%ROWTYPE;
    v_user_uses integer;
    v_prior_orders integer;
    v_redemption_id uuid;
    v_expected_discount bigint;
    v_caller_user_id uuid;
    v_is_staff boolean;
    v_current_time_istanbul time;
    v_has_target_item boolean;
BEGIN
    -- 1. Authorization Check:
    -- Caller must be the user themselves or staff/owner
    BEGIN
        v_caller_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
        v_is_staff := COALESCE(current_setting('app.current_role', true) IN ('staff', 'owner', 'system'), false);
    EXCEPTION WHEN OTHERS THEN
        v_caller_user_id := NULL;
        v_is_staff := false;
    END;

    IF NOT v_is_staff AND NULLIF(current_setting('app.current_role', true), '') IS NULL AND session_user IN ('postgres', 'app_migrator') THEN
        v_is_staff := true;
    END IF;

    IF NOT v_is_staff AND (v_caller_user_id IS NULL OR v_caller_user_id <> p_user_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot redeem coupons on behalf of another patron'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Verify Order Existence and Ownership
    SELECT * INTO v_order
    FROM orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_order.user_id IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Order % does not belong to user %', p_order_id, p_user_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_order.status <> 'new' THEN
        RAISE EXCEPTION 'Coupons can only be redeemed on orders with status "new" (current: %)', v_order.status
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Lock Coupon row exclusively for concurrency protection
    SELECT * INTO v_coupon
    FROM coupons
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

    -- 4. Active Hours Validation (if configured)
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

    -- 5. Scope / Target Validation (applies_to)
    IF v_coupon.applies_to = 'categories' THEN
        SELECT EXISTS (
            SELECT 1 FROM order_items oi
            JOIN menu_items mi ON mi.id = oi.menu_item_id
            JOIN coupon_categories cc ON cc.category_id = mi.category_id
            WHERE oi.order_id = p_order_id AND cc.coupon_id = p_coupon_id
        ) INTO v_has_target_item;

        IF NOT v_has_target_item THEN
            RAISE EXCEPTION 'Coupon % only applies to specific categories not present in this order', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF v_coupon.applies_to = 'items' THEN
        SELECT EXISTS (
            SELECT 1 FROM order_items oi
            JOIN coupon_menu_items cmi ON cmi.menu_item_id = oi.menu_item_id
            WHERE oi.order_id = p_order_id AND cmi.coupon_id = p_coupon_id
        ) INTO v_has_target_item;

        IF NOT v_has_target_item THEN
            RAISE EXCEPTION 'Coupon % only applies to specific items not present in this order', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 6. Usage Caps
    IF v_coupon.max_total_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_total_uses THEN
        RAISE EXCEPTION 'Coupon % has reached its total usage limit', v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_user_uses
    FROM coupon_redemptions
    WHERE coupon_id = p_coupon_id AND user_id = p_user_id;

    IF v_user_uses >= v_coupon.max_uses_per_user THEN
        RAISE EXCEPTION 'User has already reached maximum allowable redemptions for coupon %', v_coupon.code
            USING ERRCODE = 'check_violation';
    END IF;

    -- 7. First Order Only Check
    IF v_coupon.first_order_only THEN
        SELECT count(*) INTO v_prior_orders
        FROM orders
        WHERE user_id = p_user_id
          AND status = 'delivered'
          AND id <> p_order_id;

        IF v_prior_orders > 0 THEN
            RAISE EXCEPTION 'Coupon % is valid only for first-time orders', v_coupon.code
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 8. Minimum Spend Check
    IF v_order.subtotal_kurus < v_coupon.min_order_kurus THEN
        RAISE EXCEPTION 'Order subtotal (%) is below coupon minimum spend requirement (%)',
            v_order.subtotal_kurus, v_coupon.min_order_kurus
            USING ERRCODE = 'check_violation';
    END IF;

    -- 9. Authoritative Discount Math Verification:
    -- Never accept arbitrary discount from caller!
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

    -- 10. Record Redemption and Increment Count
    INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_kurus)
    VALUES (p_coupon_id, p_user_id, p_order_id, p_discount_kurus)
    RETURNING id INTO v_redemption_id;

    UPDATE coupons
    SET used_count = used_count + 1
    WHERE id = p_coupon_id;

    RETURN v_redemption_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. REFERRAL SYSTEM
-- ----------------------------------------------------------------------------
CREATE TABLE referrals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id uuid NOT NULL,
    referred_user_id uuid NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pending',
    order_id uuid,
    rewarded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_referrals_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT chk_referrals_distinct_users CHECK (referrer_user_id <> referred_user_id),
    CONSTRAINT chk_referrals_status CHECK (status IN ('pending', 'rewarded'))
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_user_id);
CREATE INDEX idx_referrals_order ON referrals(order_id);

CREATE TRIGGER trg_referrals_updated_at
BEFORE UPDATE ON referrals
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. LOYALTY LEDGER & BALANCES VIEW (APPEND-ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE loyalty_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    points integer NOT NULL,
    reason text NOT NULL,
    order_id uuid,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_loyalty_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_loyalty_ledger_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT chk_loyalty_ledger_points_nonzero CHECK (points <> 0)
);

CREATE INDEX idx_loyalty_ledger_user ON loyalty_ledger(user_id, created_at DESC);
CREATE INDEX idx_loyalty_ledger_order ON loyalty_ledger(order_id);

CREATE TRIGGER trg_loyalty_ledger_prevent_mutation
BEFORE UPDATE OR DELETE ON loyalty_ledger
FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

CREATE TRIGGER trg_loyalty_ledger_prevent_truncate
BEFORE TRUNCATE ON loyalty_ledger
FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_mutation();

-- View defined with security_invoker = false (security definer) so it computes balances under RLS
CREATE OR REPLACE VIEW loyalty_balances WITH (security_invoker = false) AS
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
FROM loyalty_ledger
GROUP BY user_id;

-- ----------------------------------------------------------------------------
-- 5. BANNERS
-- ----------------------------------------------------------------------------
CREATE TABLE banners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url text NOT NULL,
    title_translations jsonb NOT NULL,
    target_type text NOT NULL,
    target_id text,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_banners_target_type CHECK (target_type IN ('item', 'coupon', 'none')),
    CONSTRAINT chk_banners_dates CHECK (ends_at > starts_at)
);

CREATE INDEX idx_banners_active ON banners(sort_order ASC) WHERE is_active = true;

CREATE TRIGGER trg_banners_updated_at
BEFORE UPDATE ON banners
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. REVIEWS (STRICTLY DELIVERED ORDERS)
-- ----------------------------------------------------------------------------
CREATE TABLE reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL UNIQUE,
    user_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_reviews_rating_range CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX idx_reviews_user ON reviews(user_id);

CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE FUNCTION fn_enforce_review_only_delivered()
RETURNS TRIGGER AS $$
DECLARE
    v_order_status text;
    v_order_user_id uuid;
BEGIN
    SELECT status, user_id INTO v_order_status, v_order_user_id
    FROM orders
    WHERE id = NEW.order_id;

    IF v_order_status IS NULL OR v_order_status <> 'delivered' THEN
        RAISE EXCEPTION 'Reviews are strictly permitted only for orders that have been successfully delivered (current status: %)',
            COALESCE(v_order_status, 'unknown')
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.user_id <> v_order_user_id THEN
        RAISE EXCEPTION 'Customer cannot review an order belonging to another user.'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_delivered_only
BEFORE INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_enforce_review_only_delivered();

-- ----------------------------------------------------------------------------
-- 7. NOTIFICATIONS DISPATCH TRACKER
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    device_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    sent_at timestamptz,
    error text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL,
    CONSTRAINT chk_notifications_status CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_device ON notifications(device_id);
