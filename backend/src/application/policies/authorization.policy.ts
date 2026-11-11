import { DomainError } from '../../domain/errors.js';
import type { StaffRole } from '@kardesler/shared';

export interface AuthActor {
  kind: 'customer' | 'staff' | 'print_agent';
  sub: string;
  role: string;
}

export class AuthorizationPolicy {
  public static assertCustomer(actor: AuthActor): asserts actor is { kind: 'customer'; sub: string; role: 'customer' } {
    if (actor.kind !== 'customer' || actor.role !== 'customer') {
      throw new DomainError('FORBIDDEN', 403, 'Bu işlem sadece müşteriler içindir');
    }
  }

  public static assertStaffRole(
    actor: AuthActor,
    allowedRoles: readonly StaffRole[] = ['staff', 'owner'],
  ): asserts actor is { kind: 'staff'; sub: string; role: StaffRole } {
    if (actor.kind !== 'staff' || !allowedRoles.includes(actor.role as StaffRole)) {
      throw new DomainError('FORBIDDEN', 403, 'Bu işlem için yetki seviyeniz yetersiz');
    }
  }

  public static assertPrintAgent(actor: AuthActor): asserts actor is { kind: 'print_agent'; sub: string; role: 'print_agent' } {
    if (actor.kind !== 'print_agent' || actor.role !== 'print_agent') {
      throw new DomainError('FORBIDDEN', 403, 'Bu işlem yazıcı ajanı içindir');
    }
  }

  public static assertOwnership(actorId: string, ownerId: string | null): void {
    if (!ownerId || actorId !== ownerId) {
      throw new DomainError('FORBIDDEN', 403, 'Bu kaynağa erişim yetkiniz yok');
    }
  }
}

