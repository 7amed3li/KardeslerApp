import { DomainError } from '../errors.js';

export interface ZoneCoverageResult {
  covered: boolean;
  zone: {
    id: string;
    name: string;
    minOrderKurus: number;
    deliveryFeeKurus: number;
    estimatedMinutes: number;
  } | null;
}

export class DeliveryDomain {
  public static evaluateCoverage(zone: ZoneCoverageResult['zone']): ZoneCoverageResult {
    if (!zone) {
      return { covered: false, zone: null };
    }
    return { covered: true, zone };
  }

  public static requireCoveredZone(zone: ZoneCoverageResult['zone']): NonNullable<ZoneCoverageResult['zone']> {
    if (!zone) {
      throw new DomainError('OUTSIDE_DELIVERY_ZONE', 422, 'Adres teslimat bölgesi dışında');
    }
    return zone;
  }
}

