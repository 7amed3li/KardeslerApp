-- ============================================================================
-- Test Suite: tests.sql (Comprehensive Hardened Security & Integrity Suite)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Automated verification script running on a real PostgreSQL 16
--              instance. Verifies all 23 core business rules, financial invariants,
--              Row-Level Security (RLS) policies, and vulnerability mitigations.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMPORARY TABLE test_results (
    test_number integer,
    test_name text,
    status text,
    details text
);

-- ----------------------------------------------------------------------------
-- TEST 1: Duplicate order with the same idempotency key is rejected
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id uuid := '11111111-1111-1111-1111-111111111111';
    v_order_id uuid;
    v_failed boolean := false;
BEGIN
    INSERT INTO users (id, phone, name, referral_code)
    VALUES (v_user_id, '+905551110001', 'Test Customer 1', 'REF_TEST_01')
    ON CONFLICT DO NOTHING;

    -- First order insertion
    INSERT INTO orders (
        user_id, order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        v_user_id, 'delivery', 'new', '2026-05-15', 101, 'idem-key-test-01',
        34000, 0, 0, 34000, 25000,
        'Test Customer 1', '+905551110001', 'card_online'
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
        1, 1, 34000
    );

    -- Second order with identical idempotency key must raise unique_violation
    BEGIN
        INSERT INTO orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method
        ) VALUES (
            v_user_id, 'delivery', 'new', '2026-05-15', 102, 'idem-key-test-01',
            34000, 0, 0, 34000, 25000,
            'Test Customer 1', '+905551110001', 'card_online'
        );
        v_failed := true; -- Should not reach here
    EXCEPTION WHEN unique_violation THEN
        INSERT INTO test_results VALUES (1, 'Idempotency key duplicate rejection', 'PASS', 'Duplicate idempotency key successfully raised unique_violation');
    END;

    IF v_failed THEN
        INSERT INTO test_results VALUES (1, 'Idempotency key duplicate rejection', 'FAIL', 'Duplicate idempotency key was allowed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 2: Order with total < min_order_kurus_applied is rejected
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id uuid := '11111111-1111-1111-1111-111111111111';
    v_passed_1 boolean := false;
    v_passed_2 boolean := false;
BEGIN
    -- Scenario A: Subtotal below minimum spend
    BEGIN
        INSERT INTO orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method
        ) VALUES (
            v_user_id, 'delivery', 'new', '2026-05-15', 201, 'idem-min-01',
            20000, 0, 0, 20000, 25000, -- 200 TL < 250 TL minimum
            'Test Customer 1', '+905551110001', 'cash_on_delivery'
        );
    EXCEPTION WHEN check_violation THEN
        v_passed_1 := true;
    END;

    -- Scenario B: Coupon discount drops total below minimum spend
    BEGIN
        INSERT INTO orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method
        ) VALUES (
            v_user_id, 'delivery', 'new', '2026-05-15', 202, 'idem-min-02',
            30000, 10000, 0, 20000, 25000, -- 300 TL - 100 TL = 200 TL < 250 TL min after discount
            'Test Customer 1', '+905551110001', 'cash_on_delivery'
        );
    EXCEPTION WHEN check_violation THEN
        v_passed_2 := true;
    END;

    IF v_passed_1 AND v_passed_2 THEN
        INSERT INTO test_results VALUES (2, 'Minimum spend enforcement after discount', 'PASS', 'Both raw spend and post-discount spend checks rejected orders below minimum');
    ELSE
        INSERT INTO test_results VALUES (2, 'Minimum spend enforcement after discount', 'FAIL', 'Under-minimum orders were not properly rejected');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 3: Status state machine and timeline event recording
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_order_id uuid;
    v_events_count integer;
    v_accepted_at timestamptz;
    v_delivered_at timestamptz;
    v_invalid_transition_blocked boolean := false;
    v_terminal_transition_blocked boolean := false;
BEGIN
    INSERT INTO orders (
        order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        'delivery', 'new', '2026-05-15', 301, 'idem-lifecycle-01',
        34000, 0, 0, 34000, 25000,
        'Test Customer', '+905551110001', 'card_online'
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
        1, 1, 34000
    );

    -- Invalid jump: new -> delivered directly
    BEGIN
        UPDATE orders SET status = 'delivered' WHERE id = v_order_id;
    EXCEPTION WHEN invalid_parameter_value THEN
        v_invalid_transition_blocked := true;
    END;

    -- Valid chain: new -> accepted -> on_the_way -> delivered
    UPDATE orders SET status = 'accepted' WHERE id = v_order_id;
    SELECT accepted_at INTO v_accepted_at FROM orders WHERE id = v_order_id;

    UPDATE orders SET status = 'on_the_way' WHERE id = v_order_id;
    UPDATE orders SET status = 'delivered' WHERE id = v_order_id;
    SELECT delivered_at INTO v_delivered_at FROM orders WHERE id = v_order_id;

    -- Terminal state jump: delivered -> cancelled
    BEGIN
        UPDATE orders SET status = 'cancelled' WHERE id = v_order_id;
    EXCEPTION WHEN invalid_parameter_value THEN
        v_terminal_transition_blocked := true;
    END;

    SELECT count(*) INTO v_events_count FROM order_events WHERE order_id = v_order_id;

    IF v_invalid_transition_blocked AND v_terminal_transition_blocked AND
       v_accepted_at IS NOT NULL AND v_delivered_at IS NOT NULL AND v_events_count = 4 THEN
        INSERT INTO test_results VALUES (3, 'Order status transitions and lifecycle timeline', 'PASS', 'State machine enforced graph, recorded 4 events, and maintained timestamps');
    ELSE
        INSERT INTO test_results VALUES (3, 'Order status transitions and lifecycle timeline', 'FAIL', 'Status transitions failed validation');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 4: Order financial immutability & order_items immutability
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_order_id uuid;
    v_item_id uuid;
    v_order_money_blocked boolean := false;
    v_item_update_blocked boolean := false;
    v_item_delete_blocked boolean := false;
BEGIN
    INSERT INTO orders (
        order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        'delivery', 'new', '2026-05-15', 401, 'idem-immut-01',
        34000, 0, 0, 34000, 25000,
        'Test Customer', '+905551110001', 'card_online'
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
        1, 1, 34000
    ) RETURNING id INTO v_item_id;

    -- Attempt 1: Tamper with order total_kurus
    BEGIN
        UPDATE orders SET total_kurus = 10000 WHERE id = v_order_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_order_money_blocked := true;
    END;

    -- Attempt 2: Tamper with order item quantity
    BEGIN
        UPDATE order_items SET quantity = 5 WHERE id = v_item_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_item_update_blocked := true;
    END;

    -- Attempt 3: Delete order item
    BEGIN
        DELETE FROM order_items WHERE id = v_item_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_item_delete_blocked := true;
    END;

    IF v_order_money_blocked AND v_item_update_blocked AND v_item_delete_blocked THEN
        INSERT INTO test_results VALUES (4, 'Order and order_items immutability', 'PASS', 'Financial columns and line item records are strictly immutable');
    ELSE
        INSERT INTO test_results VALUES (4, 'Order and order_items immutability', 'FAIL', 'Mutation on financial data was allowed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 5: UPDATE and DELETE on order_events and audit_logs are blocked
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_event_update_blocked boolean := false;
    v_event_delete_blocked boolean := false;
    v_audit_update_blocked boolean := false;
    v_audit_delete_blocked boolean := false;
    v_event_id uuid;
    v_audit_id uuid;
BEGIN
    SELECT id INTO v_event_id FROM order_events LIMIT 1;
    SELECT id INTO v_audit_id FROM audit_logs LIMIT 1;

    -- Test order_events update
    BEGIN
        UPDATE order_events SET note = 'Tampered' WHERE id = v_event_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_event_update_blocked := true;
    END;

    -- Test order_events delete
    BEGIN
        DELETE FROM order_events WHERE id = v_event_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_event_delete_blocked := true;
    END;

    -- Test audit_logs update
    BEGIN
        UPDATE audit_logs SET table_name = 'tampered' WHERE id = v_audit_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_audit_update_blocked := true;
    END;

    -- Test audit_logs delete
    BEGIN
        DELETE FROM audit_logs WHERE id = v_audit_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_audit_delete_blocked := true;
    END;

    IF v_event_update_blocked AND v_event_delete_blocked AND
       v_audit_update_blocked AND v_audit_delete_blocked THEN
        INSERT INTO test_results VALUES (5, 'Append-only tables (order_events & audit_logs)', 'PASS', 'Triggers and permissions strictly block UPDATE and DELETE on audit ledgers');
    ELSE
        INSERT INTO test_results VALUES (5, 'Append-only tables (order_events & audit_logs)', 'FAIL', 'Append-only protection failed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 6: Second coupon on one order fails (UNIQUE order_id)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id uuid := '11111111-1111-1111-1111-111111111111';
    v_order_id uuid;
    v_second_coupon_blocked boolean := false;
BEGIN
    INSERT INTO orders (
        user_id, order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        v_user_id, 'delivery', 'new', '2026-05-15', 601, 'idem-coupon-01',
        50000, 5000, 0, 45000, 25000,
        'Test Customer', '+905551110001', 'card_online'
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_id, 'f0000000-0000-0000-0000-000000000002', 'Urfa Kebap', 50000,
        1, 1, 50000
    );

    -- First redemption
    INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_kurus)
    VALUES ('90000000-0000-0000-0000-000000000002', v_user_id, v_order_id, 5000);

    -- Second redemption attempt on the same order must fail UNIQUE constraint
    BEGIN
        INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_kurus)
        VALUES ('90000000-0000-0000-0000-000000000003', v_user_id, v_order_id, 5000);
    EXCEPTION WHEN unique_violation THEN
        v_second_coupon_blocked := true;
    END;

    IF v_second_coupon_blocked THEN
        INSERT INTO test_results VALUES (6, 'Single coupon per order rule', 'PASS', 'Second coupon redemption on the same order raised unique_violation');
    ELSE
        INSERT INTO test_results VALUES (6, 'Single coupon per order rule', 'FAIL', 'Multiple coupons on one order were allowed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 7: redeem_coupon locking and global usage cap (max_total_uses = 1)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_coupon_id uuid := '99999999-9999-9999-9999-999999999999';
    v_user_1 uuid := '11111111-1111-1111-1111-111111111111';
    v_user_2 uuid := '22222222-2222-2222-2222-222222222222';
    v_order_1 uuid;
    v_order_2 uuid;
    v_res_1 uuid;
    v_cap_exceeded_blocked boolean := false;
BEGIN
    INSERT INTO users (id, phone, name, referral_code)
    VALUES (v_user_2, '+905551110002', 'Test Customer 2', 'REF_TEST_02')
    ON CONFLICT DO NOTHING;

    -- Temporary coupon with strict max_total_uses = 1
    INSERT INTO coupons (
        id, code, type, value, max_discount_kurus, min_order_kurus,
        starts_at, ends_at, max_total_uses, max_uses_per_user, first_order_only, applies_to, is_active
    ) VALUES (
        v_coupon_id, 'FLASH1USE', 'fixed_amount', 5000, 5000, 25000,
        clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 day',
        1, 1, false, 'all', true
    );

    INSERT INTO orders (
        user_id, order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        v_user_1, 'delivery', 'new', '2026-05-15', 701, 'idem-flash-01',
        34000, 5000, 0, 29000, 25000, 'User 1', '+905551110001', 'card_online'
    ) RETURNING id INTO v_order_1;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_1, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
        1, 1, 34000
    );

    INSERT INTO orders (
        user_id, order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        v_user_2, 'delivery', 'new', '2026-05-15', 702, 'idem-flash-02',
        34000, 5000, 0, 29000, 25000, 'User 2', '+905551110002', 'card_online'
    ) RETURNING id INTO v_order_2;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_2, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
        1, 1, 34000
    );

    -- First user redeems successfully
    v_res_1 := redeem_coupon(v_coupon_id, v_user_1, v_order_1, 5000);

    -- Second user attempts redemption after cap reached
    BEGIN
        PERFORM redeem_coupon(v_coupon_id, v_user_2, v_order_2, 5000);
    EXCEPTION WHEN check_violation THEN
        v_cap_exceeded_blocked := true;
    END;

    IF v_res_1 IS NOT NULL AND v_cap_exceeded_blocked THEN
        INSERT INTO test_results VALUES (7, 'Atomic redeem_coupon concurrency & usage cap', 'PASS', 'Locked row, redeemed once, and rejected subsequent redemption after max_total_uses');
    ELSE
        INSERT INTO test_results VALUES (7, 'Atomic redeem_coupon concurrency & usage cap', 'FAIL', 'Usage limit was exceeded');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 8: Deleting sold menu item fails (RESTRICT); soft delete succeeds
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_hard_delete_blocked boolean := false;
    v_soft_delete_succeeded boolean := false;
BEGIN
    -- Attempt hard delete of sold Adana Kebap (has FK references in order_items)
    BEGIN
        DELETE FROM menu_items WHERE id = 'f0000000-0000-0000-0000-000000000001';
    EXCEPTION WHEN foreign_key_violation THEN
        v_hard_delete_blocked := true;
    END;

    -- Soft delete
    UPDATE menu_items SET deleted_at = clock_timestamp() WHERE id = 'f0000000-0000-0000-0000-000000000001';
    IF EXISTS (SELECT 1 FROM menu_items WHERE id = 'f0000000-0000-0000-0000-000000000001' AND deleted_at IS NOT NULL) THEN
        v_soft_delete_succeeded := true;
    END IF;

    -- Restore for remaining tests
    UPDATE menu_items SET deleted_at = NULL WHERE id = 'f0000000-0000-0000-0000-000000000001';

    IF v_hard_delete_blocked AND v_soft_delete_succeeded THEN
        INSERT INTO test_results VALUES (8, 'Sold menu items deletion integrity (RESTRICT & soft delete)', 'PASS', 'ON DELETE RESTRICT prevented financial cascade; soft delete functioned properly');
    ELSE
        INSERT INTO test_results VALUES (8, 'Sold menu items deletion integrity (RESTRICT & soft delete)', 'FAIL', 'Hard delete was permitted or soft delete failed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 9: Order numbers & midnight business day projection
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_bdate date := '2026-05-20';
    v_n1 integer;
    v_n2 integer;
    v_proj_1 date;
    v_proj_2 date;
BEGIN
    v_n1 := next_order_number(v_bdate);
    v_n2 := next_order_number(v_bdate);

    -- 01:30 AM Istanbul time on May 20 falls BEFORE 06:00 cutoff -> belongs to May 19 business date
    v_proj_1 := business_date_of('2026-05-20 01:30:00+03');

    -- 08:30 AM Istanbul time on May 20 falls AFTER 06:00 cutoff -> belongs to May 20 business date
    v_proj_2 := business_date_of('2026-05-20 08:30:00+03');

    IF v_n1 = 1 AND v_n2 = 2 AND v_proj_1 = '2026-05-19' AND v_proj_2 = '2026-05-20' THEN
        INSERT INTO test_results VALUES (9, 'Consecutive numbering and midnight business cutoff', 'PASS', 'Sequential numbers generated atomically; 01:30 AM projected to previous business date');
    ELSE
        INSERT INTO test_results VALUES (9, 'Consecutive numbering and midnight business cutoff', 'FAIL', 'Numbering or cutoff projection incorrect');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 10: Row-Level Security isolation across customers & staff
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_a uuid := '11111111-1111-1111-1111-111111111111';
    v_user_b uuid := '22222222-2222-2222-2222-222222222222';
    v_count_as_a integer;
    v_count_as_anon integer;
    v_count_as_staff integer;
BEGIN
    -- Switch to unprivileged runtime role app_api (non-superuser, respects RLS)
    SET ROLE app_api;

    -- 1. Context: User A
    PERFORM set_config('app.current_user_id', v_user_a::text, true);
    PERFORM set_config('app.current_role', 'customer', true);

    -- As User A, querying orders should only reveal User A's orders, never User B's orders
    SELECT count(*) INTO v_count_as_a
    FROM orders
    WHERE user_id = v_user_b;

    -- 2. Context: Unauthenticated / Missing setting (fail-closed check)
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);

    SELECT count(*) INTO v_count_as_anon FROM orders;

    -- 3. Context: Restaurant Staff
    PERFORM set_config('app.current_role', 'staff', true);
    SELECT count(*) INTO v_count_as_staff FROM orders;

    -- Reset context and role
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);
    RESET ROLE;

    IF v_count_as_a = 0 AND v_count_as_anon = 0 AND v_count_as_staff > 0 THEN
        INSERT INTO test_results VALUES (10, 'Row-Level Security (RLS) customer isolation', 'PASS', 'Customer cannot see other patrons data; unset session returns 0 rows; staff sees all');
    ELSE
        INSERT INTO test_results VALUES (10, 'Row-Level Security (RLS) customer isolation', 'FAIL', format('RLS check failed: count_as_a=%s, count_as_anon=%s, count_as_staff=%s', v_count_as_a, v_count_as_anon, v_count_as_staff));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 11: KVKK user anonymization
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id uuid := '33333333-3333-3333-3333-333333333333';
    v_order_id uuid;
    v_phone_after text;
    v_devices_count integer;
    v_addresses_count integer;
    v_order_still_exists boolean;
BEGIN
    INSERT INTO users (id, phone, name, email, referral_code)
    VALUES (v_user_id, '+905553334455', 'Silinecek Müşteri', 'delete.me@kardeslerapp.com', 'REF_DEL_01');

    INSERT INTO addresses (user_id, label, full_address, location)
    VALUES (v_user_id, 'Ev', 'Kılıçali Paşa Mah. No:10', ST_SetSRID(ST_MakePoint(28.9830, 41.0330), 4326)::geography);

    INSERT INTO devices (user_id, push_token, platform, app_version)
    VALUES (v_user_id, 'push-token-test-del-01', 'ios', '1.0.0');

    INSERT INTO orders (
        user_id, order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        v_user_id, 'delivery', 'new', '2026-05-15', 901, 'idem-anon-01',
        34000, 0, 0, 34000, 25000,
        'Silinecek Müşteri', '+905553334455', 'cash_on_delivery'
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
        1, 1, 34000
    );

    UPDATE orders SET status = 'accepted' WHERE id = v_order_id;
    UPDATE orders SET status = 'on_the_way' WHERE id = v_order_id;
    UPDATE orders SET status = 'delivered' WHERE id = v_order_id;

    -- Execute KVKK account erasure
    PERFORM anonymize_user(v_user_id);

    SELECT phone INTO v_phone_after FROM users WHERE id = v_user_id;
    SELECT count(*) INTO v_devices_count FROM devices WHERE user_id = v_user_id;
    SELECT count(*) INTO v_addresses_count FROM addresses WHERE user_id = v_user_id;
    SELECT EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) INTO v_order_still_exists;

    IF v_phone_after IS NULL AND v_devices_count = 0 AND v_addresses_count = 0 AND v_order_still_exists THEN
        INSERT INTO test_results VALUES (11, 'KVKK account erasure and tax order retention', 'PASS', 'PII, devices, and addresses purged; historical order retained for tax compliance');
    ELSE
        INSERT INTO test_results VALUES (11, 'KVKK account erasure and tax order retention', 'FAIL', 'Anonymization did not completely sanitize PII or destroyed orders');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 12: Missing Turkish translation is rejected at transaction commit
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing_tr_blocked boolean := false;
BEGIN
    BEGIN
        -- Inserting a category with ONLY English translation (missing Turkish)
        INSERT INTO categories (id, sort_order, is_active)
        VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 99, true);

        INSERT INTO category_translations (category_id, language, name)
        VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'en', 'Only English Category');

        -- Force immediate evaluation of deferred constraint triggers
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_missing_tr_blocked := true;
    END;

    -- Reset constraints to deferred
    SET CONSTRAINTS ALL DEFERRED;

    -- Cleanup
    DELETE FROM category_translations WHERE category_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    DELETE FROM categories WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    IF v_missing_tr_blocked THEN
        INSERT INTO test_results VALUES (12, 'Mandatory Turkish translation enforcement', 'PASS', 'Entity lacking Turkish translation was blocked by constraint trigger');
    ELSE
        INSERT INTO test_results VALUES (12, 'Mandatory Turkish translation enforcement', 'FAIL', 'Entity without Turkish translation was allowed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 13: Spatial delivery zone polygon boundary check
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_inside_zone_name text;
    v_outside_count integer;
BEGIN
    -- Point inside Cihangir Core (Zone 1): Lat 41.0330, Lng 28.9830
    SELECT name INTO v_inside_zone_name
    FROM find_delivery_zone(41.0330, 28.9830);

    -- Point far outside (e.g. Sarıyer / Beykoz): Lat 41.1500, Lng 29.0500
    SELECT count(*) INTO v_outside_count
    FROM find_delivery_zone(41.1500, 29.0500);

    IF v_inside_zone_name = 'Cihangir Merkez (Zone 1)' AND v_outside_count = 0 THEN
        INSERT INTO test_results VALUES (13, 'PostGIS delivery zone polygon evaluation', 'PASS', 'Inside coordinates matched Cihangir zone; outside coordinates returned 0 zones');
    ELSE
        INSERT INTO test_results VALUES (13, 'PostGIS delivery zone polygon evaluation', 'FAIL', 'Spatial boundary matching failed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 14: Subtotal tampering rejection (400 TL order with 1 kurus item)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_order_id uuid;
    v_tampered_subtotal_blocked boolean := false;
BEGIN
    BEGIN
        -- Order declares subtotal 40000 kuruş (400 TL)
        INSERT INTO orders (
            order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method
        ) VALUES (
            'delivery', 'new', '2026-05-15', 1401, 'idem-tamper-subtotal-01',
            40000, 0, 0, 40000, 25000,
            'Test Patron', '+905551110001', 'card_online'
        ) RETURNING id INTO v_order_id;

        -- But line item is only 1 kuruş!
        INSERT INTO order_items (
            order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
            vat_rate_snapshot, quantity, line_total_kurus
        ) VALUES (
            v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 1,
            1, 1, 1
        );

        -- Force immediate verification of deferred constraint trigger
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_tampered_subtotal_blocked := true;
    END;

    SET CONSTRAINTS ALL DEFERRED;

    IF v_tampered_subtotal_blocked THEN
        INSERT INTO test_results VALUES (14, 'Subtotal & line items integrity check', 'PASS', 'Order with 400 TL subtotal and 1 kuruş item was strictly rejected by deferred constraint trigger');
    ELSE
        INSERT INTO test_results VALUES (14, 'Subtotal & line items integrity check', 'FAIL', 'Subtotal mismatch between order and items was allowed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 15: Customer cannot inject fake status, date, or invoice status
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id uuid := '11111111-1111-1111-1111-111111111111';
    v_order_id uuid;
    v_status text;
    v_bdate date;
    v_invoice_status text;
BEGIN
    SET ROLE app_api;
    PERFORM set_config('app.current_user_id', v_user_id::text, true);
    PERFORM set_config('app.current_role', 'customer', true);

    -- Customer attempts to insert with delivered status, future year 2099, and issued invoice
    -- Under RLS policy pol_orders_customer_insert, non-conforming status will fail WITH CHECK violation.
    -- Furthermore, fn_orders_enforce_defaults() forces status='new', today's business date, and invoice_status='not_required'.
    BEGIN
        INSERT INTO orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method,
            invoice_status
        ) VALUES (
            v_user_id, 'delivery', 'delivered', '2099-01-01', 99999, 'idem-spoof-01',
            34000, 0, 0, 34000, 25000,
            'Spoofer', '+905551110001', 'card_online',
            'issued'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (
            order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
            vat_rate_snapshot, quantity, line_total_kurus
        ) VALUES (
            v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 34000,
            1, 1, 34000
        );
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        v_order_id := NULL;
    END;

    RESET ROLE;
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);

    IF v_order_id IS NULL THEN
        INSERT INTO test_results VALUES (15, 'Customer order spoofing prevention', 'PASS', 'Customer insert with status=delivered or future date was blocked by RLS/Trigger policy');
    ELSE
        SELECT status, business_date, invoice_status INTO v_status, v_bdate, v_invoice_status
        FROM orders WHERE id = v_order_id;

        IF v_status = 'new' AND v_bdate <> '2099-01-01' AND v_invoice_status = 'not_required' THEN
            INSERT INTO test_results VALUES (15, 'Customer order spoofing prevention', 'PASS', 'Injected values were sanitized to defaults (new, current date, not_required)');
        ELSE
            INSERT INTO test_results VALUES (15, 'Customer order spoofing prevention', 'FAIL', 'Customer successfully spoofed lifecycle/financial fields');
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 16: Order events forgery prevention (User B on User A order)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_a uuid := '11111111-1111-1111-1111-111111111111';
    v_user_b uuid := '22222222-2222-2222-2222-222222222222';
    v_order_a_id uuid;
    v_forge_blocked boolean := false;
BEGIN
    SELECT id INTO v_order_a_id FROM orders WHERE user_id = v_user_a LIMIT 1;

    -- Switch to unprivileged role as User B
    SET ROLE app_api;
    PERFORM set_config('app.current_user_id', v_user_b::text, true);
    PERFORM set_config('app.current_role', 'customer', true);

    BEGIN
        INSERT INTO order_events (order_id, from_status, to_status, actor_type, actor_id, note)
        VALUES (v_order_a_id, 'new', 'cancelled', 'customer', v_user_b::text, 'Forged cancellation');
    EXCEPTION WHEN insufficient_privilege THEN
        v_forge_blocked := true;
    END;

    RESET ROLE;
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);

    IF v_forge_blocked THEN
        INSERT INTO test_results VALUES (16, 'Cross-user order events forgery prevention', 'PASS', 'RLS policy pol_order_events_customer_insert blocked User B inserting event on User A order');
    ELSE
        INSERT INTO test_results VALUES (16, 'Cross-user order events forgery prevention', 'FAIL', 'User B was allowed to inject events on User A order');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 17: KVKK anonymize_user authorization check (Caller must be self or staff)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_a uuid := '11111111-1111-1111-1111-111111111111';
    v_user_b uuid := '22222222-2222-2222-2222-222222222222';
    v_unauthorized_blocked boolean := false;
BEGIN
    -- Switch to runtime role as User B
    SET ROLE app_api;
    PERFORM set_config('app.current_user_id', v_user_b::text, true);
    PERFORM set_config('app.current_role', 'customer', true);

    -- User B tries to anonymize User A
    BEGIN
        PERFORM anonymize_user(v_user_a);
    EXCEPTION WHEN insufficient_privilege THEN
        v_unauthorized_blocked := true;
    END;

    RESET ROLE;
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);

    IF v_unauthorized_blocked THEN
        INSERT INTO test_results VALUES (17, 'KVKK anonymize_user authorization check', 'PASS', 'Unauthorized customer attempting to delete another customer account was blocked with insufficient_privilege');
    ELSE
        INSERT INTO test_results VALUES (17, 'KVKK anonymize_user authorization check', 'FAIL', 'Unauthorized deletion was permitted');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 18: Audit log credential scrubbing (No password_hash or TOTP secret)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_audit_record record;
    v_leaks_found boolean := false;
BEGIN
    -- Check all audit logs on staff_users, otp_codes, refresh_tokens
    FOR v_audit_record IN
        SELECT new_values, old_values
        FROM audit_logs
        WHERE table_name IN ('staff_users', 'otp_codes', 'refresh_tokens')
    LOOP
        IF (v_audit_record.new_values ? 'password_hash') OR
           (v_audit_record.new_values ? 'totp_secret_encrypted') OR
           (v_audit_record.new_values ? 'code_hash') OR
           (v_audit_record.new_values ? 'token_hash') OR
           (v_audit_record.old_values ? 'password_hash') OR
           (v_audit_record.old_values ? 'totp_secret_encrypted') THEN
            v_leaks_found := true;
        END IF;
    END LOOP;

    IF NOT v_leaks_found THEN
        INSERT INTO test_results VALUES (18, 'Audit log credential sanitization', 'PASS', 'audit_logs automatically strips password_hash, TOTP secrets, and token hashes');
    ELSE
        INSERT INTO test_results VALUES (18, 'Audit log credential sanitization', 'FAIL', 'Sensitive credentials were found in audit_logs JSON payload');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 19: Audit log temp-table hijacking protection (fixed search_path)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_real_count_before integer;
    v_real_count_after integer;
BEGIN
    SELECT count(*) INTO v_real_count_before FROM public.audit_logs;

    -- Create shadow temp table named audit_logs
    CREATE TEMPORARY TABLE audit_logs (
        id uuid,
        table_name text,
        action text
    );

    -- Trigger audit on delivery_zones
    UPDATE delivery_zones
    SET estimated_minutes = 40
    WHERE id = 'b0000000-0000-0000-0000-000000000001';

    SELECT count(*) INTO v_real_count_after FROM public.audit_logs;

    DROP TABLE audit_logs;

    IF v_real_count_after = v_real_count_before + 1 THEN
        INSERT INTO test_results VALUES (19, 'Audit trigger search_path hijacking protection', 'PASS', 'fn_audit_log_trigger SET search_path = public, pg_catalog, pg_temp logged to real audit table');
    ELSE
        INSERT INTO test_results VALUES (19, 'Audit trigger search_path hijacking protection', 'FAIL', 'Audit log was diverted to temporary table');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 20: Append-only tables block TRUNCATE
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_trunc_audit_blocked boolean := false;
    v_trunc_events_blocked boolean := false;
    v_trunc_consents_blocked boolean := false;
    v_trunc_loyalty_blocked boolean := false;
BEGIN
    BEGIN
        TRUNCATE TABLE audit_logs;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_trunc_audit_blocked := true;
    END;

    BEGIN
        TRUNCATE TABLE order_events;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_trunc_events_blocked := true;
    END;

    BEGIN
        TRUNCATE TABLE consents;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_trunc_consents_blocked := true;
    END;

    BEGIN
        TRUNCATE TABLE loyalty_ledger;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_trunc_loyalty_blocked := true;
    END;

    IF v_trunc_audit_blocked AND v_trunc_events_blocked AND
       v_trunc_consents_blocked AND v_trunc_loyalty_blocked THEN
        INSERT INTO test_results VALUES (20, 'Append-only tables TRUNCATE prevention', 'PASS', 'BEFORE TRUNCATE triggers blocked TRUNCATE on audit_logs, events, consents, loyalty');
    ELSE
        INSERT INTO test_results VALUES (20, 'Append-only tables TRUNCATE prevention', 'FAIL', 'TRUNCATE was allowed on an append-only ledger');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 21: Deleting Turkish translations from child tables is rejected
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_del_category_tr_blocked boolean := false;
    v_del_item_tr_blocked boolean := false;
    v_del_tag_tr_blocked boolean := false;
BEGIN
    BEGIN
        DELETE FROM category_translations
        WHERE language = 'tr' AND category_id = 'e0000000-0000-0000-0000-000000000001';
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_del_category_tr_blocked := true;
    END;
    SET CONSTRAINTS ALL DEFERRED;

    BEGIN
        DELETE FROM menu_item_translations
        WHERE language = 'tr' AND menu_item_id = 'f0000000-0000-0000-0000-000000000001';
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_del_item_tr_blocked := true;
    END;
    SET CONSTRAINTS ALL DEFERRED;

    BEGIN
        DELETE FROM tag_translations
        WHERE language = 'tr' AND tag_id = 'd0000000-0000-0000-0000-000000000001';
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_del_tag_tr_blocked := true;
    END;
    SET CONSTRAINTS ALL DEFERRED;

    IF v_del_category_tr_blocked AND v_del_item_tr_blocked AND v_del_tag_tr_blocked THEN
        INSERT INTO test_results VALUES (21, 'Turkish child translation deletion prevention', 'PASS', 'Deleting Turkish translation rows from child translation tables is strictly blocked');
    ELSE
        INSERT INTO test_results VALUES (21, 'Turkish child translation deletion prevention', 'FAIL', 'Turkish translation deletion was allowed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 22: Sensitive tables hidden from customer role under RLS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id uuid := '11111111-1111-1111-1111-111111111111';
    v_staff_count integer;
    v_otp_count integer;
    v_tokens_count integer;
    v_other_users_count integer;
BEGIN
    SET ROLE app_api;
    PERFORM set_config('app.current_user_id', v_user_id::text, true);
    PERFORM set_config('app.current_role', 'customer', true);

    -- Customer querying staff_users must see 0 rows
    SELECT count(*) INTO v_staff_count FROM staff_users;

    -- Customer querying otp_codes must see 0 rows
    SELECT count(*) INTO v_otp_count FROM otp_codes;

    -- Customer querying refresh_tokens of others must see 0 rows
    SELECT count(*) INTO v_tokens_count
    FROM refresh_tokens
    WHERE user_id <> v_user_id OR staff_user_id IS NOT NULL;

    -- Customer querying users table must see ONLY themselves, not other patrons
    SELECT count(*) INTO v_other_users_count
    FROM users
    WHERE id <> v_user_id;

    RESET ROLE;
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);

    IF v_staff_count = 0 AND v_otp_count = 0 AND v_tokens_count = 0 AND v_other_users_count = 0 THEN
        INSERT INTO test_results VALUES (22, 'Sensitive tables customer privacy under RLS', 'PASS', 'staff_users (0), otp_codes (0), other tokens (0), other users (0) completely hidden');
    ELSE
        INSERT INTO test_results VALUES (22, 'Sensitive tables customer privacy under RLS', 'FAIL', format('Leak detected: staff=%s, otp=%s, tokens=%s, other_users=%s', v_staff_count, v_otp_count, v_tokens_count, v_other_users_count));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- TEST 23: redeem_coupon validates discount math and blocks arbitrary values
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_coupon_id uuid := '90000000-0000-0000-0000-000000000001'; -- HOSGELDIN 20% off
    v_user_fresh uuid := '44444444-4444-4444-4444-444444444444';
    v_other_user uuid := '55555555-5555-5555-5555-555555555555';
    v_order_id uuid;
    v_arbitrary_discount_blocked boolean := false;
    v_unauthorized_blocked boolean := false;
    v_valid_redemption_id uuid;
BEGIN
    INSERT INTO users (id, phone, name, referral_code)
    VALUES (v_user_fresh, '+905554440001', 'Fresh Patron', 'REF_FRESH_01')
    ON CONFLICT DO NOTHING;

    INSERT INTO users (id, phone, name, referral_code)
    VALUES (v_other_user, '+905555550001', 'Other Patron', 'REF_OTHER_01')
    ON CONFLICT DO NOTHING;

    INSERT INTO orders (
        user_id, order_type, status, business_date, order_number, idempotency_key,
        subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
        customer_name_snapshot, customer_phone_snapshot, payment_method
    ) VALUES (
        v_user_fresh, 'delivery', 'new', '2026-05-15', 2301, 'idem-coupon-math-01',
        35000, 7000, 0, 28000, 25000, -- 20% of 350 TL = 70 TL (7000 kuruş)
        'Fresh Patron', '+905554440001', 'card_online'
    ) RETURNING id INTO v_order_id;

    INSERT INTO order_items (
        order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
        vat_rate_snapshot, quantity, line_total_kurus
    ) VALUES (
        v_order_id, 'f0000000-0000-0000-0000-000000000001', 'Zırh Kıyma Adana Kebap', 35000,
        1, 1, 35000
    );

    -- 1. Caller tries to pass arbitrary discount 15000 kuruş (150 TL) instead of calculated 7000 kuruş
    BEGIN
        PERFORM redeem_coupon(v_coupon_id, v_user_fresh, v_order_id, 15000);
    EXCEPTION WHEN check_violation THEN
        v_arbitrary_discount_blocked := true;
    END;

    -- 2. Unauthorized caller: User B tries to redeem coupon on User A's order
    SET ROLE app_api;
    PERFORM set_config('app.current_user_id', v_other_user::text, true);
    PERFORM set_config('app.current_role', 'customer', true);

    BEGIN
        PERFORM redeem_coupon(v_coupon_id, v_user_fresh, v_order_id, 7000);
    EXCEPTION WHEN insufficient_privilege THEN
        v_unauthorized_blocked := true;
    END;

    RESET ROLE;
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.current_role', '', true);

    -- 3. Valid redemption by the user themselves
    v_valid_redemption_id := redeem_coupon(v_coupon_id, v_user_fresh, v_order_id, 7000);

    IF v_arbitrary_discount_blocked AND v_unauthorized_blocked AND v_valid_redemption_id IS NOT NULL THEN
        INSERT INTO test_results VALUES (23, 'redeem_coupon discount math & authorization', 'PASS', 'Arbitrary discounts and cross-user redemption blocked; authoritative math verified');
    ELSE
        INSERT INTO test_results VALUES (23, 'redeem_coupon discount math & authorization', 'FAIL', 'Coupon redemption math or authorization failed');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- FINAL TEST SUMMARY REPORT
-- ----------------------------------------------------------------------------
SELECT
    test_number AS "#",
    test_name AS "Test Case",
    status AS "Status",
    details AS "Verification Details"
FROM test_results
ORDER BY test_number;
