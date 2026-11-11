-- ============================================================================
-- Migration: 003_menu.sql (Hardened Production Grade)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Menu schema: categories, items, translations, badges/tags,
--              option groups, ready-made options, automated price history,
--              foreign key indexes, and bidirectional Turkish translation triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CATEGORIES & CATEGORY TRANSLATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE categories IS 'Food categories (Kebaplar, Dürümler, Pide, Mezeler, Tatlılar, İçecekler).';

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE category_translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL,
    language text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_category_translations_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    CONSTRAINT uq_category_translations_lang UNIQUE (category_id, language),
    CONSTRAINT chk_category_translations_lang CHECK (language IN ('tr', 'en', 'ar')),
    CONSTRAINT chk_category_translations_name_len CHECK (length(trim(name)) > 0 AND length(name) <= 100)
);

CREATE INDEX idx_category_translations_category ON category_translations(category_id);

CREATE TRIGGER trg_category_translations_updated_at
BEFORE UPDATE ON category_translations
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. MENU ITEMS & TRANSLATIONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_allergens(p_allergens text[])
RETURNS boolean AS $$
DECLARE
    v_valid text[] := ARRAY[
        'gluten', 'dairy', 'nuts', 'peanuts', 'eggs', 'soy',
        'sesame', 'celery', 'mustard', 'lupin', 'fish', 'crustaceans',
        'molluscs', 'sulphites'
    ];
BEGIN
    RETURN p_allergens <@ v_valid;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE menu_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL,
    price_kurus bigint NOT NULL,
    vat_rate_percent integer NOT NULL DEFAULT 1,
    image_url text,
    is_available boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    allergens text[] NOT NULL DEFAULT '{}',
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_menu_items_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    CONSTRAINT chk_menu_items_price_non_neg CHECK (price_kurus >= 0),
    CONSTRAINT chk_menu_items_vat_rate CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100),
    CONSTRAINT chk_menu_items_allergens_valid CHECK (fn_validate_allergens(allergens))
);

CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_category_sort ON menu_items(category_id, sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_menu_items_updated_at
BEFORE UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE menu_item_translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id uuid NOT NULL,
    language text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_menu_item_translations_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT uq_menu_item_translations_lang UNIQUE (menu_item_id, language),
    CONSTRAINT chk_menu_item_translations_lang CHECK (language IN ('tr', 'en', 'ar')),
    CONSTRAINT chk_menu_item_translations_name_len CHECK (length(trim(name)) > 0 AND length(name) <= 200)
);

CREATE INDEX idx_menu_item_translations_item ON menu_item_translations(menu_item_id);

CREATE TRIGGER trg_menu_item_translations_updated_at
BEFORE UPDATE ON menu_item_translations
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. BADGES & TAGS
-- ----------------------------------------------------------------------------
CREATE TABLE tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL CHECK (length(trim(slug)) > 0 AND length(slug) <= 50),
    icon text,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TRIGGER trg_tags_updated_at
BEFORE UPDATE ON tags
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE tag_translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id uuid NOT NULL,
    language text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_tag_translations_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    CONSTRAINT uq_tag_translations_lang UNIQUE (tag_id, language),
    CONSTRAINT chk_tag_translations_lang CHECK (language IN ('tr', 'en', 'ar')),
    CONSTRAINT chk_tag_translations_name_len CHECK (length(trim(name)) > 0 AND length(name) <= 50)
);

CREATE INDEX idx_tag_translations_tag ON tag_translations(tag_id);

CREATE TRIGGER trg_tag_translations_updated_at
BEFORE UPDATE ON tag_translations
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE menu_item_tags (
    menu_item_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT pk_menu_item_tags PRIMARY KEY (menu_item_id, tag_id),
    CONSTRAINT fk_menu_item_tags_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_menu_item_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_menu_item_tags_tag ON menu_item_tags(tag_id);

-- ----------------------------------------------------------------------------
-- 4. OPTION GROUPS & READY-MADE OPTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE option_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id uuid NOT NULL,
    min_select integer NOT NULL DEFAULT 0,
    max_select integer NOT NULL DEFAULT 1,
    is_required boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_option_groups_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT chk_option_groups_min_non_neg CHECK (min_select >= 0),
    CONSTRAINT chk_option_groups_max_range CHECK (max_select >= min_select)
);

CREATE INDEX idx_option_groups_item ON option_groups(menu_item_id);

CREATE TRIGGER trg_option_groups_updated_at
BEFORE UPDATE ON option_groups
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE option_group_translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_group_id uuid NOT NULL,
    language text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_option_group_translations_grp FOREIGN KEY (option_group_id) REFERENCES option_groups(id) ON DELETE CASCADE,
    CONSTRAINT uq_option_group_translations_lang UNIQUE (option_group_id, language),
    CONSTRAINT chk_option_group_translations_lang CHECK (language IN ('tr', 'en', 'ar')),
    CONSTRAINT chk_option_group_translations_name_len CHECK (length(trim(name)) > 0 AND length(name) <= 100)
);

CREATE INDEX idx_option_group_translations_grp ON option_group_translations(option_group_id);

CREATE TRIGGER trg_option_group_translations_updated_at
BEFORE UPDATE ON option_group_translations
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_group_id uuid NOT NULL,
    price_delta_kurus bigint NOT NULL DEFAULT 0,
    is_available boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_options_group FOREIGN KEY (option_group_id) REFERENCES option_groups(id) ON DELETE CASCADE,
    CONSTRAINT chk_options_price_delta CHECK (price_delta_kurus >= -500000)
);

CREATE INDEX idx_options_group ON options(option_group_id);

CREATE TRIGGER trg_options_updated_at
BEFORE UPDATE ON options
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE option_translations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id uuid NOT NULL,
    language text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_option_translations_opt FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
    CONSTRAINT uq_option_translations_lang UNIQUE (option_id, language),
    CONSTRAINT chk_option_translations_lang CHECK (language IN ('tr', 'en', 'ar')),
    CONSTRAINT chk_option_translations_name_len CHECK (length(trim(name)) > 0 AND length(name) <= 100)
);

CREATE INDEX idx_option_translations_opt ON option_translations(option_id);

CREATE TRIGGER trg_option_translations_updated_at
BEFORE UPDATE ON option_translations
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. AUTOMATED PRICE HISTORY & AUDIT TRIGGERS
-- ----------------------------------------------------------------------------
CREATE TABLE price_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id uuid NOT NULL,
    old_price_kurus bigint NOT NULL,
    new_price_kurus bigint NOT NULL,
    changed_by_staff_id uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_price_history_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_price_history_staff FOREIGN KEY (changed_by_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL,
    CONSTRAINT chk_price_history_old_price CHECK (old_price_kurus >= 0),
    CONSTRAINT chk_price_history_new_price CHECK (new_price_kurus >= 0)
);

CREATE INDEX idx_price_history_item ON price_history(menu_item_id);
CREATE INDEX idx_price_history_staff ON price_history(changed_by_staff_id);

CREATE TRIGGER trg_price_history_prevent_mutation
BEFORE UPDATE OR DELETE ON price_history
FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

CREATE TRIGGER trg_price_history_prevent_truncate
BEFORE TRUNCATE ON price_history
FOR EACH STATEMENT EXECUTE FUNCTION fn_prevent_mutation();

CREATE OR REPLACE FUNCTION fn_record_price_history()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_id uuid;
BEGIN
    IF OLD.price_kurus <> NEW.price_kurus THEN
        BEGIN
            v_staff_id := NULLIF(current_setting('app.current_staff_id', true), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_staff_id := NULL;
        END;

        INSERT INTO price_history (menu_item_id, old_price_kurus, new_price_kurus, changed_by_staff_id)
        VALUES (NEW.id, OLD.price_kurus, NEW.price_kurus, v_staff_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_menu_items_price_history
AFTER UPDATE OF price_kurus ON menu_items
FOR EACH ROW EXECUTE FUNCTION fn_record_price_history();

CREATE TRIGGER trg_audit_menu_items
AFTER INSERT OR UPDATE OR DELETE ON menu_items
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

CREATE TRIGGER trg_audit_options
AFTER INSERT OR UPDATE OR DELETE ON options
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ----------------------------------------------------------------------------
-- 6. BIDIRECTIONAL MANDATORY TURKISH TRANSLATION ENFORCEMENT
-- ----------------------------------------------------------------------------
-- Verifies Turkish row exists on parent insertion/mutation AND on child deletion!
CREATE OR REPLACE FUNCTION fn_enforce_turkish_translation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'categories' THEN
        IF NOT EXISTS (
            SELECT 1 FROM category_translations ct
            WHERE ct.category_id = NEW.id AND ct.language = 'tr' AND length(trim(ct.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Category % requires a valid Turkish (tr) translation.', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'category_translations' THEN
        -- When someone deletes or alters language of a translation, ensure category still has 'tr'
        IF NOT EXISTS (
            SELECT 1 FROM category_translations ct
            WHERE ct.category_id = OLD.category_id AND ct.language = 'tr' AND length(trim(ct.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Cannot remove Turkish (tr) translation from Category %.', OLD.category_id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'menu_items' THEN
        IF NOT EXISTS (
            SELECT 1 FROM menu_item_translations mt
            WHERE mt.menu_item_id = NEW.id AND mt.language = 'tr' AND length(trim(mt.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Menu item % requires a valid Turkish (tr) translation.', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'menu_item_translations' THEN
        IF NOT EXISTS (
            SELECT 1 FROM menu_item_translations mt
            WHERE mt.menu_item_id = OLD.menu_item_id AND mt.language = 'tr' AND length(trim(mt.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Cannot remove Turkish (tr) translation from Menu Item %.', OLD.menu_item_id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'option_groups' THEN
        IF NOT EXISTS (
            SELECT 1 FROM option_group_translations ogt
            WHERE ogt.option_group_id = NEW.id AND ogt.language = 'tr' AND length(trim(ogt.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Option group % requires a valid Turkish (tr) translation.', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'option_group_translations' THEN
        IF NOT EXISTS (
            SELECT 1 FROM option_group_translations ogt
            WHERE ogt.option_group_id = OLD.option_group_id AND ogt.language = 'tr' AND length(trim(ogt.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Cannot remove Turkish (tr) translation from Option Group %.', OLD.option_group_id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'options' THEN
        IF NOT EXISTS (
            SELECT 1 FROM option_translations ot
            WHERE ot.option_id = NEW.id AND ot.language = 'tr' AND length(trim(ot.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Option % requires a valid Turkish (tr) translation.', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'option_translations' THEN
        IF NOT EXISTS (
            SELECT 1 FROM option_translations ot
            WHERE ot.option_id = OLD.option_id AND ot.language = 'tr' AND length(trim(ot.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Cannot remove Turkish (tr) translation from Option %.', OLD.option_id
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'tags' THEN
        IF NOT EXISTS (
            SELECT 1 FROM tag_translations tt
            WHERE tt.tag_id = NEW.id AND tt.language = 'tr' AND length(trim(tt.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Tag % (%) requires a valid Turkish (tr) translation.', NEW.id, NEW.slug
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF TG_TABLE_NAME = 'tag_translations' THEN
        IF NOT EXISTS (
            SELECT 1 FROM tag_translations tt
            WHERE tt.tag_id = OLD.tag_id AND tt.language = 'tr' AND length(trim(tt.name)) > 0
        ) THEN
            RAISE EXCEPTION 'Cannot remove Turkish (tr) translation from Tag %.', OLD.tag_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Parent triggers (Deferred at Commit)
CREATE CONSTRAINT TRIGGER trg_deferred_check_category_tr
AFTER INSERT OR UPDATE ON categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_menu_item_tr
AFTER INSERT OR UPDATE ON menu_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_option_group_tr
AFTER INSERT OR UPDATE ON option_groups
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_option_tr
AFTER INSERT OR UPDATE ON options
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_tag_tr
AFTER INSERT OR UPDATE ON tags
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

-- Child translation triggers (Prevents deleting Turkish rows)
CREATE CONSTRAINT TRIGGER trg_deferred_check_category_tr_del
AFTER DELETE OR UPDATE OF language ON category_translations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_menu_item_tr_del
AFTER DELETE OR UPDATE OF language ON menu_item_translations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_option_group_tr_del
AFTER DELETE OR UPDATE OF language ON option_group_translations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_option_tr_del
AFTER DELETE OR UPDATE OF language ON option_translations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

CREATE CONSTRAINT TRIGGER trg_deferred_check_tag_tr_del
AFTER DELETE OR UPDATE OF language ON tag_translations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_enforce_turkish_translation();

-- ----------------------------------------------------------------------------
-- 7. MENU IMPORT STAGING TABLE (FAST BATCH UPSERT PIPELINE)
-- ----------------------------------------------------------------------------
CREATE TABLE menu_import_staging (
    id serial PRIMARY KEY,
    category_slug text NOT NULL,
    category_name_tr text NOT NULL,
    category_name_en text,
    category_name_ar text,
    item_slug text NOT NULL,
    item_name_tr text NOT NULL,
    item_name_en text,
    item_name_ar text,
    description_tr text,
    description_en text,
    description_ar text,
    price_try numeric(10, 2) NOT NULL,
    vat_rate_percent integer NOT NULL DEFAULT 1,
    image_url text,
    allergens_csv text,
    tags_csv text,
    is_available boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    imported_at timestamptz,
    import_error text
);

CREATE OR REPLACE FUNCTION fn_process_menu_import_staging()
RETURNS integer AS $$
DECLARE
    r RECORD;
    v_cat_id uuid;
    v_item_id uuid;
    v_allergens text[];
    v_tag_slug text;
    v_tag_id uuid;
    v_imported_count integer := 0;
BEGIN
    FOR r IN SELECT * FROM menu_import_staging WHERE imported_at IS NULL ORDER BY id LOOP
        BEGIN
            -- 1. Category Resolution
            SELECT c.id INTO v_cat_id
            FROM categories c
            JOIN category_translations ct ON ct.category_id = c.id
            WHERE ct.language = 'tr' AND lower(trim(ct.name)) = lower(trim(r.category_name_tr))
            LIMIT 1;

            IF v_cat_id IS NULL THEN
                INSERT INTO categories (sort_order, is_active)
                VALUES (r.sort_order, true)
                RETURNING id INTO v_cat_id;

                INSERT INTO category_translations (category_id, language, name)
                VALUES (v_cat_id, 'tr', trim(r.category_name_tr));

                IF r.category_name_en IS NOT NULL THEN
                    INSERT INTO category_translations (category_id, language, name)
                    VALUES (v_cat_id, 'en', trim(r.category_name_en))
                    ON CONFLICT (category_id, language) DO NOTHING;
                END IF;

                IF r.category_name_ar IS NOT NULL THEN
                    INSERT INTO category_translations (category_id, language, name)
                    VALUES (v_cat_id, 'ar', trim(r.category_name_ar))
                    ON CONFLICT (category_id, language) DO NOTHING;
                END IF;
            END IF;

            -- 2. Allergens
            v_allergens := '{}';
            IF r.allergens_csv IS NOT NULL AND length(trim(r.allergens_csv)) > 0 THEN
                v_allergens := string_to_array(lower(replace(r.allergens_csv, ' ', '')), ',');
            END IF;

            -- 3. Menu Item
            INSERT INTO menu_items (
                category_id, price_kurus, vat_rate_percent, image_url,
                is_available, sort_order, allergens
            ) VALUES (
                v_cat_id,
                round(r.price_try * 100)::bigint,
                r.vat_rate_percent,
                r.image_url,
                r.is_available,
                r.sort_order,
                v_allergens
            ) RETURNING id INTO v_item_id;

            -- 4. Translations
            INSERT INTO menu_item_translations (menu_item_id, language, name, description)
            VALUES (v_item_id, 'tr', trim(r.item_name_tr), r.description_tr);

            IF r.item_name_en IS NOT NULL THEN
                INSERT INTO menu_item_translations (menu_item_id, language, name, description)
                VALUES (v_item_id, 'en', trim(r.item_name_en), r.description_en)
                ON CONFLICT (menu_item_id, language) DO NOTHING;
            END IF;

            IF r.item_name_ar IS NOT NULL THEN
                INSERT INTO menu_item_translations (menu_item_id, language, name, description)
                VALUES (v_item_id, 'ar', trim(r.item_name_ar), r.description_ar)
                ON CONFLICT (menu_item_id, language) DO NOTHING;
            END IF;

            UPDATE menu_import_staging
            SET imported_at = clock_timestamp(), import_error = NULL
            WHERE id = r.id;

            v_imported_count := v_imported_count + 1;

        EXCEPTION WHEN OTHERS THEN
            UPDATE menu_import_staging
            SET import_error = SQLERRM
            WHERE id = r.id;
        END;
    END LOOP;

    RETURN v_imported_count;
END;
$$ LANGUAGE plpgsql;
