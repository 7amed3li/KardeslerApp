import { formatKurus } from '@kardesler/shared';

export interface KitchenTicketData {
  orderNumber: number;
  businessDate: string;
  orderType: 'delivery' | 'pickup';
  paymentMethod: 'card_online' | 'cash_on_delivery';
  customerName: string;
  customerPhone: string;
  addressText?: string | null;
  customerNote?: string | null;
  items: {
    quantity: number;
    nameTr: string;
    unitPriceKurus: number;
    lineTotalKurus: number;
    options: { nameTr: string; priceDeltaKurus: number }[];
  }[];
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
  createdAt: Date | string;
}

const CP857_MAP: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  ö: 0x94,
  Ö: 0x99,
  Ü: 0x9a,
  ş: 0x9f,
  Ş: 0x9e,
  ğ: 0xa6,
  Ğ: 0xa7,
  ı: 0x8d,
  İ: 0x98,
  ç: 0x87,
  '₺': 0x54, // 'TL' fallback
};

export class ThermalTicketService {
  /**
   * Encodes a UTF-8 Turkish string into CP857 bytes for SUNLUX RP8020 80mm thermal printer.
   */
  public static encodeCp857(text: string): Buffer {
    const normalized = text.replace(/₺/g, 'TL');
    const bytes: number[] = [];
    for (const ch of normalized) {
      if (ch in CP857_MAP) {
        bytes.push(CP857_MAP[ch]);
      } else {
        const code = ch.charCodeAt(0);
        bytes.push(code <= 0x7f ? code : 0x3f);
      }
    }
    return Buffer.from(bytes);
  }

  /**
   * Formats a kitchen ticket strictly in Turkish for SUNLUX RP8020 (ESC/POS, CP857).
   */
  public static formatKitchenTicket(data: KitchenTicketData): {
    textTr: string;
    escPosBase64: string;
  } {
    const divider = '================================================';
    const thinDivider = '------------------------------------------------';
    const orderTypeLabel = data.orderType === 'delivery' ? 'PAKET SERVİS (KURYE)' : 'GEL AL (PICKUP)';
    const paymentLabel =
      data.paymentMethod === 'card_online' ? 'ONLİNE KART (ÖDENDİ)' : 'KAPIDA ÖDEME';

    const lines: string[] = [
      divider,
      '       KARDEŞLER CİHANGİR KEBAP SALONU          ',
      `       SİPARİŞ NO: #${data.orderNumber} (${data.businessDate})`,
      divider,
      `TİP    : ${orderTypeLabel}`,
      `ÖDEME  : ${paymentLabel}`,
      `MÜŞTERİ: ${data.customerName} (${data.customerPhone})`,
    ];

    if (data.orderType === 'delivery' && data.addressText) {
      lines.push(`ADRES  : ${data.addressText}`);
    }

    if (data.customerNote) {
      lines.push(thinDivider);
      lines.push(`MÜŞTERİ NOTU: ${data.customerNote}`);
    }

    lines.push(thinDivider);
    lines.push('ADET  ÜRÜN                                 TUTAR');
    lines.push(thinDivider);

    for (const item of data.items) {
      lines.push(`${item.quantity}x    ${item.nameTr} - ${formatKurus(item.lineTotalKurus)}`);
      for (const opt of item.options) {
        const deltaStr = opt.priceDeltaKurus > 0 ? ` (+${formatKurus(opt.priceDeltaKurus)})` : '';
        lines.push(`        + ${opt.nameTr}${deltaStr}`);
      }
    }

    lines.push(thinDivider);
    lines.push(`ARA TOPLAM : ${formatKurus(data.subtotalKurus)}`);
    if (data.discountKurus > 0) {
      lines.push(`İNDİRİM    : -${formatKurus(data.discountKurus)}`);
    }
    lines.push(`GENEL TOPLAM: ${formatKurus(data.totalKurus)}`);
    lines.push(divider);
    lines.push('             AFİYET OLSUN!                      ');
    lines.push('');

    const textTr = lines.join('\n');

    // ESC/POS command stream: Initialize (ESC @), Select CP857 Turkish (ESC t 18), Body, Feed & Full Cut (GS V 66 0)
    const headerCmd = Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x12]);
    const bodyBytes = this.encodeCp857(textTr + '\n\n\n');
    const cutCmd = Buffer.from([0x1d, 0x56, 0x42, 0x00]);
    const fullBuffer = Buffer.concat([headerCmd, bodyBytes, cutCmd]);

    return {
      textTr,
      escPosBase64: fullBuffer.toString('base64'),
    };
  }
}

