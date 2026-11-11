import { DomainError } from '../../domain/errors.js';
import type { Clock } from '../../ports/clock.js';
import type {
  AdminRepository,
  CouponRepository,
  DeliveryRepository,
  SettingsRepository,
} from '../../ports/repositories.js';

export class AdminUseCases {
  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly couponRepo: CouponRepository,
    private readonly deliveryRepo: DeliveryRepository,
    private readonly settingsRepo: SettingsRepository,
    private readonly clock: Clock,
  ) {}

  async setAcceptingOrders(staffId: string, role: 'staff' | 'owner', isAcceptingOrders: boolean) {
    return this.settingsRepo.setAcceptingOrders(staffId, role, isAcceptingOrders);
  }

  async getDailySummary(staffId: string, businessDate?: string) {
    return this.adminRepo.getDailySummary(staffId, businessDate);
  }

  async getAuditLogs(staffId: string) {
    return { auditLogs: await this.adminRepo.getAuditLogs(staffId) };
  }

  async listCoupons(staffId: string) {
    return { coupons: await this.couponRepo.listAdminCoupons(staffId) };
  }

  async createCoupon(staffId: string, input: Record<string, unknown>) {
    return this.couponRepo.createAdminCoupon(staffId, input);
  }

  async updateCoupon(staffId: string, id: string, patch: Record<string, unknown>) {
    const row = await this.couponRepo.updateAdminCoupon(staffId, id, patch);
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Kupon bulunamadı');
    return row;
  }

  async listZones(staffId: string) {
    return { zones: await this.deliveryRepo.listZonesAdmin(staffId) };
  }

  async updateZone(staffId: string, id: string, patch: { minOrderKurus?: number; estimatedMinutes?: number; isActive?: boolean }) {
    const row = await this.deliveryRepo.updateZoneAdmin(staffId, id, patch);
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Teslimat bölgesi bulunamadı');
    return row;
  }

  async listDrivers(staffId: string) {
    return { drivers: await this.adminRepo.listDrivers(staffId) };
  }

  async createDriver(staffId: string, input: { name: string; phone: string }) {
    return this.adminRepo.createDriver(staffId, input);
  }

  async listStaff(staffId: string) {
    return { staff: await this.adminRepo.listStaff(staffId) };
  }

  async listFraudFlags(staffId: string) {
    return { fraudFlags: await this.adminRepo.listFraudFlags(staffId) };
  }

  async resolveFraudFlag(staffId: string, id: string) {
    const row = await this.adminRepo.resolveFraudFlag(staffId, id, this.clock.now());
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Kayıt bulunamadı');
    return row;
  }

  async listBanners(staffId: string) {
    return { banners: await this.adminRepo.listBanners(staffId) };
  }

  async createBanner(staffId: string, input: Record<string, unknown>) {
    return this.adminRepo.createBanner(staffId, input);
  }

  async updateSettings(staffId: string, patch: Record<string, unknown>) {
    return this.adminRepo.updateSettings(staffId, patch);
  }
}

