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
  '₺': 0x54,
};

function formatTry(kurus: number): string {
  const amount = kurus / 100;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount);
}

export class ThermalTicketDomain {
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

    if (data.orderType === 'delivery' && data.addressText) lines.push(`ADRES  : ${data.addressText}`);
    if (data.customerNote) {
      lines.push(thinDivider, `MÜŞTERİ NOTU: ${data.customerNote}`);
    }

    lines.push(thinDivider, 'ADET  ÜRÜN                                 TUTAR', thinDivider);
    for (const item of data.items) {
      lines.push(`${item.quantity}x    ${item.nameTr} - ${formatTry(item.lineTotalKurus)}`);
      for (const opt of item.options) {
        const deltaStr = opt.priceDeltaKurus > 0 ? ` (+${formatTry(opt.priceDeltaKurus)})` : '';
        lines.push(`        + ${opt.nameTr}${deltaStr}`);
      }
    }

    lines.push(thinDivider, `ARA TOPLAM : ${formatTry(data.subtotalKurus)}`);
    if (data.discountKurus > 0) lines.push(`İNDİRİM    : -${formatTry(data.discountKurus)}`);
    lines.push(`GENEL TOPLAM: ${formatTry(data.totalKurus)}`, divider, '             AFİYET OLSUN!                      ', '');

    const textTr = lines.join('\n');
    const headerCmd = Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x12]);
    const bodyBytes = this.encodeCp857(textTr + '\n\n\n');
    const cutCmd = Buffer.from([0x1d, 0x56, 0x42, 0x00]);
    return { textTr, escPosBase64: Buffer.concat([headerCmd, bodyBytes, cutCmd]).toString('base64') };
  }
}
