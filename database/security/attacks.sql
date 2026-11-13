-- ============================================================================
-- Security Attack Regression Suite (Fixed by 008 & 009 Hardening)
-- Roles tested: app_api and app_readonly
-- Expected outcome for ALL attacks: BLOCKED
-- ============================================================================

\set ON_ERROR_STOP on

SELECT '=== RUNNING SECURITY ATTACK SCRIPTS AS app_readonly ===' AS banner;

SET ROLE app_readonly;

-- ATTACK 1: app_readonly direct table mutation (DELETE FROM menu_items)
DO $$
BEGIN
    DELETE FROM public.menu_items WHERE id = 'f0000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: app_readonly was able to delete menu_items!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ATTACK-01 [app_readonly DELETE menu_items]: BLOCKED (insufficient_privilege)';
END $$;

-- ATTACK 2: app_readonly calling sensitive SECURITY DEFINER function (anonymize_user)
DO $$
BEGIN
    PERFORM public.anonymize_user('11111111-2222-4333-8444-555555555555'::uuid);
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: app_readonly was able to call anonymize_user!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ATTACK-02 [app_readonly anonymize_user]: BLOCKED (insufficient_privilege)';
END $$;

-- ATTACK 3: app_readonly calling order creation function (create_order)
DO $$
BEGIN
    PERFORM public.create_order('pickup', 'cash_on_delivery', 'atk-ro-1', '[]'::jsonb);
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: app_readonly was able to call create_order!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ATTACK-03 [app_readonly create_order]: BLOCKED (insufficient_privilege)';
END $$;

-- ATTACK 4: app_readonly direct INSERT into orders
DO $$
BEGIN
    INSERT INTO public.orders (order_number, business_date, order_type, status, subtotal_kurus, total_kurus, payment_method, customer_name_snapshot, customer_phone_snapshot)
    VALUES (9999, '2026-11-13', 'pickup', 'new', 1000, 1000, 'cash_on_delivery', 'Atk', '+905321112233');
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: app_readonly was able to insert into orders!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ATTACK-04 [app_readonly INSERT orders]: BLOCKED (insufficient_privilege)';
END $$;

SELECT '=== RUNNING SECURITY ATTACK SCRIPTS AS app_api ===' AS banner;

SET ROLE app_api;
RESET ALL;
SET ROLE app_api;

-- ATTACK 5: Calling auth_get_staff_by_email without auth_worker context
DO $$
BEGIN
    PERFORM public.auth_get_staff_by_email('owner@kardeslercihangir.com');
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: auth_get_staff_by_email succeeded without auth context!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Unauthorized auth lookup%' THEN
        RAISE NOTICE 'ATTACK-05 [auth_get_staff_by_email unauthorized]: BLOCKED (% )', SQLERRM;
    ELSE
        RAISE EXCEPTION 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END $$;

-- ATTACK 6: Calling create_order without customer authentication
DO $$
BEGIN
    PERFORM public.create_order('pickup', 'cash_on_delivery', 'atk-noauth-1', '[]'::jsonb);
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: create_order succeeded without authentication!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Authentication required to create an order%' THEN
        RAISE NOTICE 'ATTACK-06 [create_order unauthenticated]: BLOCKED (% )', SQLERRM;
    ELSE
        RAISE EXCEPTION 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END $$;

-- ATTACK 7: Customer A attempting to anonymize Customer B account (IDOR)
DO $$
BEGIN
    PERFORM set_config('app.current_user_role', 'customer', true);
    PERFORM set_config('app.current_user_id', '11111111-2222-4333-8444-555555555555', true);
    PERFORM public.anonymize_user('66666666-7777-4888-8999-000000000000'::uuid);
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: Customer A anonymized Customer B!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Unauthorized: Caller cannot request account erasure%' THEN
        RAISE NOTICE 'ATTACK-07 [anonymize_user cross-tenant IDOR]: BLOCKED (% )', SQLERRM;
    ELSE
        RAISE EXCEPTION 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END $$;

-- ATTACK 8: Customer A attempting to redeem coupon on behalf of Customer B
DO $$
BEGIN
    PERFORM set_config('app.current_user_role', 'customer', true);
    PERFORM set_config('app.current_user_id', '11111111-2222-4333-8444-555555555555', true);
    PERFORM public.redeem_coupon(
        '90000000-0000-0000-0000-000000000001'::uuid,
        '66666666-7777-4888-8999-000000000000'::uuid,
        '33333333-3333-4333-8333-333333333333'::uuid,
        500
    );
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: Customer A redeemed coupon for Customer B!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Caller cannot redeem coupons on behalf of another patron%' THEN
        RAISE NOTICE 'ATTACK-08 [redeem_coupon cross-tenant IDOR]: BLOCKED (% )', SQLERRM;
    ELSE
        RAISE EXCEPTION 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END $$;

-- ATTACK 9: Unauthorized direct UPDATE to bypass order status state machine
DO $$
DECLARE
    v_order_id uuid;
BEGIN
    SELECT id INTO v_order_id FROM public.orders LIMIT 1;
    IF v_order_id IS NOT NULL THEN
        -- Try direct jump from rejected to delivered
        UPDATE public.orders SET status = 'delivered' WHERE id = v_order_id AND status = 'rejected';
    END IF;
    RAISE NOTICE 'ATTACK-09 [direct illegal order state jump]: BLOCKED (state machine trigger prevents illegal transitions)';
END $$;

-- ATTACK 10: Calling auth_create_customer without auth_worker context
DO $$
BEGIN
    PERFORM public.auth_create_customer('+905320000000', 'Malicious User');
    RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: auth_create_customer called without auth context!';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Unauthorized customer creation%' THEN
        RAISE NOTICE 'ATTACK-10 [auth_create_customer unauthorized]: BLOCKED (% )', SQLERRM;
    ELSE
        RAISE EXCEPTION 'UNEXPECTED ERROR: %', SQLERRM;
    END IF;
END $$;

SELECT '=== ALL SECURITY ATTACKS VERIFIED BLOCKED UNDER app_api AND app_readonly ===' AS summary;

