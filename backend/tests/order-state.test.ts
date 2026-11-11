import { describe, it, expect } from 'vitest';
import { OrderStateMachine } from '../src/domain/orders/order-state-machine.js';

describe('OrderStateMachine Unit Tests', () => {
  it('allows valid standard delivery lifecycle chain', () => {
    expect(OrderStateMachine.canTransition('new', 'accepted')).toBe(true);
    expect(OrderStateMachine.canTransition('accepted', 'on_the_way')).toBe(true);
    expect(OrderStateMachine.canTransition('on_the_way', 'delivered')).toBe(true);
  });

  it('allows cancellation from active statuses', () => {
    expect(OrderStateMachine.canTransition('new', 'cancelled')).toBe(true);
    expect(OrderStateMachine.canTransition('accepted', 'cancelled')).toBe(true);
    expect(OrderStateMachine.canTransition('on_the_way', 'cancelled')).toBe(true);
  });

  it('blocks invalid direct status jumps', () => {
    expect(OrderStateMachine.canTransition('new', 'delivered')).toBe(false);
    expect(OrderStateMachine.canTransition('new', 'on_the_way')).toBe(false);
  });

  it('blocks mutations from terminal states', () => {
    expect(OrderStateMachine.isTerminal('delivered')).toBe(true);
    expect(OrderStateMachine.isTerminal('cancelled')).toBe(true);
    expect(OrderStateMachine.isTerminal('rejected')).toBe(true);
    expect(OrderStateMachine.canTransition('delivered', 'cancelled')).toBe(false);
    expect(OrderStateMachine.canTransition('delivered', 'new')).toBe(false);
    expect(OrderStateMachine.canTransition('cancelled', 'accepted')).toBe(false);
  });

  it('assertTransition throws DomainError on invalid transitions', () => {
    expect(() => OrderStateMachine.assertTransition('delivered', 'new')).toThrowError(
      /Geçersiz sipariş durum geçişi/,
    );
  });
});
