-- ============================================================================
-- Migration: 007_seed.sql (Real Kardeşler Cihangir Restaurant Data)
-- Project: Kardeşler Cihangir Food Ordering System
-- Description: Authentic seed data from the Kardeşler Cihangir official menu:
--              settings, staff, delivery zones, drivers, categories, items,
--              tags, option groups, and coupons.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RESTAURANT SETTINGS SINGLETON
-- ----------------------------------------------------------------------------
INSERT INTO restaurant_settings (
    id, name, phone, address, is_accepting_orders,
    opening_hours, business_day_cutoff, min_app_version, currency
) VALUES (
    1,
    'Kardeşler Cihangir Kebap Salonu',
    '+902122495555',
    'Kılıçali Paşa Mah. Sıraselviler Cad. No:42 Cihangir, Beyoğlu, İstanbul',
    true,
    jsonb_build_object(
        'monday', jsonb_build_object('open', '09:00', 'close', '02:00'),
        'tuesday', jsonb_build_object('open', '09:00', 'close', '02:00'),
        'wednesday', jsonb_build_object('open', '09:00', 'close', '02:00'),
        'thursday', jsonb_build_object('open', '09:00', 'close', '02:00'),
        'friday', jsonb_build_object('open', '09:00', 'close', '03:00'),
        'saturday', jsonb_build_object('open', '09:00', 'close', '03:00'),
        'sunday', jsonb_build_object('open', '09:00', 'close', '02:00')
    ),
    '06:00:00',
    '1.0.0',
    'TRY'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address;

-- ----------------------------------------------------------------------------
-- 2. STAFF OWNER (ARGON2ID ENCRYPTED HASH)
-- ----------------------------------------------------------------------------
INSERT INTO staff_users (
    id, email, password_hash, role, totp_secret_encrypted, totp_enabled, is_active
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'owner@kardeslercihangir.com',
    '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$9vGZ46lSj8fI3bX9+tLwzK1p6uY7d0eQ4r1a2b3c4d5',
    'owner',
    NULL,
    false,
    true
) ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. CIHANGIR DELIVERY ZONES & DRIVERS
-- ----------------------------------------------------------------------------
INSERT INTO delivery_zones (id, name, area, min_order_kurus, delivery_fee_kurus, estimated_minutes, is_active)
VALUES
    (
        'b0000000-0000-0000-0000-000000000001',
        'Cihangir Merkez (Zone 1)',
        ST_GeogFromText('SRID=4326;POLYGON((28.9800 41.0310, 28.9880 41.0310, 28.9880 41.0360, 28.9800 41.0360, 28.9800 41.0310))'),
        25000,
        0,
        30,
        true
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        'Taksim & Gümüşsuyu (Zone 2)',
        ST_GeogFromText('SRID=4326;POLYGON((28.9830 41.0350, 28.9950 41.0350, 28.9950 41.0420, 28.9830 41.0420, 28.9830 41.0350))'),
        40000,
        0,
        45,
        true
    ),
    (
        'b0000000-0000-0000-0000-000000000003',
        'Karaköy & Kabataş Sahil (Zone 3)',
        ST_GeogFromText('SRID=4326;POLYGON((28.9750 41.0230, 28.9920 41.0230, 28.9920 41.0310, 28.9750 41.0310, 28.9750 41.0230))'),
        60000,
        0,
        55,
        true
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO drivers (id, name, phone, is_active)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Mehmet Demir', '+905321112233', true),
    ('c0000000-0000-0000-0000-000000000002', 'Ali Yılmaz', '+905324445566', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. BADGES / TAGS
-- ----------------------------------------------------------------------------
INSERT INTO tags (id, slug, icon, sort_order, is_active) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'best_seller', 'fire', 1, true),
    ('d0000000-0000-0000-0000-000000000002', 'chefs_choice', 'award', 2, true),
    ('d0000000-0000-0000-0000-000000000003', 'spicy', 'chili', 3, true),
    ('d0000000-0000-0000-0000-000000000004', 'vegetarian', 'leaf', 4, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tag_translations (tag_id, language, name) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'tr', 'Çok Satan'),
    ('d0000000-0000-0000-0000-000000000001', 'en', 'Best Seller'),
    ('d0000000-0000-0000-0000-000000000001', 'ar', 'الأكثر مبيعاً'),

    ('d0000000-0000-0000-0000-000000000002', 'tr', 'Ustanın Seçimi'),
    ('d0000000-0000-0000-0000-000000000002', 'en', 'Chef’s Choice'),
    ('d0000000-0000-0000-0000-000000000002', 'ar', 'اختيار الشيف'),

    ('d0000000-0000-0000-0000-000000000003', 'tr', 'Acılı'),
    ('d0000000-0000-0000-0000-000000000003', 'en', 'Spicy'),
    ('d0000000-0000-0000-0000-000000000003', 'ar', 'حار'),

    ('d0000000-0000-0000-0000-000000000004', 'tr', 'Vejetaryen'),
    ('d0000000-0000-0000-0000-000000000004', 'en', 'Vegetarian'),
    ('d0000000-0000-0000-0000-000000000004', 'ar', 'نباتي')
ON CONFLICT (tag_id, language) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. REAL CATEGORIES FROM KARDEŞLER CİHANGİR
-- ----------------------------------------------------------------------------
INSERT INTO categories (id, sort_order, is_active) VALUES
    ('e0000000-0000-0000-0000-000000000001', 1, true), -- Kebaplar
    ('e0000000-0000-0000-0000-000000000002', 2, true), -- Dürümler
    ('e0000000-0000-0000-0000-000000000003', 3, true), -- Pide & Lahmacun
    ('e0000000-0000-0000-0000-000000000004', 4, true), -- Kahvaltı
    ('e0000000-0000-0000-0000-000000000005', 5, true), -- Mezeler & Salatalar
    ('e0000000-0000-0000-0000-000000000006', 6, true)  -- Tatlılar & İçecekler
ON CONFLICT (id) DO NOTHING;

INSERT INTO category_translations (category_id, language, name) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'tr', 'Kebaplar & Izgaralar'),
    ('e0000000-0000-0000-0000-000000000001', 'en', 'Kebabs & Grills'),
    ('e0000000-0000-0000-0000-000000000001', 'ar', 'المشويات والكباب التركي'),

    ('e0000000-0000-0000-0000-000000000002', 'tr', 'Dürümler'),
    ('e0000000-0000-0000-0000-000000000002', 'en', 'Wraps'),
    ('e0000000-0000-0000-0000-000000000002', 'ar', 'السندويشات والشاورما'),

    ('e0000000-0000-0000-0000-000000000003', 'tr', 'Pide & Lahmacun'),
    ('e0000000-0000-0000-0000-000000000003', 'en', 'Pide & Lahmacun'),
    ('e0000000-0000-0000-0000-000000000003', 'ar', 'الفطائر التركية واللحم بعجين'),

    ('e0000000-0000-0000-0000-000000000004', 'tr', 'Kahvaltı Çeşitleri'),
    ('e0000000-0000-0000-0000-000000000004', 'en', 'Turkish Breakfast'),
    ('e0000000-0000-0000-0000-000000000004', 'ar', 'الفطور التركي المميز'),

    ('e0000000-0000-0000-0000-000000000005', 'tr', 'Mezeler & Salatalar'),
    ('e0000000-0000-0000-0000-000000000005', 'en', 'Appetizers & Salads'),
    ('e0000000-0000-0000-0000-000000000005', 'ar', 'المقبلات والسلطات الطازجة'),

    ('e0000000-0000-0000-0000-000000000006', 'tr', 'Tatlılar & İçecekler'),
    ('e0000000-0000-0000-0000-000000000006', 'en', 'Desserts & Beverages'),
    ('e0000000-0000-0000-0000-000000000006', 'ar', 'الحلويات والمشروبات')
ON CONFLICT (category_id, language) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. AUTHENTIC MENU ITEMS FROM WEBSITE DATABASE
-- ----------------------------------------------------------------------------
INSERT INTO menu_items (id, category_id, price_kurus, vat_rate_percent, image_url, is_available, sort_order, allergens) VALUES
    -- 1. Zırh Kıyma Adana Kebap (340 TL)
    ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 34000, 1, '/images/adana.jpg', true, 1, '{gluten}'),
    -- 2. Urfa Kebap (340 TL)
    ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 34000, 1, '/images/urfa.jpg', true, 2, '{gluten}'),
    -- 3. Beyti Sarma Kebap (420 TL)
    ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 42000, 1, '/images/beyti.jpg', true, 3, '{gluten,dairy}'),
    -- 4. Kuzu Çöp Şiş (440 TL)
    ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 44000, 1, '/images/copsisi.jpg', true, 4, '{}'),
    -- 5. Kuzu Ciğer Kebap (380 TL)
    ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 38000, 1, '/images/kuzu_ciger.jpg', true, 5, '{}'),

    -- Dürümler
    -- 6. Adana Dürüm (220 TL)
    ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000002', 22000, 1, '/images/adana_durum.jpg', true, 1, '{gluten}'),
    -- 7. Urfa Dürüm (220 TL)
    ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000002', 22000, 1, '/images/urfa_durum.jpg', true, 2, '{gluten}'),
    -- 8. Tavuk Şiş Dürüm (190 TL)
    ('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000002', 19000, 1, '/images/tavuk_sis_durum.jpg', true, 3, '{gluten}'),

    -- Pide & Lahmacun
    -- 9. Çıtır Lahmacun (90 TL)
    ('f0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000003', 9000, 1, '/images/lahmacun_item.jpg', true, 1, '{gluten}'),
    -- 10. Kaşarlı Pide (260 TL)
    ('f0000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000003', 26000, 1, '/images/kasarli_pide.jpg', true, 2, '{gluten,dairy}'),
    -- 11. Kuşbaşılı Kaşarlı Pide (310 TL)
    ('f0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000003', 31000, 1, '/images/kusbasili_kasarli_pide.jpg', true, 3, '{gluten,dairy}'),

    -- Kahvaltı
    -- 12. Serpme Kahvaltı 2 Kişilik (900 TL)
    ('f0000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000004', 90000, 1, '/images/serpme_kahvalti.jpg', true, 1, '{gluten,dairy,eggs,nuts}'),
    -- 13. Menemen (250 TL)
    ('f0000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000004', 25000, 1, '/images/menemen.jpg', true, 2, '{dairy,eggs}'),

    -- Mezeler
    -- 14. Geleneksel Humus (140 TL)
    ('f0000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000005', 14000, 1, '/images/humus.webp', true, 1, '{sesame}'),
    -- 15. Çoban Salata (110 TL)
    ('f0000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000005', 11000, 1, '/images/coban_salata.jpg', true, 2, '{}'),

    -- Tatlı & İçecek
    -- 16. Hatay Künefe (180 TL)
    ('f0000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000000006', 18000, 1, '/images/kunefe.jpg', true, 1, '{gluten,dairy,nuts}'),
    -- 17. Köy Ayranı (40 TL)
    ('f0000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000006', 4000, 1, '/images/ayran.jpg', true, 2, '{dairy}')
ON CONFLICT (id) DO NOTHING;

-- Multi-language Translations
INSERT INTO menu_item_translations (menu_item_id, language, name, description) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'tr', 'Zırh Kıyma Adana Kebap', 'Közlenmiş biber, domates ve sumaklı soğan ile közde pişirilmiş geleneksel zırh kıyması'),
    ('f0000000-0000-0000-0000-000000000001', 'en', 'Hand-Minced Spicy Adana Kebab', 'Charcoal-grilled hand-minced lamb served with roasted peppers and sumac onions'),
    ('f0000000-0000-0000-0000-000000000001', 'ar', 'كباب أضنة حار مفروم بالسكين', 'لحم ضأن طازج مفروم بالسكين ومشوي على الفحم مع الطماطم والفلفل المشوي'),

    ('f0000000-0000-0000-0000-000000000002', 'tr', 'Urfa Kebap (Acısız)', 'Özel baharatlarla yoğrulmuş acısız zırh kıyma kebabı'),
    ('f0000000-0000-0000-0000-000000000002', 'en', 'Urfa Kebab (Mild)', 'Mild hand-minced lamb kebab seasoned with traditional spices'),
    ('f0000000-0000-0000-0000-000000000002', 'ar', 'كباب أورفا بدون حار', 'كباب لحم ضأن بتتبيلة أورفا الكلاسيكية غير حارة'),

    ('f0000000-0000-0000-0000-000000000003', 'tr', 'Beyti Sarma Kebap', 'Lavaşa sarılı zırh kebabı, tereyağlı domates sosu ve süzme yoğurt ile'),
    ('f0000000-0000-0000-0000-000000000003', 'en', 'Beyti Sarma Kebab', 'Kebab wrapped in thin flatbread, topped with tomato butter sauce and strained yogurt'),
    ('f0000000-0000-0000-0000-000000000003', 'ar', 'بيتي كباب سارما باللبن', 'كباب لحم ملفوف بالخبز الرقيق مع صلصة الطماطم والزبدة واللبن الزبادي المصفى'),

    ('f0000000-0000-0000-0000-000000000004', 'tr', 'Kuzu Çöp Şiş', 'Özel marine edilmiş yumuşacık kuzu eti, közlenmiş sebzeler eşliğinde'),
    ('f0000000-0000-0000-0000-000000000004', 'en', 'Lamb Shish Skewers', 'Tender marinated lamb cubes grilled over charcoal skewers'),
    ('f0000000-0000-0000-0000-000000000004', 'ar', 'أشياش لحم ضأن طري', 'قطع لحم ضأن متبلة ومشوية على الفحم مع الخضار المشوية'),

    ('f0000000-0000-0000-0000-000000000005', 'tr', 'Kuzu Ciğer Kebap', 'Güneydoğu usulü marine edilmiş taze kuzu ciğeri'),
    ('f0000000-0000-0000-0000-000000000005', 'en', 'Lamb Liver Shish', 'Traditional Southeast-style marinated fresh lamb liver skewers'),
    ('f0000000-0000-0000-0000-000000000005', 'ar', 'كباب كبدة خروف طازجة', 'شقف كبدة ضأن متبلة على الطريقة التقليدية ومشوية على الفحم'),

    ('f0000000-0000-0000-0000-000000000006', 'tr', 'Adana Dürüm', 'Lavaş içerisinde bol yeşillikli acılı Adana kebap dürüm'),
    ('f0000000-0000-0000-0000-000000000006', 'en', 'Adana Kebab Wrap', 'Spicy Adana kebab wrapped in flatbread with greens and sumac onions'),
    ('f0000000-0000-0000-0000-000000000006', 'ar', 'سندويش كباب أضنة حار', 'كباب أضنة في خبز اللافاش مع البصل بالسماق والبقدونس'),

    ('f0000000-0000-0000-0000-000000000007', 'tr', 'Urfa Dürüm', 'Acısız Urfa kıyması ve sumaklı soğan ile lavaş dürüm'),
    ('f0000000-0000-0000-0000-000000000007', 'en', 'Urfa Kebab Wrap', 'Mild Urfa wrap with greens and fresh tomatoes'),
    ('f0000000-0000-0000-0000-000000000007', 'ar', 'سندويش كباب أورفا بارد', 'كباب أورفا بدون فلفل حار في خبز لافاش طازج'),

    ('f0000000-0000-0000-0000-000000000008', 'tr', 'Tavuk Şiş Dürüm', 'Marine tavuk göğsü ve taze yeşillik ile'),
    ('f0000000-0000-0000-0000-000000000008', 'en', 'Chicken Shish Wrap', 'Grilled marinated chicken wrap with greens'),
    ('f0000000-0000-0000-0000-000000000008', 'ar', 'سندويش شيش طاووق', 'قطع دجاج متبلة ومشوية ملفوفة بالخبز مع الخضار'),

    ('f0000000-0000-0000-0000-000000000009', 'tr', 'Çıtır Lahmacun', 'Taş fırında odun ateşinde pişmiş incecik çıtır lahmacun'),
    ('f0000000-0000-0000-0000-000000000009', 'en', 'Crispy Lahmacun', 'Crispy thin stone-oven baked Turkish flatbread with minced meat'),
    ('f0000000-0000-0000-0000-000000000009', 'ar', 'لحم بعجين مقرمش على الحطب', 'فطيرة لحم بعجين رقيقة مقرمشة مخبوزة في فرن الحجر'),

    ('f0000000-0000-0000-0000-000000000010', 'tr', 'Kaşarlı Pide', 'Bol eritilmiş Karadeniz kaşarı ile çıtır taş fırın pidesi'),
    ('f0000000-0000-0000-0000-000000000010', 'en', 'Cheese Pide', 'Traditional boat-shaped flatbread with melted cheese'),
    ('f0000000-0000-0000-0000-000000000010', 'ar', 'فطيرة قشقوان بالجبنة', 'فطيرة تركية تقليدية بالجبن الذائب المحمر في الفرن'),

    ('f0000000-0000-0000-0000-000000000011', 'tr', 'Kuşbaşılı Kaşarlı Pide', 'Dana kuşbaşı ve kaşar peynirli fırın lezzeti'),
    ('f0000000-0000-0000-0000-000000000011', 'en', 'Diced Beef & Cheese Pide', 'Pide with marinated diced beef and melted kashar cheese'),
    ('f0000000-0000-0000-0000-000000000011', 'ar', 'فطيرة لحم شقف وجبن', 'فطيرة بحبات اللحم المتبل والجبن المحمر'),

    ('f0000000-0000-0000-0000-000000000012', 'tr', 'Serpme Kahvaltı (2 Kişilik)', 'Peynir tabağı, zeytin, bal kaymak, reçel, hellim, patates, çikolata, yumurta, simit'),
    ('f0000000-0000-0000-0000-000000000012', 'en', 'Serpme Turkish Breakfast (2 Person)', 'Cheese platter, olives, honey clotted cream, jams, halloumi, eggs, simit'),
    ('f0000000-0000-0000-0000-000000000012', 'ar', 'فطور تركي متكامل لشخصين', 'تشكيلة أجبان، زيتون، عسل وقشطة، مربيات، جبنة حلوم، بيض وسميت تركي ساخن'),

    ('f0000000-0000-0000-0000-000000000013', 'tr', 'Geleneksel Menemen', 'Domates, sivri biber, halis tereyağı ve yumurta ile bakır sahanda'),
    ('f0000000-0000-0000-0000-000000000013', 'en', 'Traditional Menemen', 'Tomatoes, green peppers, pure butter and eggs in copper pan'),
    ('f0000000-0000-0000-0000-000000000013', 'ar', 'شكشوكة تركية بالزبدة', 'بيض مطهو مع الطماطم والفلفل الأخضر في مقلاة نحاسية تقليدية'),

    ('f0000000-0000-0000-0000-000000000014', 'tr', 'Geleneksel Humus', 'Tahin ve nohut püresi üzerine sızma zeytinyağı'),
    ('f0000000-0000-0000-0000-000000000014', 'en', 'Classic Hummus', 'Creamy chickpea and tahini dip with extra virgin olive oil'),
    ('f0000000-0000-0000-0000-000000000014', 'ar', 'حمص شامي تقليدي بالطحينة', 'حمص ناعم مع الطحينة وزيت الزيتون البكر الممتاز'),

    ('f0000000-0000-0000-0000-000000000015', 'tr', 'Çoban Salata', 'Domates, salatalık, sivri biber, taze soğan ve zeytinyağı'),
    ('f0000000-0000-0000-0000-000000000015', 'en', 'Shepherd Salad', 'Fresh chopped cucumber, tomato, pepper with lemon dressing'),
    ('f0000000-0000-0000-0000-000000000015', 'ar', 'سلطة الراعي التركية', 'طماطم وخيار وفلفل مع البصل وزيت الزيتون ودبس الرمان'),

    ('f0000000-0000-0000-0000-000000000016', 'tr', 'Hatay Sıcak Künefe', 'Özel peynirli sıcak şerbetli tel kadayıf, Antep fıstığı ile'),
    ('f0000000-0000-0000-0000-000000000016', 'en', 'Warm Hatay Kunefe', 'Crispy shredded pastry with melted sweet cheese and pistachios'),
    ('f0000000-0000-0000-0000-000000000016', 'ar', 'كنافة هاطاي بالجبنة الساخنة', 'كنافة تركية محشوة بالجبن المذوب والفستق الحلبي مع القطر الساخن'),

    ('f0000000-0000-0000-0000-000000000017', 'tr', 'Köpüklü Yayık Ayranı', 'Geleneksel yayık yoğurdundan taze köpüklü ayran'),
    ('f0000000-0000-0000-0000-000000000017', 'en', 'Frothy Yayik Ayran', 'Authentic Turkish frothy yogurt beverage'),
    ('f0000000-0000-0000-0000-000000000017', 'ar', 'لبن عيران رغوة مثلج', 'لبن زبادي بلدي مخفوق بالرغوة الغنية والباردة')
ON CONFLICT (menu_item_id, language) DO NOTHING;

-- Associate Tags
INSERT INTO menu_item_tags (menu_item_id, tag_id) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'), -- Adana: best seller
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003'), -- Adana: spicy
    ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002'), -- Beyti: chef choice
    ('f0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000001'), -- Lahmacun: best seller
    ('f0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000004')  -- Salata: vegetarian
ON CONFLICT (menu_item_id, tag_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. READY-MADE OPTION GROUPS (FOR THERMAL KITCHEN TICKETS)
-- ----------------------------------------------------------------------------
INSERT INTO option_groups (id, menu_item_id, min_select, max_select, is_required, sort_order)
VALUES ('70000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 1, 1, true, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO option_group_translations (option_group_id, language, name) VALUES
    ('70000000-0000-0000-0000-000000000001', 'tr', 'Porsiyon Seçimi'),
    ('70000000-0000-0000-0000-000000000001', 'en', 'Portion Size'),
    ('70000000-0000-0000-0000-000000000001', 'ar', 'حجم الوجبة')
ON CONFLICT (option_group_id, language) DO NOTHING;

INSERT INTO options (id, option_group_id, price_delta_kurus, is_available, sort_order) VALUES
    ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 0, true, 1),
    ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 16000, true, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO option_translations (option_id, language, name) VALUES
    ('80000000-0000-0000-0000-000000000001', 'tr', '1 Porsiyon'),
    ('80000000-0000-0000-0000-000000000001', 'en', '1 Portion'),
    ('80000000-0000-0000-0000-000000000001', 'ar', 'وجبة واحدة'),
    ('80000000-0000-0000-0000-000000000002', 'tr', '1.5 Porsiyon (+160 TL)'),
    ('80000000-0000-0000-0000-000000000002', 'en', '1.5 Portion (+160 TL)'),
    ('80000000-0000-0000-0000-000000000002', 'ar', 'وجبة ونصف (+160 ليرة)')
ON CONFLICT (option_id, language) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. PROMOTIONAL COUPONS
-- ----------------------------------------------------------------------------
INSERT INTO coupons (
    id, code, type, value, max_discount_kurus, min_order_kurus,
    starts_at, ends_at, max_total_uses, max_uses_per_user,
    first_order_only, applies_to, is_active
) VALUES
    (
        '90000000-0000-0000-0000-000000000001',
        'HOSGELDIN',
        'percent',
        20,
        10000,
        30000,
        clock_timestamp() - interval '1 day',
        clock_timestamp() + interval '1 year',
        10000,
        1,
        true,
        'all',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000002',
        'INDIRIM50',
        'fixed_amount',
        5000,
        5000,
        35000,
        clock_timestamp() - interval '1 day',
        clock_timestamp() + interval '1 year',
        5000,
        2,
        false,
        'all',
        true
    ),
    (
        '90000000-0000-0000-0000-000000000003',
        'KEBAPKEYFI',
        'percent',
        15,
        15000,
        40000,
        clock_timestamp() - interval '1 day',
        clock_timestamp() + interval '1 year',
        NULL,
        3,
        false,
        'all',
        true
    )
ON CONFLICT (id) DO NOTHING;

COMMIT;
