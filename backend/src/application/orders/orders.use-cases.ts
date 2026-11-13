import type { OrderStatus } from '@kardesler/shared';
import { DomainError } from '../../domain/errors.js';
import { DeliveryDomain } from '../../domain/delivery/delivery.domain.js';
import { PricingDomain } from '../../domain/pricing/pricing.domain.js';
import type { Clock } from '../../ports/clock.js';
import type { PaymentProvider } from '../../ports/providers.js';
import type { CouponRepository, DeliveryRepository, MenuRepository, OrderRepository, PaymentRepository } from '../../ports/repositories.js';
import type { EventBusPort, RateLimiterPort } from '../../ports/state.js';

export interface OrderDeps {
  ordersRepo: OrderRepository;
  menuRepo: MenuRepository;
  deliveryRepo: DeliveryRepository;
  couponRepo: CouponRepository;
  paymentRepo: PaymentRepository;
  paymentProvider: PaymentProvider;
  eventBus: EventBusPort;
  rateLimiter: RateLimiterPort;
  clock: Clock;
}

export class OrdersUseCases {
  constructor(private readonly d: OrderDeps) {}

  async quoteCart(input: {
    items: { menu_item_id: string; quantity: number; option_ids: string[] }[];
    order_type: 'delivery' | 'pickup';
    coupon_code?: string;
    lat?: number;
    lng?: number;
  }) {
    const snapshot = await this.d.menuRepo.getPricingSnapshot();
    let zone = null;
    if (input.order_type === 'delivery' && input.lat !== undefined && input.lng !== undefined) {
      zone = DeliveryDomain.requireCoveredZone(await this.d.deliveryRepo.findZoneAtPoint(input.lat, input.lng));
    }
    const coupon = input.coupon_code ? await this.d.couponRepo.findByCode(input.coupon_code) : null;
    const q = PricingDomain.calculateQuote({
      input: {
        items: input.items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity, optionIds: i.option_ids })),
        orderType: input.order_type,
        now: this.d.clock.now(),
      },
      menuMap: snapshot.items,
      isRestaurantOpen: true,
      isAcceptingOrders: snapshot.isAcceptingOrders,
      coupon,
      deliveryZone: zone ? { id: zone.id, name: zone.name, minOrderKurus: zone.minOrderKurus, deliveryFeeKurus: zone.deliveryFeeKurus } : null,
      strictCoupon: false,
    });
    return {
      subtotal_kurus: q.subtotalKurus,
      discount_kurus: q.discountKurus,
      delivery_fee_kurus: q.deliveryFeeKurus,
      total_kurus: q.totalKurus,
      min_order_kurus_applied: q.minOrderKurusApplied,
      is_min_order_met: q.isMinOrderMet,
      min_order_shortfall_kurus: q.minOrderShortfallKurus,
      coupon_applied: q.couponApplied ? { code: q.couponApplied.code, discount_kurus: q.couponApplied.discountKurus } : null,
    };
  }

  async createOrder(userId: string, input: {
    order_type: 'delivery' | 'pickup';
    payment_method: 'card_online' | 'cash_on_delivery';
    idempotency_key: string;
    items: { menu_item_id: string; quantity: number; option_ids: string[] }[];
    address_id?: string;
    address_snapshot?: unknown;
    coupon_code?: string;
    customer_note?: string;
  }) {
    await this.d.rateLimiter.check(`orders:create:${userId}`, 20, 5 * 60 * 1000);
    const created = await this.d.ordersRepo.createViaStoredFn(userId, {
      orderType: input.order_type,
      paymentMethod: input.payment_method,
      idempotencyKey: input.idempotency_key,
      items: input.items,
      addressId: input.address_id,
      addressSnapshot: input.address_snapshot,
      couponCode: input.coupon_code,
      customerNote: input.customer_note,
    });

    let paymentCheckout = null;
    if (created.paymentMethod === 'card_online') {
      paymentCheckout = await this.d.paymentProvider.initializePayment({
        orderId: created.id,
        amountKurus: created.totalKurus,
        customerName: created.customerNameSnapshot,
        customerPhone: created.customerPhoneSnapshot,
        callbackUrl: 'https://api.kardeslercihangir.com/api/v1/payments/webhook',
      });
    } else {
      await this.d.eventBus.publish('order.created', {
        orderId: created.id, orderNumber: created.orderNumber, businessDate: created.businessDate,
        status: created.status, totalKurus: created.totalKurus,
      });
    }
    return {
      id: created.id,
      orderNumber: created.orderNumber,
      businessDate: created.businessDate,
      status: created.status,
      subtotalKurus: created.subtotalKurus,
      discountKurus: created.discountKurus,
      deliveryFeeKurus: created.deliveryFeeKurus,
      totalKurus: created.totalKurus,
      paymentMethod: created.paymentMethod,
      paymentCheckout,
    };
  }

  async listCustomerOrders(userId: string) {
    return { orders: await this.d.ordersRepo.listCustomerOrders(userId) };
  }

  async getCustomerOrderDetail(userId: string, orderId: string) {
    const detail = await this.d.ordersRepo.getCustomerOrderDetail(userId, orderId);
    if (!detail) throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');
    return detail;
  }

  async cancelCustomerOrder(userId: string, orderId: string, reason?: string) {
    const res = await this.d.ordersRepo.cancelCustomerOrder(userId, orderId, reason ?? 'Müşteri tarafından iptal edildi');
    let refunded = false;
    if (res.wasPaidCard) {
      const { refundRef } = await this.d.paymentProvider.refundPayment(orderId, res.order.totalKurus);
      refunded = await this.d.paymentRepo.markOrderRefundSucceeded({
        orderId,
        reason: reason ?? 'Customer cancelled order',
        initiatedBy: userId,
        refundRef,
        now: this.d.clock.now(),
      });
    }
    return { order: res.order, refunded };
  }

  async reorderPreview(userId: string, orderId: string) {
    const report = await this.d.ordersRepo.buildReorderPreview(userId, orderId);
    if (!report) throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');
    return report;
  }

  async listStaffOrders(staffId: string, role: 'staff' | 'owner') {
    return { orders: await this.d.ordersRepo.listStaffOrders(staffId, role) };
  }

  async searchStaffOrders(staffId: string, role: 'staff' | 'owner', query: string) {
    return { orders: await this.d.ordersRepo.searchStaffOrders(staffId, role, query) };
  }

  async transitionOrderAsStaff(staffId: string, role: 'staff' | 'owner', orderId: string, status: OrderStatus, cancelReason?: string) {
    const res = await this.d.ordersRepo.transitionOrderAsStaff({
      staffId, role, orderId, toStatus: status, cancelReason,
      loyaltyKurusPerPoint: 100, referrerBonus: 100, referredBonus: 50, now: this.d.clock.now(),
    });
    if (res.shouldRefundPaidCard) {
      const { refundRef } = await this.d.paymentProvider.refundPayment(res.paymentProviderRef ?? orderId, res.paymentAmountKurus);
      await this.d.paymentRepo.markOrderRefundSucceeded({
        orderId,
        reason: cancelReason ?? `Order ${status} by staff`,
        initiatedBy: staffId,
        refundRef,
        now: this.d.clock.now(),
      });
    }
    await this.d.eventBus.publish('order.status_changed', {
      orderId: res.order.id, orderNumber: res.order.orderNumber, toStatus: res.order.status,
    });
    return { order: res.order };
  }

  async assignDriver(staffId: string, role: 'staff' | 'owner', orderId: string, driverId: string) {
    const order = await this.d.ordersRepo.assignDriver(staffId, role, orderId, driverId);
    if (!order) throw new DomainError('NOT_FOUND', 404, 'Sipariş bulunamadı');
    return { order };
  }

  async createReprintJob(staffId: string, role: 'staff' | 'owner', orderId: string) {
    const printJob = await this.d.ordersRepo.createReprintJob(staffId, role, orderId);
    return { printJob };
  }
}

