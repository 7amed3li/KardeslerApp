import { DomainError } from '../../domain/errors.js';
import type { LoyaltyRepository } from '../../ports/repositories.js';

export class LoyaltyUseCases {
  constructor(private readonly loyaltyRepo: LoyaltyRepository) {}

  async getMyLoyalty(userId: string) {
    return this.loyaltyRepo.getCustomerLoyalty(userId);
  }

  async createReview(userId: string, input: { orderId: string; rating: number; comment?: string }) {
    const res = (await this.loyaltyRepo.createReview(userId, input)) as
      | { error: 'not_found' | 'not_delivered' }
      | { review: unknown };

    if ('error' in res) {
      if (res.error === 'not_found') {
        throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');
      }
      throw new DomainError(
        'VALIDATION_ERROR',
        422,
        'Sadece teslim edilmiş (delivered) siparişler için değerlendirme yapılabilir',
      );
    }
    return { review: res.review };
  }

  async recordConsent(
    userId: string,
    input: { type: string; granted: boolean; source: string; version: string },
  ) {
    const consent = await this.loyaltyRepo.recordConsent(userId, input);
    return { consent };
  }
}

