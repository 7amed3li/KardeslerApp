import type { SupportedLanguage } from '@kardesler/shared';
import { DomainError } from '../../domain/errors.js';
import { DeliveryDomain } from '../../domain/delivery/delivery.domain.js';
import type { CachePort } from '../../ports/state.js';
import type { DeliveryRepository, MenuRepository, SettingsRepository } from '../../ports/repositories.js';

export class MenuAndDeliveryUseCases {
  constructor(
    private readonly menuRepo: MenuRepository,
    private readonly deliveryRepo: DeliveryRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly cache: CachePort,
  ) {}

  async getLocalizedMenu(lang: SupportedLanguage) {
    const key = `menu:${lang}`;
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;
    const payload = await this.menuRepo.getLocalizedMenu(lang);
    await this.cache.set(key, payload, 60_000);
    return payload;
  }

  async updateMenuItem(staffId: string, id: string, patch: { priceKurus?: number; isAvailable?: boolean; allergens?: string[] }) {
    const updated = await this.menuRepo.updateItem(id, staffId, patch);
    if (!updated) throw new DomainError('NOT_FOUND', 404, 'Menü ürünü bulunamadı');
    await this.cache.deleteByPrefix('menu:');
    return updated;
  }

  async createCategory(staffId: string, input: { sortOrder: number; isActive: boolean; translations: { language: SupportedLanguage; name: string; description?: string }[] }) {
    const created = await this.menuRepo.createCategory(staffId, input);
    await this.cache.deleteByPrefix('menu:');
    return created;
  }

  async updateCategory(staffId: string, id: string, patch: { sortOrder?: number; isActive?: boolean; translations?: { language: SupportedLanguage; name: string; description?: string }[] }) {
    const updated = await this.menuRepo.updateCategory(staffId, id, patch);
    if (!updated) throw new DomainError('NOT_FOUND', 404, 'Kategori bulunamadı');
    await this.cache.deleteByPrefix('menu:');
    return updated;
  }

  async createMenuItem(staffId: string, input: { categoryId: string; priceKurus: number; vatRatePercent: number; imageUrl?: string; isAvailable: boolean; sortOrder: number; allergens: string[]; translations: { language: SupportedLanguage; name: string; description?: string }[] }) {
    const created = await this.menuRepo.createMenuItem(staffId, input);
    await this.cache.deleteByPrefix('menu:');
    return created;
  }

  async deleteMenuItem(staffId: string, id: string) {
    const ok = await this.menuRepo.softDeleteMenuItem(staffId, id);
    if (!ok) throw new DomainError('NOT_FOUND', 404, 'Menü ürünü bulunamadı');
    await this.cache.deleteByPrefix('menu:');
    return { deleted: true };
  }

  async checkDeliveryZone(lat: number, lng: number) {
    const zone = await this.deliveryRepo.findZoneAtPoint(lat, lng);
    return DeliveryDomain.evaluateCoverage(zone);
  }

  async getPublicSettings() {
    return this.settingsRepo.getPublicSettingsWithHeartbeats();
  }

  async getPublicBanners() {
    const banners = await this.menuRepo.listPublicBanners();
    return { banners };
  }
}

