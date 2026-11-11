import { eq, sql } from 'drizzle-orm';
import type { SupportedLanguage } from '@kardesler/shared';
import { readonlyClient, withTx, schema } from '../db/client.js';
import type { DeliveryRepository, MenuRepository } from '../../ports/repositories.js';
import type { DeliveryZoneRule, PricedMenuItem } from '../../domain/pricing/pricing.domain.js';
import type { ZoneCoverageResult } from '../../domain/delivery/delivery.domain.js';

export class PostgresMenuRepository implements MenuRepository {
  async getLocalizedMenu(lang: SupportedLanguage) {
    const categoriesRows = await readonlyClient`
      SELECT c.id, c.sort_order AS "sortOrder",
        COALESCE(ct_req.name, ct_tr.name) AS name,
        COALESCE(ct_req.description, ct_tr.description) AS description
      FROM public.categories c
      LEFT JOIN public.category_translations ct_req ON ct_req.category_id = c.id AND ct_req.language = ${lang}
      LEFT JOIN public.category_translations ct_tr ON ct_tr.category_id = c.id AND ct_tr.language = 'tr'
      WHERE c.is_active = true ORDER BY c.sort_order ASC
    `;

    const itemsRows = await readonlyClient`
      SELECT mi.id, mi.category_id AS "categoryId", mi.price_kurus::int AS "priceKurus",
        mi.vat_rate_percent AS "vatRatePercent", mi.image_url AS "imageUrl",
        mi.is_available AS "isAvailable", mi.sort_order AS "sortOrder", mi.allergens,
        COALESCE(mit_req.name, mit_tr.name) AS name,
        COALESCE(mit_req.description, mit_tr.description) AS description
      FROM public.menu_items mi
      JOIN public.categories c ON c.id = mi.category_id
      LEFT JOIN public.menu_item_translations mit_req ON mit_req.menu_item_id = mi.id AND mit_req.language = ${lang}
      LEFT JOIN public.menu_item_translations mit_tr ON mit_tr.menu_item_id = mi.id AND mit_tr.language = 'tr'
      WHERE mi.deleted_at IS NULL AND c.is_active = true ORDER BY mi.sort_order ASC
    `;

    const optionsRows = await readonlyClient`
      SELECT o.id, og.id AS "groupId", og.menu_item_id AS "menuItemId",
        og.min_select AS "minSelect", og.max_select AS "maxSelect", og.is_required AS "isRequired",
        COALESCE(ogt_req.name, ogt_tr.name) AS "groupName",
        o.price_delta_kurus::int AS "priceDeltaKurus", o.is_available AS "isAvailable",
        COALESCE(ot_req.name, ot_tr.name) AS name
      FROM public.options o
      JOIN public.option_groups og ON og.id = o.option_group_id
      LEFT JOIN public.option_group_translations ogt_req ON ogt_req.option_group_id = og.id AND ogt_req.language = ${lang}
      LEFT JOIN public.option_group_translations ogt_tr ON ogt_tr.option_group_id = og.id AND ogt_tr.language = 'tr'
      LEFT JOIN public.option_translations ot_req ON ot_req.option_id = o.id AND ot_req.language = ${lang}
      LEFT JOIN public.option_translations ot_tr ON ot_tr.option_id = o.id AND ot_tr.language = 'tr'
      WHERE og.is_active = true ORDER BY og.sort_order ASC, o.sort_order ASC
    `;

    const items = itemsRows.map((it) => ({
      ...it,
      options: optionsRows.filter((o) => o.menuItemId === it.id),
    }));
    return { language: lang, categories: [...categoriesRows], items };
  }

  async getPricingSnapshot() {
    const [settings] = await readonlyClient`
      SELECT is_accepting_orders AS "isAcceptingOrders", opening_hours AS "openingHours"
      FROM public.restaurant_settings WHERE id = 1
    `;
    const itemRows = await readonlyClient`
      SELECT mi.id, mi.category_id AS "categoryId", mi.price_kurus::int AS "priceKurus",
        mi.vat_rate_percent AS "vatRatePercent", mi.is_available AS "isAvailable",
        COALESCE(mit.name, 'Ürün') AS name
      FROM public.menu_items mi
      JOIN public.categories c ON c.id = mi.category_id
      LEFT JOIN public.menu_item_translations mit ON mit.menu_item_id = mi.id AND mit.language = 'tr'
      WHERE mi.deleted_at IS NULL AND c.is_active = true
    `;
    const grpRows = await readonlyClient`
      SELECT id, menu_item_id AS "menuItemId", min_select AS "minSelect",
        max_select AS "maxSelect", is_required AS "isRequired", is_active AS "isActive"
      FROM public.option_groups
    `;
    const optRows = await readonlyClient`
      SELECT o.id, og.id AS "groupId", og.menu_item_id AS "menuItemId",
        o.price_delta_kurus::int AS "priceDeltaKurus", o.is_available AS "isAvailable",
        COALESCE(ot.name, 'Seçenek') AS name
      FROM public.options o
      JOIN public.option_groups og ON og.id = o.option_group_id
      LEFT JOIN public.option_translations ot ON ot.option_id = o.id AND ot.language = 'tr'
    `;
    const map = new Map<string, PricedMenuItem>();
    for (const r of itemRows) {
      map.set(r.id, {
        id: r.id,
        categoryId: r.categoryId,
        name: r.name,
        priceKurus: Number(r.priceKurus),
        vatRatePercent: Number(r.vatRatePercent),
        isAvailable: Boolean(r.isAvailable),
        optionGroups: grpRows.filter((g) => g.menuItemId === r.id).map((g) => ({
          id: g.id, minSelect: g.minSelect, maxSelect: g.maxSelect, isRequired: g.isRequired, isActive: g.isActive,
        })),
        options: optRows.filter((o) => o.menuItemId === r.id).map((o) => ({
          id: o.id, groupId: o.groupId, name: o.name, priceDeltaKurus: Number(o.priceDeltaKurus), isAvailable: Boolean(o.isAvailable),
        })),
      });
    }
    return {
      items: map,
      isAcceptingOrders: Boolean(settings?.isAcceptingOrders),
      openingHours: settings?.openingHours ?? {},
    };
  }

  async updateItem(id: string, staffId: string, patch: { priceKurus?: number; isAvailable?: boolean; allergens?: string[] }) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [row] = await tx
        .update(schema.menuItems)
        .set({
          ...(patch.priceKurus !== undefined ? { priceKurus: patch.priceKurus } : {}),
          ...(patch.isAvailable !== undefined ? { isAvailable: patch.isAvailable } : {}),
          ...(patch.allergens !== undefined ? { allergens: patch.allergens } : {}),
        })
        .where(eq(schema.menuItems.id, id))
        .returning();
      return row ?? null;
    });
  }

  async createCategory(staffId: string, input: { sortOrder: number; isActive: boolean; translations: { language: SupportedLanguage; name: string; description?: string }[] }) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [cat] = await tx.insert(schema.categories).values({ sortOrder: input.sortOrder, isActive: input.isActive }).returning();
      for (const tr of input.translations) {
        await tx.insert(schema.categoryTranslations).values({ categoryId: cat.id, language: tr.language, name: tr.name, description: tr.description ?? null });
      }
      return cat;
    });
  }

  async updateCategory(staffId: string, id: string, patch: { sortOrder?: number; isActive?: boolean; translations?: { language: SupportedLanguage; name: string; description?: string }[] }) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [cat] = await tx
        .update(schema.categories)
        .set({ ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}), ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}) })
        .where(eq(schema.categories.id, id))
        .returning();
      if (!cat) return null;
      if (patch.translations) {
        for (const tr of patch.translations) {
          await tx.execute(sql`
            INSERT INTO public.category_translations (category_id, language, name, description)
            VALUES (${id}::uuid, ${tr.language}, ${tr.name}, ${tr.description ?? null})
            ON CONFLICT (category_id, language) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
          `);
        }
      }
      return cat;
    });
  }

  async createMenuItem(staffId: string, input: { categoryId: string; priceKurus: number; vatRatePercent: number; imageUrl?: string; isAvailable: boolean; sortOrder: number; allergens: string[]; translations: { language: SupportedLanguage; name: string; description?: string }[] }) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [item] = await tx
        .insert(schema.menuItems)
        .values({
          categoryId: input.categoryId,
          priceKurus: input.priceKurus,
          vatRatePercent: input.vatRatePercent,
          imageUrl: input.imageUrl ?? null,
          isAvailable: input.isAvailable,
          sortOrder: input.sortOrder,
          allergens: input.allergens,
        })
        .returning();
      for (const tr of input.translations) {
        await tx.insert(schema.menuItemTranslations).values({ menuItemId: item.id, language: tr.language, name: tr.name, description: tr.description ?? null });
      }
      return item;
    });
  }

  async softDeleteMenuItem(staffId: string, id: string): Promise<boolean> {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        UPDATE public.menu_items SET deleted_at = clock_timestamp(), is_available = false
        WHERE id = ${id}::uuid AND deleted_at IS NULL RETURNING id
      `);
      return rows.length > 0;
    });
  }

  async listPublicBanners(): Promise<unknown[]> {
    const rows = await readonlyClient`
      SELECT id, image_url AS "imageUrl", title_translations AS "titleTranslations",
        target_type AS "targetType", target_id AS "targetId", sort_order AS "sortOrder"
      FROM public.banners
      WHERE is_active = true AND clock_timestamp() BETWEEN starts_at AND ends_at
      ORDER BY sort_order ASC
    `;
    return [...rows];
  }
}

export class PostgresDeliveryRepository implements DeliveryRepository {
  async findZoneAtPoint(lat: number, lng: number): Promise<ZoneCoverageResult['zone']> {
    const rows = await readonlyClient`
      SELECT id, name, min_order_kurus::int AS "minOrderKurus",
        delivery_fee_kurus::int AS "deliveryFeeKurus", estimated_minutes AS "estimatedMinutes"
      FROM public.find_delivery_zone(${lat}, ${lng})
    `;
    if (rows.length === 0) return null;
    const z = rows[0];
    return {
      id: z.id,
      name: z.name,
      minOrderKurus: Number(z.minOrderKurus),
      deliveryFeeKurus: Number(z.deliveryFeeKurus),
      estimatedMinutes: Number(z.estimatedMinutes),
    };
  }

  async findZoneRuleAtPoint(lat: number, lng: number): Promise<DeliveryZoneRule | null> {
    const z = await this.findZoneAtPoint(lat, lng);
    return z ? { id: z.id, name: z.name, minOrderKurus: z.minOrderKurus, deliveryFeeKurus: z.deliveryFeeKurus } : null;
  }

  async listZonesAdmin(staffId: string): Promise<unknown[]> {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id, name, min_order_kurus::int AS "minOrderKurus",
          delivery_fee_kurus::int AS "deliveryFeeKurus", estimated_minutes AS "estimatedMinutes",
          is_active AS "isActive"
        FROM public.delivery_zones ORDER BY min_order_kurus ASC
      `);
      return [...rows];
    });
  }

  async updateZoneAdmin(staffId: string, id: string, patch: { minOrderKurus?: number; estimatedMinutes?: number; isActive?: boolean }) {
    return withTx({ role: 'owner', staffId }, async (tx) => {
      const [row] = await tx
        .update(schema.deliveryZones)
        .set({
          ...(patch.minOrderKurus !== undefined ? { minOrderKurus: patch.minOrderKurus } : {}),
          ...(patch.estimatedMinutes !== undefined ? { estimatedMinutes: patch.estimatedMinutes } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        })
        .where(eq(schema.deliveryZones.id, id))
        .returning();
      return row ?? null;
    });
  }
}

