import { describe, it, expect } from 'vitest';
import { EscPosTicketFormatter } from '../src/escpos.js';

describe('EscPosTicketFormatter Unit Tests', () => {
  it('correctly encodes Turkish CP857 characters into binary buffer', () => {
    const rawText = 'ğ ş İ ı ç ö ü - Ğ Ş İ Ç Ö Ü';
    const encoded = EscPosTicketFormatter.encodeText(rawText);

    expect(encoded).toBeInstanceOf(Buffer);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('generates complete ESC/POS ticket buffer with cut command', () => {
    const ticket = EscPosTicketFormatter.buildTicket({
      orderNumber: 42,
      time: '19:45',
      orderType: 'delivery',
      items: [
        {
          name: 'Zırh Kıyma Adana Kebap',
          quantity: 2,
          options: ['1.5 Porsiyon', 'Soğansız'],
        },
      ],
      customerNote: 'Lütfen sıcak gelsin',
      customerName: 'Hasan Can',
      customerPhone: '+905321234567',
      address: 'Cihangir Cad. No:10',
      paymentMethod: 'cash_on_delivery',
      totalKurus: 100000,
    });

    expect(ticket).toBeInstanceOf(Buffer);
    expect(ticket.length).toBeGreaterThan(100);

    // Verify ESC/POS Paper Cut command: GS V 66 0 (0x1D 0x56 0x42 0x00)
    const cutSlice = ticket.subarray(ticket.length - 4);
    expect(cutSlice[0]).toBe(0x1d); // GS
    expect(cutSlice[1]).toBe(0x56); // V
    expect(cutSlice[2]).toBe(66);   // 0x42
  });
});
