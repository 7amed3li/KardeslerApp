-- ============================================================================
-- Migration: 001_extensions_and_roles.sql
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Installs PostgreSQL extensions, sets up least-privileged roles,
--              hardens connection limits, session timeouts, and revokes default
--              public privileges.
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. APPLICATION ROLES
-- Role passwords should be supplied via environment variables in production.
-- Safe development defaults are initialized if not already existing.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrator') THEN
        CREATE ROLE app_migrator WITH LOGIN PASSWORD 'migrator_dev_secret_change_me'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    ELSE
        ALTER ROLE app_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_api') THEN
        CREATE ROLE app_api WITH LOGIN PASSWORD 'api_dev_secret_change_me'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_readonly') THEN
        CREATE ROLE app_readonly WITH LOGIN PASSWORD 'readonly_dev_secret_change_me'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_definer') THEN
        CREATE ROLE app_definer WITH NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
    ELSE
        ALTER ROLE app_definer WITH NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;

    GRANT app_readonly, app_api, app_definer TO app_migrator;
END $$;

-- 3. CONNECTION & TIMEOUT HARDENING
-- Prevent resource starvation and hanging connection leaks
ALTER ROLE app_api CONNECTION LIMIT 50;
ALTER ROLE app_api SET statement_timeout = '30s';
ALTER ROLE app_api SET idle_in_transaction_session_timeout = '60s';

ALTER ROLE app_readonly CONNECTION LIMIT 10;
ALTER ROLE app_readonly SET statement_timeout = '15s';

-- 4. DATABASE & SCHEMA LEVEL HARDENING
-- Revoke all default public permissions to enforce defense-in-depth
REVOKE ALL ON DATABASE kardesler_db FROM PUBLIC;
REVOKE CREATE, TEMP ON DATABASE kardesler_db FROM PUBLIC;

GRANT CONNECT, TEMPORARY ON DATABASE kardesler_db TO app_migrator;
GRANT CONNECT ON DATABASE kardesler_db TO app_api, app_readonly;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO app_migrator, app_api, app_readonly;
GRANT CREATE, USAGE ON SCHEMA public TO app_migrator, app_definer;
ALTER SCHEMA public OWNER TO app_migrator;

-- Revoke default public execution on all future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_api;
