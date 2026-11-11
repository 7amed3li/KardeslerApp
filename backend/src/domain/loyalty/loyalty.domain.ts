export interface LoyaltyAwardResult {
  orderPoints: number;
  referrerBonusPoints: number;
  referredBonusPoints: number;
}

/**
 * Confirmed loyalty rule (docs/assumptions.md #4):
 * - 1 loyalty point per 1 TRY (100 integer kuruş) of net paid total (`totalKurus`), rounded down.
 * - First delivered referral rewards 100 points to referrer and 50 points to referred patron.
 */
export class LoyaltyDomain {
  public static readonly KURUS_PER_POINT = 100;
  public static readonly REFERRER_BONUS_POINTS = 100;
  public static readonly REFERRED_BONUS_POINTS = 50;

  public static calculateOrderPoints(totalKurus: number): number {
    if (!Number.isFinite(totalKurus) || totalKurus <= 0) return 0;
    return Math.floor(totalKurus / this.KURUS_PER_POINT);
  }

  public static calculateDeliveryRewards(
    totalKurus: number,
    hasPendingReferral: boolean,
  ): LoyaltyAwardResult {
    return {
      orderPoints: this.calculateOrderPoints(totalKurus),
      referrerBonusPoints: hasPendingReferral ? this.REFERRER_BONUS_POINTS : 0,
      referredBonusPoints: hasPendingReferral ? this.REFERRED_BONUS_POINTS : 0,
    };
  }
}

