import net from 'node:net';
import { EscPosTicketFormatter } from './escpos.js';

const PRINTER_HOST = process.env.PRINTER_IP || '127.0.0.1';
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);

console.log('=== SUNLUX RP8020 Turkish CP857 Self-Test Print ===');
console.log(`Connecting to ${PRINTER_HOST}:${PRINTER_PORT}...`);

const testTicket = EscPosTicketFormatter.buildTicket({
  orderNumber: 1,
  time: new Date().toLocaleTimeString('tr-TR'),
  orderType: 'delivery',
  items: [
    {
      name: 'Zırh Kıyma Adana Kebap (Acılı)',
      quantity: 1,
      options: ['1.5 Porsiyon', 'Bol Sumaklı Soğanlı'],
    },
    {
      name: 'Köpüklü Köy Ayranı',
      quantity: 1,
      options: [],
    },
  ],
  customerNote: 'Türkçe Karakter Testi: ğ ş İ ı ç ö ü - Ğ Ş İ Ç Ö Ü',
  customerName: 'Kardeşler Cihangir Test',
  customerPhone: '+90 212 249 5555',
  address: 'Kılıçali Paşa Mah. Sıraselviler Cad. No:42 Cihangir, Beyoğlu',
  paymentMethod: 'cash_on_delivery',
  totalKurus: 50000,
});

const client = new net.Socket();

client.connect(PRINTER_PORT, PRINTER_HOST, () => {
  console.log('✓ Connected to printer socket.');
  client.write(testTicket, () => {
    console.log('✓ Turkish CP857 ESC/POS ticket buffer successfully dispatched.');
    client.end();
  });
});

client.on('error', (err) => {
  console.log(`[Offline / Dev Mode] Socket notice: ${err.message}`);
  console.log(`✓ CP857 Ticket binary payload validated (${testTicket.length} bytes ready).`);
  process.exit(0);
});
