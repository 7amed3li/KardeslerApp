-- ============================================================================
-- Migration: 002_core.sql (Hardened Production Grade)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Core tables: settings, staff, users, authentication, devices,
--              addresses, KVKK consents, delivery zones, drivers, hardened audit logs,
--              foreign key indexes, and authorized user anonymization.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COMMON UTILITY FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION fn_set_updated_at() IS 'Maintains updated_at timestamp on row mutation.';

-- Prevent UPDATE, DELETE, or TRUNCATE on strictly append-only tables
CREATE OR REPLACE FUNCTION fn_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is strictly append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.', TG_TABLE_NAME
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION fn_prevent_mutation() IS 'Enforces append-only semantics by raising an exception on mutation or truncation.';

-- ----------------------------------------------------------------------------
-- 2. RESTAURANT SETTINGS (SINGLETON)
-- ----------------------------------------------------------------------------
CREATE TABLE restaurant_settings (
    id integer PRIMARY KEY DEFAULT 1,
    name text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 150),
    phone text NOT NULL CHECK (phone ~ '^\+[1-9]\d{7,14}$'),
    address text NOT NULL CHECK (length(trim(address)) > 0 AND length(address) <= 300),
    is_accepting_orders boolean NOT NULL DEFAULT true,
    opening_hours jsonb NOT NULL,
    business_day_cutoff time NOT NULL DEFAULT '06:00:00',
    min_app_version text NOT NULL DEFAULT '1.0.0',
    currency text NOT NULL DEFAULT 'TRY',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_restaurant_settings_singleton CHECK (id = 1),
    CONSTRAINT chk_restaurant_settings_currency_try CHECK (currency = 'TRY'),
    CONSTRAINT chk_restaurant_settings_opening_hours_json CHECK (jsonb_typeof(opening_hours) IN ('object', 'array'))
);

COMMENT ON TABLE restaurant_settings IS 'Singleton table storing restaurant operating configuration and business day cutoff.';

CREATE TRIGGER trg_restaurant_settings_updated_at
BEFORE UPDATE ON restaurant_settings
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Prevent deletion of singleton settings row
CREATE OR REPLACE FUNCTION fn_prevent_settings_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'restaurant_settings singleton row cannot be deleted.'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurant_settings_prevent_delete
BEFORE DELETE ON restaurant_settings
FOR EACH ROW EXECUTE FUNCTION fn_prevent_settings_delete();

-- ----------------------------------------------------------------------------
-- 3. STAFF USERS
-- ----------------------------------------------------------------------------
CREATE TABLE staff_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext UNIQUE NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    totp_secret_encrypted text,
    totp_enabled boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_staff_users_role CHECK (role IN ('owner', 'staff')),
    CONSTRAINT chk_staff_users_email_valid CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    -- Password hash must be a valid Argon2 or bcrypt hash (minimum 20 chars)
    CONSTRAINT chk_staff_users_pwd_hash CHECK (length(password_hash) >= 20 AND password_hash ~ '^\$(argon2|2[aby])'),
    -- If 2FA is enabled, encrypted secret must be present
    CONSTRAINT chk_staff_users_totp_consistency CHECK (totp_enabled = false OR totp_secret_encrypted IS NOT NULL)
);

COMMENT ON TABLE staff_users IS 'Backoffice personnel accounts with mandatory Argon2 hashing and optional 2FA.';

CREATE TRIGGER trg_staff_users_updated_at
BEFORE UPDATE ON staff_users
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. CUSTOMERS (USERS)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text,
    name text,
    email citext,
    preferred_language text NOT NULL DEFAULT 'tr',
    referral_code text UNIQUE NOT NULL,
    referred_by_user_id uuid,
    deleted_at timestamptz,
    anonymized_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_users_referred_by FOREIGN KEY (referred_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{7,14}$'),
    CONSTRAINT chk_users_preferred_language CHECK (preferred_language IN ('tr', 'en', 'ar')),
    CONSTRAINT chk_users_email_valid CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_users_name_len CHECK (name IS NULL OR (length(trim(name)) > 0 AND length(name) <= 150))
);

COMMENT ON TABLE users IS 'Patron profiles. PII is scrubbed on account erasure under KVKK compliance.';

CREATE INDEX idx_users_referred_by ON users(referred_by_user_id);
CREATE UNIQUE INDEX idx_users_active_phone ON users(phone)
WHERE phone IS NOT NULL AND deleted_at IS NULL AND anonymized_at IS NULL;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. AUTHENTICATION (HMAC-SALTED OTP & REFRESH TOKENS)
-- ----------------------------------------------------------------------------
CREATE TABLE otp_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL,
    salt text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    consumed_at timestamptz,
    ip inet,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_otp_codes_phone_e164 CHECK (phone ~ '^\+[1-9]\d{7,14}$'),
    CONSTRAINT chk_otp_codes_attempts_limit CHECK (attempts >= 0 AND attempts <= 5),
    CONSTRAINT chk_otp_codes_hash_len CHECK (length(code_hash) >= 32)
);

COMMENT ON TABLE otp_codes IS 'Hashed one-time verification passwords protected with per-code salts.';
CREATE INDEX idx_otp_codes_lookup ON otp_codes(phone, created_at DESC) WHERE consumed_at IS NULL;

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    staff_user_id uuid,
    token_hash text UNIQUE NOT NULL,
    family_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by_id uuid,
    device_info text,
    ip inet,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_refresh_tokens_staff FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_refresh_tokens_replacement FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    CONSTRAINT chk_refresh_tokens_subject CHECK (
        (user_id IS NOT NULL AND staff_user_id IS NULL) OR
        (user_id IS NULL AND staff_user_id IS NOT NULL)
    )
);

COMMENT ON TABLE refresh_tokens IS 'Rotating refresh tokens supporting token families for breach/reuse detection.';
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_staff ON refresh_tokens(staff_user_id);
CREATE INDEX idx_refresh_tokens_replaced_by ON refresh_tokens(replaced_by_id);

-- ----------------------------------------------------------------------------
-- 6. USER DEVICES & ADDRESSES
-- ----------------------------------------------------------------------------
CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    push_token text UNIQUE NOT NULL,
    platform text NOT NULL,
    app_version text NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_devices_platform CHECK (platform IN ('ios', 'android'))
);

CREATE INDEX idx_devices_user ON devices(user_id);

CREATE TRIGGER trg_devices_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    label text NOT NULL,
    full_address text NOT NULL,
    location geography(Point, 4326) NOT NULL,
    building text,
    floor text,
    apartment text,
    notes text,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_addresses_label_len CHECK (length(trim(label)) > 0 AND length(label) <= 50),
    CONSTRAINT chk_addresses_full_address_len CHECK (length(trim(full_address)) > 0 AND length(full_address) <= 500)
);

CREATE INDEX idx_addresses_user_id ON addresses(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_addresses_location_gist ON addresses USING GIST(location);

CREATE TRIGGER trg_addresses_updated_at
BEFORE UPDATE ON addresses
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. KVKK & IYS COMPLIANCE CONSENTS (APPEND-ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    type text NOT NULL,
    granted boolean NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    source text NOT NULL,
    version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_consents_type CHECK (type IN ('terms', 'privacy', 'marketing_sms', 'marketing_push', 'marketing_email'))
);

CREATE INDEX idx_consents_user ON consents(user_id);
CREATE INDEX idx_consents_user_type ON consents(user_id, type, granted_at DESC);

CREATE TRIGGER trg_consents_prevent_mutation
BEFORE UPDATE OR DELETE ON consents
FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

CREATE TRIGGER trg_consents_prevent_truncate
BEFORE TRUNCATE ON consents
FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_mutation();

-- ----------------------------------------------------------------------------
-- 8. DELIVERY ZONES & DRIVERS
-- ----------------------------------------------------------------------------
CREATE TABLE delivery_zones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    area geography(Polygon, 4326) NOT NULL,
    min_order_kurus bigint NOT NULL,
    delivery_fee_kurus bigint NOT NULL DEFAULT 0,
    estimated_minutes integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_delivery_zones_area_valid CHECK (ST_IsValid(area::geometry)),
    -- Area limit: Maximum 100 km² (100,000,000 m²), prevents accidental continent-sized polygon
    CONSTRAINT chk_delivery_zones_area_limit CHECK (ST_Area(area::geography) <= 100000000),
    CONSTRAINT chk_delivery_zones_min_order CHECK (min_order_kurus >= 0),
    CONSTRAINT chk_delivery_zones_delivery_fee CHECK (delivery_fee_kurus >= 0),
    CONSTRAINT chk_delivery_zones_estimated_minutes CHECK (estimated_minutes > 0)
);

CREATE INDEX idx_delivery_zones_area_gist ON delivery_zones USING GIST(area);

CREATE TRIGGER trg_delivery_zones_updated_at
BEFORE UPDATE ON delivery_zones
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Spatial query helper function with strict coordinate bounds validation
CREATE OR REPLACE FUNCTION find_delivery_zone(p_lat double precision, p_lng double precision)
RETURNS SETOF delivery_zones AS $$
BEGIN
    IF p_lat IS NULL OR p_lng IS NULL OR p_lat < -90.0 OR p_lat > 90.0 OR p_lng < -180.0 OR p_lng > 180.0 THEN
        RAISE EXCEPTION 'Invalid geographic coordinates: lat=%, lng=% (latitude must be [-90,90], longitude [-180,180])',
            p_lat, p_lng
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    RETURN QUERY
    SELECT *
    FROM delivery_zones
    WHERE is_active = true
      AND ST_Covers(area, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    ORDER BY min_order_kurus ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_delivery_zone(double precision, double precision) IS 'Finds active delivery zone covering the given valid WGS84 coordinates.';

CREATE TABLE drivers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
    phone text NOT NULL CHECK (phone ~ '^\+[1-9]\d{7,14}$'),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER trg_drivers_updated_at
BEFORE UPDATE ON drivers
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. HARDENED AUDIT LOGS (APPEND-ONLY & SECURITY DEFINER SEARCH PATH)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_staff_id uuid,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    old_values jsonb,
    new_values jsonb,
    ip inet,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL,
    CONSTRAINT chk_audit_logs_action CHECK (action IN ('insert', 'update', 'delete'))
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_staff_id);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TRIGGER trg_audit_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

CREATE TRIGGER trg_audit_logs_prevent_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_mutation();

-- Automated audit trigger function hardened against search_path hijacking
-- and scrubbed of sensitive credential fields (passwords, TOTP secrets, tokens)
CREATE OR REPLACE FUNCTION fn_audit_log_trigger()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
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

    -- PII & CREDENTIAL HARDENING:
    -- Remove password_hash and totp_secret_encrypted from audit snapshots!
    IF TG_TABLE_NAME = 'staff_users' THEN
        IF v_new IS NOT NULL THEN
            v_new := v_new - 'password_hash' - 'totp_secret_encrypted';
        END IF;
        IF v_old IS NOT NULL THEN
            v_old := v_old - 'password_hash' - 'totp_secret_encrypted';
        END IF;
    ELSIF TG_TABLE_NAME = 'otp_codes' THEN
        IF v_new IS NOT NULL THEN v_new := v_new - 'code_hash' - 'salt'; END IF;
        IF v_old IS NOT NULL THEN v_old := v_old - 'code_hash' - 'salt'; END IF;
    ELSIF TG_TABLE_NAME = 'refresh_tokens' THEN
        IF v_new IS NOT NULL THEN v_new := v_new - 'token_hash'; END IF;
        IF v_old IS NOT NULL THEN v_old := v_old - 'token_hash'; END IF;
    END IF;

    INSERT INTO public.audit_logs (actor_staff_id, action, table_name, record_id, old_values, new_values)
    VALUES (v_actor_id, v_action, TG_TABLE_NAME, v_record_id, v_old, v_new);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_restaurant_settings
AFTER INSERT OR UPDATE OR DELETE ON restaurant_settings
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

CREATE TRIGGER trg_audit_staff_users
AFTER INSERT OR UPDATE OR DELETE ON staff_users
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

CREATE TRIGGER trg_audit_delivery_zones
AFTER INSERT OR UPDATE OR DELETE ON delivery_zones
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ----------------------------------------------------------------------------
-- 10. AUTHORIZED USER ANONYMIZATION (KVKK / GDPR ERASURE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION anonymize_user(p_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_anon_tag text;
    v_user_phone text;
    v_caller_user_id uuid;
    v_is_staff boolean;
BEGIN
    -- 1. Strict Authorization Verification:
    -- Caller MUST be either the user themselves or restaurant staff/owner
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
        RAISE EXCEPTION 'Unauthorized: Caller cannot request account erasure for user %', p_user_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT phone INTO v_user_phone FROM users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found', p_user_id
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_anon_tag := 'ANON_' || substr(p_user_id::text, 1, 8);

    -- 2. Delete devices, sessions, and addresses
    DELETE FROM devices WHERE user_id = p_user_id;
    DELETE FROM refresh_tokens WHERE user_id = p_user_id;
    DELETE FROM addresses WHERE user_id = p_user_id;

    -- 3. Delete any active OTP codes matching this customer phone
    IF v_user_phone IS NOT NULL THEN
        DELETE FROM otp_codes WHERE phone = v_user_phone;
    END IF;

    -- 4. Purge consents records
    DELETE FROM consents WHERE user_id = p_user_id;

    -- 5. Sanitize snapshot PII in orders table:
    -- Retain financial, tax VAT, items and accounting records, while scrubing personal notes and phone
    UPDATE orders
    SET
        customer_name_snapshot = 'Kullanıcı Silindi (Anonymized)',
        customer_phone_snapshot = '+900000000000',
        customer_note = NULL,
        address_snapshot = jsonb_build_object('anonymized', true)
    WHERE user_id = p_user_id;

    -- 6. Anonymize user record
    UPDATE users
    SET
        phone = NULL,
        name = 'Kullanıcı Silindi (Anonymized)',
        email = NULL,
        referral_code = v_anon_tag,
        deleted_at = clock_timestamp(),
        anonymized_at = clock_timestamp()
    WHERE id = p_user_id;

    -- 7. Audit entry
    INSERT INTO audit_logs (action, table_name, record_id, new_values)
    VALUES (
        'update',
        'users',
        p_user_id::text,
        jsonb_build_object('event', 'anonymize_user', 'anonymized_at', clock_timestamp())
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION anonymize_user(uuid) IS 'Purges PII, OTP codes, devices, addresses, and sanitizes order snapshots under authorized caller check.';
