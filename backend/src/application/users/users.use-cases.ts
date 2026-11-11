import type { SupportedLanguage } from '@kardesler/shared';
import { DomainError } from '../../domain/errors.js';
import type { AddressRepository, UserRepository } from '../../ports/repositories.js';

export class UsersAndAddressesUseCases {
  constructor(
    private readonly usersRepo: UserRepository,
    private readonly addrRepo: AddressRepository,
  ) {}

  async anonymizeMe(userId: string) {
    await this.usersRepo.anonymizeCustomer(userId);
    return { anonymized: true, message: 'Hesabınız ve kişisel verileriniz KVKK kapsamında anonimleştirildi' };
  }

  async updateMe(userId: string, input: { name?: string; email?: string | null; preferredLanguage?: SupportedLanguage }) {
    return this.usersRepo.updateCustomerProfile(userId, input);
  }

  async registerDevice(userId: string, input: { pushToken: string; platform: string; appVersion: string }) {
    return this.usersRepo.registerDevice(userId, input);
  }

  async getReferrals(userId: string) {
    return this.usersRepo.getReferralSummary(userId);
  }

  async listAddresses(userId: string) {
    const addresses = await this.addrRepo.listForCustomer(userId);
    return { addresses };
  }

  async createAddress(userId: string, input: {
    label: string;
    fullAddress: string;
    lat: number;
    lng: number;
    building?: string;
    floor?: string;
    apartment?: string;
    notes?: string;
  }) {
    return this.addrRepo.createForCustomer(userId, {
      label: input.label,
      fullAddress: input.fullAddress,
      lat: input.lat,
      lng: input.lng,
      building: input.building ?? null,
      floor: input.floor ?? null,
      apartment: input.apartment ?? null,
      notes: input.notes ?? null,
    });
  }

  async updateAddress(userId: string, addressId: string, patch: {
    label?: string;
    fullAddress?: string;
    lat?: number;
    lng?: number;
    building?: string | null;
    floor?: string | null;
    apartment?: string | null;
    notes?: string | null;
  }) {
    const updated = await this.addrRepo.updateForCustomer(userId, addressId, patch);
    if (!updated) throw new DomainError('NOT_FOUND', 404, 'Adres bulunamadı');
    return updated;
  }

  async deleteAddress(userId: string, addressId: string) {
    const ok = await this.addrRepo.softDeleteForCustomer(userId, addressId);
    if (!ok) throw new DomainError('NOT_FOUND', 404, 'Adres bulunamadı');
    return { deleted: true };
  }
}
