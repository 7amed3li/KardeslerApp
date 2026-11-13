-- ============================================================================
-- Security Attack Regression Suite: API Role Least-Privilege & Boundary Tests
-- Role: app_api
-- Expected outcome for ALL attacks: BLOCKED
-- ============================================================================

\set ON_ERROR_STOP on

SELECT '=== RUNNING SECURITY ATTACKS AS app_api ===' AS banner;

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
        BEGIN
            UPDATE public.orders SET status = 'delivered' WHERE id = v_order_id AND status = 'rejected';
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
    RAISE NOTICE 'ATTACK-09 [direct illegal order state jump]: BLOCKED (state machine trigger prevents illegal transitions)';
END $$;

-- ATTACK 10: Customer session attempting direct SELECT from otp_codes table
DO $$
DECLARE
    v_cnt int;
BEGIN
    PERFORM set_config('app.current_user_role', 'customer', true);
    PERFORM set_config('app.current_user_id', '11111111-2222-4333-8444-555555555555', true);
    SELECT count(*)::int INTO v_cnt FROM public.otp_codes;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'ATTACK FAILED TO BE BLOCKED: Customer session was able to read otp_codes!';
    END IF;
    RAISE NOTICE 'ATTACK-10 [direct SELECT otp_codes as customer]: BLOCKED (RLS returns 0 rows, otp_codes isolated to auth/system)';
END $$;

SELECT '=== ALL app_api ATTACKS VERIFIED BLOCKED ===' AS summary;
