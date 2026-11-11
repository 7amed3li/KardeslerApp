import net from 'node:net';
import { EscPosTicketFormatter, type TicketData } from './escpos.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const PRINTER_HOST = process.env.PRINTER_IP || '192.168.1.200';
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);

console.log('🍢 Kardeşler Cihangir Kitchen Print Agent Service starting...');
console.log(`Backend Target: ${BACKEND_URL}`);
console.log(`Local LAN Thermal Printer: ${PRINTER_HOST}:${PRINTER_PORT}`);

export async function printKitchenTicket(data: TicketData): Promise<boolean> {
  const payload = EscPosTicketFormatter.buildTicket(data);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(PRINTER_PORT, PRINTER_HOST, () => {
      socket.write(payload, () => {
        socket.end();
        console.log(`✓ Order #${data.orderNumber} printed on SUNLUX RP8020.`);
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      console.error(`✗ Print failed for order #${data.orderNumber}: ${err.message}`);
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      console.error(`✗ Printer socket timeout for order #${data.orderNumber}`);
      socket.destroy();
      resolve(false);
    });
  });
}
