import iconv from 'iconv-lite';

export interface TicketData {
  orderNumber: number;
  time: string;
  orderType: 'delivery' | 'pickup';
  items: {
    name: string;
    quantity: number;
    options: string[];
  }[];
  customerNote?: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  paymentMethod: 'card_online' | 'cash_on_delivery';
  totalKurus: number;
}

export class EscPosTicketFormatter {
  // ESC/POS Command bytes
  private static readonly ESC = 0x1b;
  private static readonly GS = 0x1d;

  /**
   * Builds an 80mm ESC/POS thermal ticket buffer encoded in CP857 (Turkish).
   */
  public static buildTicket(data: TicketData): Buffer {
    const buffers: Buffer[] = [];

    // 1. Initialize printer: ESC @
    buffers.push(Buffer.from([this.ESC, 0x40]));

    // 2. Select Code Page CP857 (Turkish): ESC t 18 (or 19 depending on firmware)
    buffers.push(Buffer.from([this.ESC, 0x74, 18]));

    // 3. Center alignment: ESC a 1
    buffers.push(Buffer.from([this.ESC, 0x61, 1]));

    // Header title
    buffers.push(this.encodeText('*** KARDEŞLER CİHANGİR KEBAP ***\n'));
    buffers.push(this.encodeText('MUTFAK SİPARİŞ FİŞİ\n\n'));

    // 4. Double size font for daily order number: GS ! 0x11
    buffers.push(Buffer.from([this.GS, 0x21, 0x11]));
    buffers.push(this.encodeText(`SİPARİŞ NO: #${data.orderNumber}\n`));
    // Reset font size: GS ! 0x00
    buffers.push(Buffer.from([this.GS, 0x21, 0x00]));

    // 5. Left alignment: ESC a 0
    buffers.push(Buffer.from([this.ESC, 0x61, 0]));
    buffers.push(this.encodeText('------------------------------------------\n'));
    buffers.push(this.encodeText(`Saat: ${data.time}\n`));
    buffers.push(
      this.encodeText(`Tür : ${data.orderType === 'delivery' ? 'PAKET SERVİS (ADRESE)' : 'GEL-AL'}\n`),
    );
    buffers.push(this.encodeText('------------------------------------------\n'));

    // 6. Ordered Items List
    for (const item of data.items) {
      buffers.push(this.encodeText(`[ ] ${item.quantity}x ${item.name}\n`));
      for (const opt of item.options) {
        buffers.push(this.encodeText(`    >> ${opt}\n`));
      }
    }
    buffers.push(this.encodeText('------------------------------------------\n'));

    // 7. Customer Note
    if (data.customerNote) {
      buffers.push(Buffer.from([this.ESC, 0x45, 1])); // Bold on
      buffers.push(this.encodeText(`MÜŞTERİ NOTU:\n${data.customerNote}\n`));
      buffers.push(Buffer.from([this.ESC, 0x45, 0])); // Bold off
      buffers.push(this.encodeText('------------------------------------------\n'));
    }

    // 8. Delivery Info
    if (data.orderType === 'delivery' && data.address) {
      buffers.push(this.encodeText(`Müşteri: ${data.customerName}\n`));
      buffers.push(this.encodeText(`Telefon: ${data.customerPhone}\n`));
      buffers.push(this.encodeText(`Adres  : ${data.address}\n`));
      buffers.push(this.encodeText('------------------------------------------\n'));
    }

    // 9. Payment Information (Highlight cash to collect)
    if (data.paymentMethod === 'cash_on_delivery') {
      buffers.push(Buffer.from([this.GS, 0x21, 0x01])); // Double height
      buffers.push(
        this.encodeText(
          `KAPIDA NAKİT TAHSİL EDİLECEK: ${(data.totalKurus / 100).toFixed(2)} TL\n`,
        ),
      );
      buffers.push(Buffer.from([this.GS, 0x21, 0x00]));
    } else {
      buffers.push(
        this.encodeText(
          `ÖDEME: ONLINE KART (ÖDENDİ) - ${(data.totalKurus / 100).toFixed(2)} TL\n`,
        ),
      );
    }

    buffers.push(this.encodeText('\n\n\n\n'));

    // 10. Cut paper: GS V 66 0 (Partial cut with feed)
    buffers.push(Buffer.from([this.GS, 0x56, 66, 0]));

    return Buffer.concat(buffers);
  }

  public static encodeText(text: string): Buffer {
    // Encodes UTF-8 string into Turkish CP857 byte stream
    return iconv.encode(text, 'cp857');
  }
}
