-- Migration: 010_user_identities.sql (Google OIDC Identity Links & KVKK Erasure)
SET ROLE app_migrator;

CREATE TABLE IF NOT EXISTS public.user_identities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email_at_link citext,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_identities_provider_subject
    ON public.user_identities (provider, provider_subject);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_identities_user_provider
    ON public.user_identities (user_id, provider);

ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_user_identities_isolation ON public.user_identities;
DROP POLICY IF EXISTS user_identities_isolation ON public.user_identities;

CREATE POLICY user_identities_isolation ON public.user_identities
    USING (
        COALESCE(NULLIF(current_setting('app.current_role', true), ''), '') IN ('auth', 'staff', 'owner', 'system')
        OR (
            COALESCE(NULLIF(current_setting('app.current_role', true), ''), '') = 'customer'
            AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    )
    WITH CHECK (
        COALESCE(NULLIF(current_setting('app.current_role', true), ''), '') IN ('auth', 'staff', 'owner', 'system')
        OR (
            COALESCE(NULLIF(current_setting('app.current_role', true), ''), '') = 'customer'
            AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    );

DROP POLICY IF EXISTS pol_admin_migrator_user_identities ON public.user_identities;
CREATE POLICY pol_admin_migrator_user_identities ON public.user_identities
    FOR ALL TO app_migrator USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_identities TO app_api;
GRANT SELECT ON public.user_identities TO app_readonly;

RESET ROLE;

-- Update anonymize_user to delete user_identities (owned by app_definer)
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    DELETE FROM public.user_identities WHERE user_id = p_user_id;

    IF v_user_phone IS NOT NULL THEN
        DELETE FROM public.otp_codes WHERE phone = v_user_phone;
    END IF;

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
$function$;

ALTER FUNCTION public.anonymize_user(uuid) OWNER TO app_definer;
