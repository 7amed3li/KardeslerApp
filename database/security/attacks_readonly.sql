-- ============================================================================
-- Security Attack Regression Suite: Read-Only Role Isolation
-- Role: app_readonly
-- Expected outcome for ALL attacks: BLOCKED
-- ============================================================================

\set ON_ERROR_STOP on

SELECT '=== RUNNING SECURITY ATTACKS AS app_readonly ===' AS banner;

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

SELECT '=== ALL app_readonly ATTACKS VERIFIED BLOCKED ===' AS summary;

