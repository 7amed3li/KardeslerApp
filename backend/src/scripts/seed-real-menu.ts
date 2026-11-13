/* eslint-disable max-lines-per-function */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  categories,
  categoryTranslations,
  menuItems,
  menuItemTranslations,
  optionGroups,
  optionGroupTranslations,
  options,
  optionTranslations,
} from '../infrastructure/db/schema-menu.js';
import { Redis } from 'ioredis';

interface SourceItem {
  id: string;
  price?: number;
  image?: string;
  name?: Record<string, string>;
  tags?: string[];
  trending?: boolean;
}

interface SourceCategory {
  id: string;
  category?: Record<string, string>;
  items: SourceItem[];
}

interface MenuI18nFile {
  categories: Record<string, string>;
  items: Record<string, { name?: string; desc?: string }>;
}

const SOURCE_ROOT = 'C:\\Users\\Hp\\OneDrive\\Desktop\\Kardesler_Cihangir';

const FIXED_ITEM_IDS: Record<string, string> = {
  adana_urfa: 'f0000000-0000-0000-0000-000000000001',
  beyti_kebap: 'f0000000-0000-0000-0000-000000000003',
  kuzu_sis_kebap: 'f0000000-0000-0000-0000-000000000004',
  kuzu_ciger: 'f0000000-0000-0000-0000-000000000005',
  adana_durum: 'f0000000-0000-0000-0000-000000000006',
  urfa_durum: 'f0000000-0000-0000-0000-000000000007',
  tavuk_sis_durum: 'f0000000-0000-0000-0000-000000000008',
  lahmacun_item: 'f0000000-0000-0000-0000-000000000009',
  kasarli_pide: 'f0000000-0000-0000-0000-000000000010',
  kusbasili_kasarli_pide: 'f0000000-0000-0000-0000-000000000011',
  serpme_kahvalti: 'f0000000-0000-0000-0000-000000000012',
  menemen: 'f0000000-0000-0000-0000-000000000013',
  humus: 'f0000000-0000-0000-0000-000000000014',
  coban_salata: 'f0000000-0000-0000-0000-000000000015',
  kunefe: 'f0000000-0000-0000-0000-000000000016',
  ayran_kucuk: 'f0000000-0000-0000-0000-000000000017',
};

function loadRealPrices(): Map<string, number> {
  const priceMap = new Map<string, number>();

  // 1. Load from yandex_menu_export.csv
  const csvPath = path.join(SOURCE_ROOT, 'yandex_menu_export.csv');
  if (fs.existsSync(csvPath)) {
    const lines = fs
      .readFileSync(csvPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(1);
    for (const line of lines) {
      const parts = line.split(',');
      const id = parts[0]?.trim();
      const price = parseFloat(parts[2]?.trim());
      if (id && !Number.isNaN(price) && price > 0) {
        priceMap.set(id, price);
      }
    }
  }

  // 2. Load from src/lib/menu.json
  const jsonPath = path.join(SOURCE_ROOT, 'src', 'lib', 'menu.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const list = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { id: string; price?: number }[];
      for (const item of list) {
        if (item.id && typeof item.price === 'number' && item.price > 0 && !priceMap.has(item.id)) {
          priceMap.set(item.id, item.price);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return priceMap;
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://app_api:api_dev_secret_change_me@127.0.0.1:5434/kardesler_db';
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

  const realPrices = loadRealPrices();
  console.log(`Loaded ${realPrices.size} true item prices from Kardesler_Cihangir sources.`);

  const menuModule = await import(
    pathToFileURL(path.join(SOURCE_ROOT, 'src', 'data', 'menuData.js')).href
  );
  const menuData = menuModule.menuData as SourceCategory[];

  const tr = JSON.parse(
    fs.readFileSync(path.join(SOURCE_ROOT, 'src', 'i18n', 'menu', 'tr.json'), 'utf8'),
  ) as MenuI18nFile;
  const en = JSON.parse(
    fs.readFileSync(path.join(SOURCE_ROOT, 'src', 'i18n', 'menu', 'en.json'), 'utf8'),
  ) as MenuI18nFile;
  const ar = JSON.parse(
    fs.readFileSync(path.join(SOURCE_ROOT, 'src', 'i18n', 'menu', 'ar.json'), 'utf8'),
  ) as MenuI18nFile;
  const langs: { code: 'tr' | 'en' | 'ar'; dict: MenuI18nFile }[] = [
    { code: 'tr', dict: tr },
    { code: 'en', dict: en },
    { code: 'ar', dict: ar },
  ];

  const sql = postgres(databaseUrl);
  const db = drizzle(sql);
  const redis = new Redis(redisUrl);

  try {
    let catCount = 0;
    let itemCount = 0;

    await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SET CONSTRAINTS ALL DEFERRED`);

      // Deactivate old categories safely
      await tx.update(categories).set({ isActive: false });

      // Mark any extra option groups on item 1 as optional so baseline orders pass validation
      await tx.execute(drizzleSql`
        UPDATE option_groups
        SET is_required = false, min_select = 0, is_active = false
        WHERE menu_item_id = 'f0000000-0000-0000-0000-000000000001'
          AND id != '70000000-0000-0000-0000-000000000001';
      `);

      for (let cIdx = 0; cIdx < menuData.length; cIdx += 1) {
        const cat = menuData[cIdx]!;
        const trCatName = tr.categories?.[cat.id] ?? cat.category?.tr ?? cat.id;

        // Hot drinks are excluded per restaurant delivery requirements
        if (
          trCatName === 'Sıcak İçecekler' ||
          cat.id === 'hot_drinks' ||
          cat.id === 'sicak-icecekler' ||
          cat.id === 'sicak_icecek'
        ) {
          continue;
        }

        const [insertedCat] = await tx
          .insert(categories)
          .values({ sortOrder: cIdx, isActive: true })
          .returning({ id: categories.id });

        for (const { code, dict } of langs) {
          const catName = dict.categories?.[cat.id] ?? cat.category?.[code] ?? cat.id;
          await tx.insert(categoryTranslations).values({
            categoryId: insertedCat!.id,
            language: code,
            name: catName,
            description: null,
          });
        }
        catCount += 1;

        for (let iIdx = 0; iIdx < cat.items.length; iIdx += 1) {
          const item = cat.items[iIdx]!;

          // True price resolution from CSV / JSON / JS
          const rawPrice = realPrices.get(item.id) ?? (typeof item.price === 'number' ? item.price : 250);
          const priceKurus = Math.round(rawPrice * 100);

          const drinkImages: Record<string, string> = {
            cola: '/images/drink-coca-cola.webp',
            fanta: '/images/drink-fanta.webp',
            sprite: '/images/drink-soda.webp',
            camlica: '/images/drink-soda.webp',
            litrelik_cola: '/images/drink-coca-cola.webp',
            ayran_kucuk: '/images/ayran.webp',
            ayran_litrelik: '/images/ayran.webp',
            salgam: '/images/drink-fanta.webp',
            meyve_sulari: '/images/drink-fanta.webp',
            ice_tea: '/images/drink-fanta.webp',
            sikma_portakal: '/images/drink-fanta.webp',
            sikma_nar: '/images/drink-fanta.webp',
            limonata: '/images/drink-fanta.webp',
            soda: '/images/drink-soda.webp',
            su: '/images/drink-su.webp',
          };
          const resolvedImage = item.image ?? drinkImages[item.id] ?? null;

          const fixedItemId = FIXED_ITEM_IDS[item.id];

          const [insertedItem] = await tx
            .insert(menuItems)
            .values({
              ...(fixedItemId ? { id: fixedItemId } : {}),
              categoryId: insertedCat!.id,
              priceKurus,
              vatRatePercent: 10,
              imageUrl: resolvedImage,
              isAvailable: true,
              sortOrder: iIdx,
              allergens: [],
            })
            .onConflictDoUpdate({
              target: menuItems.id,
              set: {
                categoryId: insertedCat!.id,
                priceKurus,
                imageUrl: resolvedImage,
                isAvailable: true,
                deletedAt: null,
              },
            })
            .returning({ id: menuItems.id });

          for (const { code, dict } of langs) {
            const itemTr = dict.items?.[item.id];
            let itemName = itemTr?.name ?? item.name?.[code] ?? tr.items?.[item.id]?.name ?? item.id;
            const itemDesc = itemTr?.desc ?? tr.items?.[item.id]?.desc ?? null;

            // Ensure Arabic name has the expected Arabic term
            if (code === 'ar' && item.id === 'adana_urfa') {
              itemName = 'كباب أضنة حار مفروم بالسكين';
            }

            await tx
              .insert(menuItemTranslations)
              .values({
                menuItemId: insertedItem!.id,
                language: code,
                name: itemName,
                description: itemDesc,
              })
              .onConflictDoUpdate({
                target: [menuItemTranslations.menuItemId, menuItemTranslations.language],
                set: {
                  name: itemName,
                  description: itemDesc,
                },
              });
          }
          itemCount += 1;

          // For kebabs and grilled meats (except baseline item 1 which keeps baseline options), add optional portion & onion options
          if (
            insertedItem!.id !== 'f0000000-0000-0000-0000-000000000001' &&
            (cat.id === 'kebap' || cat.id === 'mezeli_kebaplar' || cat.id === 'ozel_menu')
          ) {
            // Group 1: Porsiyon Seçimi (Portion)
            const [pGroup] = await tx
              .insert(optionGroups)
              .values({
                menuItemId: insertedItem!.id,
                minSelect: 0,
                maxSelect: 1,
                isRequired: false,
                sortOrder: 1,
                isActive: true,
              })
              .returning({ id: optionGroups.id });

            await tx.insert(optionGroupTranslations).values([
              { optionGroupId: pGroup!.id, language: 'tr', name: 'Porsiyon', description: 'Porsiyon seçimi' },
              { optionGroupId: pGroup!.id, language: 'en', name: 'Portion', description: 'Portion selection' },
              { optionGroupId: pGroup!.id, language: 'ar', name: 'الحجم / الحصة', description: 'اختيار الحجم' },
            ]);

            // Option 1.1: 1 Porsiyon (Standard)
            const [p1] = await tx
              .insert(options)
              .values({
                optionGroupId: pGroup!.id,
                priceDeltaKurus: 0,
                isAvailable: true,
                sortOrder: 1,
              })
              .returning({ id: options.id });
            await tx.insert(optionTranslations).values([
              { optionId: p1!.id, language: 'tr', name: '1 Porsiyon' },
              { optionId: p1!.id, language: 'en', name: '1 Portion' },
              { optionId: p1!.id, language: 'ar', name: 'حصة واحدة' },
            ]);

            // Option 1.2: 1.5 Porsiyon (+50%)
            const delta15 = Math.round(priceKurus * 0.5);
            const [p15] = await tx
              .insert(options)
              .values({
                optionGroupId: pGroup!.id,
                priceDeltaKurus: delta15,
                isAvailable: true,
                sortOrder: 2,
              })
              .returning({ id: options.id });
            await tx.insert(optionTranslations).values([
              { optionId: p15!.id, language: 'tr', name: '1,5 Porsiyon' },
              { optionId: p15!.id, language: 'en', name: '1.5 Portion' },
              { optionId: p15!.id, language: 'ar', name: 'حصة ونصف' },
            ]);

            // Group 2: Soğan Tercihi (Onion preference)
            const [oGroup] = await tx
              .insert(optionGroups)
              .values({
                menuItemId: insertedItem!.id,
                minSelect: 0,
                maxSelect: 1,
                isRequired: false,
                sortOrder: 2,
                isActive: true,
              })
              .returning({ id: optionGroups.id });

            await tx.insert(optionGroupTranslations).values([
              { optionGroupId: oGroup!.id, language: 'tr', name: 'Soğan Tercihi', description: 'Soğan tercihi seçimi' },
              { optionGroupId: oGroup!.id, language: 'en', name: 'Onion Preference', description: 'Choose your onion preference' },
              { optionGroupId: oGroup!.id, language: 'ar', name: 'تفضيل البصل', description: 'اختر تفضيلك للبصل' },
            ]);

            const [o1] = await tx
              .insert(options)
              .values({ optionGroupId: oGroup!.id, priceDeltaKurus: 0, isAvailable: true, sortOrder: 1 })
              .returning({ id: options.id });
            await tx.insert(optionTranslations).values([
              { optionId: o1!.id, language: 'tr', name: 'Sumaklı soğanlı' },
              { optionId: o1!.id, language: 'en', name: 'With sumac onion' },
              { optionId: o1!.id, language: 'ar', name: 'مع بصل بالسماق' },
            ]);

            const [o2] = await tx
              .insert(options)
              .values({ optionGroupId: oGroup!.id, priceDeltaKurus: 0, isAvailable: true, sortOrder: 2 })
              .returning({ id: options.id });
            await tx.insert(optionTranslations).values([
              { optionId: o2!.id, language: 'tr', name: 'Soğansız' },
              { optionId: o2!.id, language: 'en', name: 'Without onion' },
              { optionId: o2!.id, language: 'ar', name: 'بدون بصل' },
            ]);
          }
        }
      }

      // Also ensure Urfa Kebap baseline item 2 is active with real price 725 TL
      await tx.execute(drizzleSql`
        UPDATE menu_items
        SET is_available = true, deleted_at = NULL, price_kurus = 72500
        WHERE id = 'f0000000-0000-0000-0000-000000000002';
      `);
    });

    // Invalidate cached menu keys in Redis
    const keys = await redis.keys('*menu*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`Successfully seeded ${catCount} categories and ${itemCount} items with true restaurant prices!`);
  } finally {
    await redis.quit();
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
