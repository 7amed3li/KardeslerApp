import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  time,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { staffUsers } from './schema-core.js';

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const categoryTranslations = pgTable('category_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItems = pgTable('menu_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  priceKurus: bigint('price_kurus', { mode: 'number' }).notNull(),
  vatRatePercent: integer('vat_rate_percent').default(1).notNull(),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  allergens: text('allergens').array().default([]).notNull(),
  availableFrom: time('available_from'),
  availableUntil: time('available_until'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItemTranslations = pgTable('menu_item_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').unique().notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tagTranslations = pgTable('tag_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tagId: uuid('tag_id').references(() => tags.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const menuItemTags = pgTable(
  'menu_item_tags',
  {
    menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
    tagId: uuid('tag_id').references(() => tags.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuItemId, t.tagId] })],
);

export const optionGroups = pgTable('option_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  minSelect: integer('min_select').default(0).notNull(),
  maxSelect: integer('max_select').default(1).notNull(),
  isRequired: boolean('is_required').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const optionGroupTranslations = pgTable('option_group_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  optionGroupId: uuid('option_group_id').references(() => optionGroups.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const options = pgTable('options', {
  id: uuid('id').defaultRandom().primaryKey(),
  optionGroupId: uuid('option_group_id').references(() => optionGroups.id).notNull(),
  priceDeltaKurus: bigint('price_delta_kurus', { mode: 'number' }).default(0).notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const optionTranslations = pgTable('option_translations', {
  id: uuid('id').defaultRandom().primaryKey(),
  optionId: uuid('option_id').references(() => options.id).notNull(),
  language: text('language').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id).notNull(),
  oldPriceKurus: bigint('old_price_kurus', { mode: 'number' }).notNull(),
  newPriceKurus: bigint('new_price_kurus', { mode: 'number' }).notNull(),
  changedByStaffId: uuid('changed_by_staff_id').references(() => staffUsers.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
});
