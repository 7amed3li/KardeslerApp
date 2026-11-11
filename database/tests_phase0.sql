-- ============================================================================
-- File: tests_phase0.sql
-- Project: Kardeşler Cihangir — Phase 0 Real-Role Security & Order Flow Suite
-- Description:
--   Executes all Phase 0 security & order-flow assertions under the REAL
--   database roles (`app_api` and `app_readonly`), NEVER as superuser.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_alice_id uuid := '11111111-2222-4333-8444-555555555555';
    v_bob_id   uuid := '66666666-7777-4888-8999-000000000000';
    v_temp_user_id uuid := '99999999-8888-4777-8666-555555555555';
BEGIN
    -- Reset coupon redemptions for Alice so coupon tests are repeatable without deleting immutable orders
    DELETE FROM public.coupon_redemptions WHERE user_id IN (v_alice_id, v_bob_id, v_temp_user_id);
    UPDATE public.coupons SET used_count = 0 WHERE code = 'HOSGELDIN';

    INSERT INTO public.users (id, phone, name, email, referral_code, preferred_language)
    VALUES
        (v_alice_id, '+905321112233', 'Almila Yılmaz', 'almila@example.com', 'ALMILA01', 'tr'),
        (v_bob_id,   '+905329998877', 'Burak Demir',   'burak@example.com',  'BURAK002', 'tr'),
        (v_temp_user_id, '+905324445566', 'Silinecek Kullanıcı', 'sil@example.com', 'SIL00003', 'tr')
    ON CONFLICT (id) DO UPDATE SET
        deleted_at = NULL,
        anonymized_at = NULL,
        is_blocked = false,
        phone = EXCLUDED.phone,
        name = EXCLUDED.name,
        referral_code = EXCLUDED.referral_code;

    IF NOT EXISTS (SELECT 1 FROM public.loyalty_ledger WHERE user_id = v_alice_id) THEN
        INSERT INTO public.loyalty_ledger (user_id, points, reason)
        VALUES (v_alice_id, 250, 'Test welcome points');
    END IF;
END $$;

-- ============================================================================
-- TEST 1: app_readonly role isolation & loyalty_balances view
-- ============================================================================
DO $$
DECLARE
    v_err_caught boolean;
    v_balance bigint;
BEGIN
    SET ROLE app_readonly;

    -- 1a. app_readonly cannot execute anonymize_user
    v_err_caught := false;
    BEGIN
        PERFORM public.anonymize_user('11111111-2222-4333-8444-555555555555');
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 1a: app_readonly was able to call anonymize_user!';
    END IF;

    -- 1b. app_readonly cannot execute redeem_coupon
    v_err_caught := false;
    BEGIN
        PERFORM public.redeem_coupon(
            '90000000-0000-0000-0000-000000000001',
            '11111111-2222-4333-8444-555555555555',
            '11111111-2222-4333-8444-555555555555',
            1000
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 1b: app_readonly was able to call redeem_coupon!';
    END IF;

    -- 1c. app_readonly cannot execute create_order
    v_err_caught := false;
    BEGIN
        PERFORM public.create_order('pickup', 'cash_on_delivery', 'idem-ro-1', '[]'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 1c: app_readonly was able to call create_order!';
    END IF;

    -- 1d. app_readonly CAN read loyalty_balances and get non-zero balance
    SELECT active_balance INTO v_balance
    FROM public.loyalty_balances
    WHERE user_id = '11111111-2222-4333-8444-555555555555';

    IF v_balance IS NULL OR v_balance < 250 THEN
        RAISE EXCEPTION 'FAIL 1d: app_readonly could not read loyalty_balances (got %)', v_balance;
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 1: app_readonly privileges & loyalty_balances verified.';
END $$;

-- ============================================================================
-- TEST 2: app_api Customer Isolation (users, otp_codes, staff_users, print_jobs)
-- ============================================================================
DO $$
DECLARE
    v_alice_id uuid := '11111111-2222-4333-8444-555555555555';
    v_bob_id   uuid := '66666666-7777-4888-8999-000000000000';
    v_cnt integer;
    v_err_caught boolean;
BEGIN
    SET ROLE app_api;
    PERFORM set_config('app.current_role', 'customer', true);
    PERFORM set_config('app.current_user_id', v_alice_id::text, true);

    -- 2a. Alice can only see her own user record (1 row), never Bob's
    SELECT count(*) INTO v_cnt FROM public.users;
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'FAIL 2a: Customer Alice saw % rows in users (expected 1)', v_cnt;
    END IF;

    -- 2b. Alice sees 0 rows in staff_users, otp_codes, print_jobs
    SELECT count(*) INTO v_cnt FROM public.staff_users;
    IF v_cnt <> 0 THEN
        RAISE EXCEPTION 'FAIL 2b: Customer Alice saw % rows in staff_users', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.otp_codes;
    IF v_cnt <> 0 THEN
        RAISE EXCEPTION 'FAIL 2b: Customer Alice saw % rows in otp_codes', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.print_jobs;
    IF v_cnt <> 0 THEN
        RAISE EXCEPTION 'FAIL 2b: Customer Alice saw % rows in print_jobs', v_cnt;
    END IF;

    -- 2c. Alice CANNOT directly INSERT into orders (must use create_order)
    v_err_caught := false;
    BEGIN
        INSERT INTO public.orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method, invoice_status
        ) VALUES (
            v_alice_id, 'pickup', 'delivered', '2099-01-01', 99999, 'direct-inject-1',
            32000, 0, 0, 32000, 0, 'Almila', '+905321112233', 'cash_on_delivery', 'issued'
        );
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 2c: Customer Alice was able to INSERT directly into orders!';
    END IF;

    -- 2d. Alice CANNOT INSERT into order_events
    v_err_caught := false;
    BEGIN
        INSERT INTO public.order_events (order_id, from_status, to_status, actor_type, actor_id)
        VALUES (gen_random_uuid(), 'new', 'delivered', 'customer', v_alice_id::text);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 2d: Customer Alice was able to INSERT directly into order_events!';
    END IF;

    -- 2e. Alice CANNOT anonymize Bob's account
    v_err_caught := false;
    BEGIN
        PERFORM public.anonymize_user(v_bob_id);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 2e: Customer Alice was able to anonymize Bob!';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 2: Customer RLS isolation & direct-insert blocks verified.';
END $$;

-- ============================================================================
-- TEST 3: create_order(), redeem_coupon(), idempotency, awaiting_payment & staff visibility
-- ============================================================================
DO $$
DECLARE
    v_alice_id uuid := '11111111-2222-4333-8444-555555555555';
    v_adana_id uuid := 'f0000000-0000-0000-0000-000000000001'; -- 34000 kuruş
    v_ayran_id uuid := 'f0000000-0000-0000-0000-000000000017'; -- 4000 kuruş
    v_opt_1pors uuid := '80000000-0000-0000-0000-000000000001'; -- 0 kuruş (required group on Adana)
    v_idem_key text := 'alice-card-order-' || gen_random_uuid()::text;
    v_order_id uuid;
    v_order_id_retry uuid;
    v_order record;
    v_staff_visible_cnt integer;
    v_print_jobs_cnt integer;
    v_err_caught boolean;
BEGIN
    SET ROLE app_api;
    PERFORM set_config('app.current_role', 'customer', true);
    PERFORM set_config('app.current_user_id', v_alice_id::text, true);

    -- 3a. Create online card order with coupon HOSGELDIN (20% off, min order 30000)
    -- Items: 1x Zırh Kıyma Adana Kebap (34000) + 1x Köy Ayranı (4000) = 38000 kuruş subtotal
    -- 20% discount = 7600 kuruş -> total = 30400 kuruş (above Cihangir Merkez zone min 25000 kuruş)
    v_order_id := public.create_order(
        p_order_type := 'delivery',
        p_payment_method := 'card_online',
        p_idempotency_key := v_idem_key,
        p_items := jsonb_build_array(
            jsonb_build_object(
                'menu_item_id', v_adana_id,
                'quantity', 1,
                'option_ids', jsonb_build_array(v_opt_1pors)
            ),
            jsonb_build_object(
                'menu_item_id', v_ayran_id,
                'quantity', 1,
                'option_ids', jsonb_build_array()
            )
        ),
        p_address_snapshot := jsonb_build_object(
            'full_address', 'Akarsu Yokuşu No:14 Cihangir, Beyoğlu',
            'building', '14',
            'lat', 41.0330,
            'lng', 28.9840
        ),
        p_coupon_code := 'HOSGELDIN',
        p_customer_note := 'Zili çalmayın lütfen'
    );

    -- Verify Idempotency: calling with same key returns same order ID
    v_order_id_retry := public.create_order(
        p_order_type := 'delivery',
        p_payment_method := 'card_online',
        p_idempotency_key := v_idem_key,
        p_items := jsonb_build_array(
            jsonb_build_object(
                'menu_item_id', v_adana_id,
                'quantity', 1,
                'option_ids', jsonb_build_array(v_opt_1pors)
            )
        ),
        p_address_snapshot := jsonb_build_object(
            'full_address', 'Akarsu Yokuşu No:14 Cihangir, Beyoğlu',
            'lat', 41.0330,
            'lng', 28.9840
        ),
        p_coupon_code := 'HOSGELDIN'
    );

    IF v_order_id_retry <> v_order_id THEN
        RAISE EXCEPTION 'FAIL 3a: Idempotent retry returned different order_id!';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;
    IF v_order.status <> 'awaiting_payment' THEN
        RAISE EXCEPTION 'FAIL 3a: Card order status should be awaiting_payment, got %', v_order.status;
    END IF;
    IF v_order.subtotal_kurus <> 38000 OR v_order.discount_kurus <> 7600 OR v_order.total_kurus <> 30400 THEN
        RAISE EXCEPTION 'FAIL 3a: Unexpected order math: subtotal=%, discount=%, total=%',
            v_order.subtotal_kurus, v_order.discount_kurus, v_order.total_kurus;
    END IF;

    -- 3b. Switch to 'staff' role: awaiting_payment order MUST be invisible to kitchen/staff!
    PERFORM set_config('app.current_role', 'staff', true);
    PERFORM set_config('app.current_user_id', '', true);

    SELECT count(*) INTO v_staff_visible_cnt FROM public.orders WHERE id = v_order_id;
    IF v_staff_visible_cnt <> 0 THEN
        RAISE EXCEPTION 'FAIL 3b: Staff role was able to see awaiting_payment order!';
    END IF;

    SELECT count(*) INTO v_print_jobs_cnt FROM public.print_jobs WHERE order_id = v_order_id;
    IF v_print_jobs_cnt <> 0 THEN
        RAISE EXCEPTION 'FAIL 3b: Print job created prematurely for awaiting_payment order!';
    END IF;

    -- 3c. Payment webhook ('system' role) confirms payment -> transitions awaiting_payment -> new
    PERFORM set_config('app.current_role', 'system', true);
    UPDATE public.orders SET status = 'new' WHERE id = v_order_id;

    -- Now 'staff' role CAN see the order and accept it!
    PERFORM set_config('app.current_role', 'staff', true);
    SELECT count(*) INTO v_staff_visible_cnt FROM public.orders WHERE id = v_order_id;
    IF v_staff_visible_cnt <> 1 THEN
        RAISE EXCEPTION 'FAIL 3c: Staff role could not see order after payment confirmation (status=new)!';
    END IF;

    -- 3d. Staff attempts to tamper with address_snapshot or payment_method -> MUST FAIL
    v_err_caught := false;
    BEGIN
        UPDATE public.orders SET payment_method = 'cash_on_delivery' WHERE id = v_order_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 3d: Staff was able to mutate payment_method!';
    END IF;

    v_err_caught := false;
    BEGIN
        UPDATE public.orders SET address_snapshot = '{"tampered": true}'::jsonb WHERE id = v_order_id;
    EXCEPTION WHEN integrity_constraint_violation THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 3d: Staff was able to mutate address_snapshot!';
    END IF;

    -- 3e. Staff accepts order (new -> accepted) -> automatically creates kitchen_ticket print_job
    UPDATE public.orders SET status = 'accepted' WHERE id = v_order_id;

    SELECT count(*) INTO v_print_jobs_cnt
    FROM public.print_jobs
    WHERE order_id = v_order_id AND kind = 'kitchen_ticket' AND status = 'pending';

    IF v_print_jobs_cnt <> 1 THEN
        RAISE EXCEPTION 'FAIL 3e: Accepting order did not create pending kitchen_ticket print_job!';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 3: create_order, coupon redemption, awaiting_payment visibility, immutability & print_job trigger verified.';
END $$;

-- ============================================================================
-- TEST 4: anonymize_user() under real app_api role (KVKK / Apple / Google deletion)
-- ============================================================================
DO $$
DECLARE
    v_temp_user_id uuid := '99999999-8888-4777-8666-555555555555';
    v_user record;
    v_consent_cnt integer;
BEGIN
    SET ROLE app_api;
    PERFORM set_config('app.current_role', 'customer', true);
    PERFORM set_config('app.current_user_id', v_temp_user_id::text, true);

    PERFORM public.anonymize_user(v_temp_user_id);

    -- Verify as owner that user is anonymized and KVKK consent withdrawal log was written
    PERFORM set_config('app.current_role', 'owner', true);

    SELECT * INTO v_user FROM public.users WHERE id = v_temp_user_id;
    IF v_user.deleted_at IS NULL OR v_user.name <> 'Anonim Kullanıcı' OR v_user.phone IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL 4: anonymize_user did not scrub user PII properly! Got: %', v_user;
    END IF;

    SELECT count(*) INTO v_consent_cnt
    FROM public.consents
    WHERE user_id = v_temp_user_id AND type = 'privacy' AND granted = false;

    IF v_consent_cnt < 1 THEN
        RAISE EXCEPTION 'FAIL 4: anonymize_user did not record KVKK withdrawal in consents!';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 4: anonymize_user works under real app_api role with FORCE RLS.';
END $$;

-- ============================================================================
-- TEST 5: Audit Trail Hijack Prevention & Secret Redaction
-- ============================================================================
DO $$
DECLARE
    v_before_cnt integer;
    v_after_cnt integer;
    v_fake_cnt integer;
    v_latest_audit record;
    v_err_caught boolean;
BEGIN
    -- 5a. Attempt temp-table shadow attack on audit_logs:
    -- Even when pg_temp.audit_logs exists in the session and grants ALL to app_definer/app_api,
    -- fn_audit_log_trigger (SET search_path = public, pg_temp + schema-qualified public.audit_logs)
    -- MUST write to public.audit_logs and never to pg_temp.audit_logs.
    CREATE TEMP TABLE audit_logs (
        id uuid,
        actor_staff_id uuid,
        action text,
        table_name text,
        record_id text,
        old_values jsonb,
        new_values jsonb,
        ip inet,
        created_at timestamptz
    );
    GRANT ALL ON TABLE pg_temp.audit_logs TO app_api, app_definer, PUBLIC;

    SET ROLE app_api;
    PERFORM set_config('app.current_role', 'owner', true);

    SELECT count(*) INTO v_before_cnt FROM public.audit_logs;

    UPDATE public.delivery_zones
    SET min_order_kurus = min_order_kurus
    WHERE id = 'b0000000-0000-0000-0000-000000000001';

    SELECT count(*) INTO v_after_cnt FROM public.audit_logs;
    SELECT count(*) INTO v_fake_cnt FROM pg_temp.audit_logs;

    RESET ROLE;
    DROP TABLE pg_temp.audit_logs;

    SET ROLE app_api;
    PERFORM set_config('app.current_role', 'owner', true);

    IF v_after_cnt <> v_before_cnt + 1 OR v_fake_cnt <> 0 THEN
        RAISE EXCEPTION 'FAIL 5a: Audit trail hijack succeeded or public.audit_logs was bypassed!';
    END IF;

    -- 5b. Secret redaction in audit_logs when updating staff_users
    UPDATE public.staff_users
    SET password_hash = '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHNhbHQxMjM0NTY$dGVzdGhhc2gxMjM0NTY3ODkwYWJjZGVm',
        totp_secret_encrypted = 'ENC_SUPER_SECRET_TOTP_KEY'
    WHERE email = 'owner@kardeslercihangir.com';

    SELECT * INTO v_latest_audit
    FROM public.audit_logs
    WHERE table_name = 'staff_users'
    ORDER BY created_at DESC
    LIMIT 1;

    IF (v_latest_audit.new_values ? 'password_hash')
       OR (v_latest_audit.new_values ? 'totp_secret_encrypted')
       OR (v_latest_audit.old_values ? 'password_hash') THEN
        RAISE EXCEPTION 'FAIL 5b: Secret fields were NOT stripped from audit_logs! Got: %', v_latest_audit.new_values;
    END IF;

    -- 5c. Block TRUNCATE on append-only tables
    v_err_caught := false;
    BEGIN
        TRUNCATE public.audit_logs;
    EXCEPTION WHEN insufficient_privilege OR integrity_constraint_violation THEN
        v_err_caught := true;
    END;
    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 5c: TRUNCATE on audit_logs was not blocked!';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 5: Audit log search_path hardening, secret redaction & TRUNCATE protection verified.';
END $$;

-- ============================================================================
-- TEST 6: Deferred Constraint Enforcement (subtotal = SUM(items) & line_total = (unit+opts)*qty)
-- ============================================================================
DO $$
DECLARE
    v_alice_id uuid := '11111111-2222-4333-8444-555555555555';
    v_adana_id uuid := 'f0000000-0000-0000-0000-000000000001'; -- 34000 kuruş
    v_bad_order_id uuid;
    v_err_caught boolean := false;
BEGIN
    SET ROLE app_api;
    PERFORM set_config('app.current_role', 'owner', true);

    -- 6a. Owner/system inserts an order claiming subtotal 40000 kuruş, but only 1 item of 34000 kuruş
    BEGIN
        INSERT INTO public.orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method
        ) VALUES (
            v_alice_id, 'pickup', 'new', '2026-06-01', 9001, 'bad-math-order-1',
            40000, 0, 0, 40000, 0, 'Almila', '+905321112233', 'cash_on_delivery'
        ) RETURNING id INTO v_bad_order_id;

        INSERT INTO public.order_items (
            order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
            vat_rate_snapshot, quantity, line_total_kurus
        ) VALUES (
            v_bad_order_id, v_adana_id, 'Zırh Kıyma Adana Kebap', 34000, 1, 1, 34000
        );

        -- Trigger deferred constraint evaluation now
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_err_caught := true;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 6a: Mismatched order subtotal vs items sum was not caught by deferred constraint!';
    END IF;

    -- 6b. Owner/system inserts an order_item with line_total_kurus != (unit_price + options) * quantity
    v_err_caught := false;
    BEGIN
        INSERT INTO public.orders (
            user_id, order_type, status, business_date, order_number, idempotency_key,
            subtotal_kurus, discount_kurus, delivery_fee_kurus, total_kurus, min_order_kurus_applied,
            customer_name_snapshot, customer_phone_snapshot, payment_method
        ) VALUES (
            v_alice_id, 'pickup', 'new', '2026-06-01', 9002, 'bad-math-order-2',
            50000, 0, 0, 50000, 0, 'Almila', '+905321112233', 'cash_on_delivery'
        ) RETURNING id INTO v_bad_order_id;

        INSERT INTO public.order_items (
            order_id, menu_item_id, name_snapshot, unit_price_snapshot_kurus,
            vat_rate_snapshot, quantity, line_total_kurus
        ) VALUES (
            v_bad_order_id, v_adana_id, 'Zırh Kıyma Adana Kebap', 10000, 1, 2, 50000 -- 10000 * 2 != 50000
        );

        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_err_caught := true;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'FAIL 6b: Mismatched order_item line_total math was not caught by deferred constraint!';
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 6: Deferred math constraints (subtotal_kurus & line_total_kurus) verified.';
END $$;

-- ============================================================================
-- TEST 7: Turkish translation child delete guard + 100+ item bulk staging import
-- ============================================================================
DO $$
DECLARE
    v_owner_id uuid := 'a0000000-0000-0000-0000-000000000001';
    v_adana_id uuid := 'f0000000-0000-0000-0000-000000000001';
    v_tr_del_blocked boolean := false;
    v_i integer;
    v_imported integer := 0;
BEGIN
    SET LOCAL ROLE app_api;
    PERFORM set_config('app.current_role', 'owner', true);
    PERFORM set_config('app.current_staff_id', v_owner_id::text, true);

    -- 7a. Attempting to delete the required Turkish ('tr') child translation must fail at deferrable check
    BEGIN
        DELETE FROM public.menu_item_translations
        WHERE menu_item_id = v_adana_id AND language = 'tr';
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN check_violation THEN
        v_tr_del_blocked := true;
    END;

    IF NOT v_tr_del_blocked THEN
        RAISE EXCEPTION 'FAIL 7a: Deleting required Turkish (tr) translation under app_api was not blocked!';
    END IF;

    -- 7b. Bulk stage 105 menu items and execute fn_process_menu_import_staging()
    FOR v_i IN 1..105 LOOP
        INSERT INTO public.menu_import_staging (
            category_slug, category_name_tr, item_slug, item_name_tr, price_try, vat_rate_percent, is_available, sort_order
        ) VALUES (
            'bulk-cat-01', 'Toplu Kategori', 'bulk-item-' || v_i, 'Toplu Ürün ' || v_i, 125.50, 10, true, v_i
        );
    END LOOP;

    SELECT public.fn_process_menu_import_staging() INTO v_imported;
    IF v_imported <> 105 THEN
        RAISE EXCEPTION 'FAIL 7b: Expected 105 bulk staging items imported, got %', v_imported;
    END IF;

    RESET ROLE;
    RAISE NOTICE 'PASS Test 7: Required Turkish translation delete guard & 105-item bulk staging import verified.';
END $$;

ROLLBACK;
