import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(__dirname, '../../../database/007_seed.sql');
let content = fs.readFileSync(filePath, 'utf8');

const replacements: [string, string][] = [
  ["34000, 1, '/images/adana.jpg'", "72500, 1, '/images/adana.jpg'"],
  ["34000, 1, '/images/urfa.jpg'", "72500, 1, '/images/urfa.jpg'"],
  ["42000, 1, '/images/beyti.jpg'", "83000, 1, '/images/beyti.jpg'"],
  ["44000, 1, '/images/copsisi.jpg'", "90000, 1, '/images/copsisi.jpg'"],
  ["38000, 1, '/images/kuzu_ciger.jpg'", "82500, 1, '/images/kuzu_ciger.jpg'"],
  ["22000, 1, '/images/adana_durum.jpg'", "35000, 1, '/images/adana_durum.jpg'"],
  ["22000, 1, '/images/urfa_durum.jpg'", "35000, 1, '/images/urfa_durum.jpg'"],
  ["19000, 1, '/images/tavuk_sis_durum.jpg'", "33000, 1, '/images/tavuk_sis_durum.jpg'"],
  ["9000, 1, '/images/lahmacun_item.jpg'", "21000, 1, '/images/lahmacun_item.jpg'"],
  ["26000, 1, '/images/kasarli_pide.jpg'", "41000, 1, '/images/kasarli_pide.jpg'"],
  ["31000, 1, '/images/kusbasili_kasarli_pide.jpg'", "50000, 1, '/images/kusbasili_kasarli_pide.jpg'"],
  ["90000, 1, '/images/serpme_kahvalti.jpg'", "130000, 1, '/images/serpme_kahvalti.jpg'"],
  ["25000, 1, '/images/menemen.jpg'", "30000, 1, '/images/menemen.jpg'"],
  ["14000, 1, '/images/humus.webp'", "18000, 1, '/images/humus.webp'"],
  ["11000, 1, '/images/coban_salata.jpg'", "20000, 1, '/images/coban_salata.jpg'"],
  ["18000, 1, '/images/kunefe.jpg'", "25000, 1, '/images/kunefe.jpg'"],
  ["4000, 1, '/images/ayran.jpg'", "8500, 1, '/images/ayran.jpg'"],
];

for (const [from, to] of replacements) {
  content = content.replace(from, to);
}

content = content.replace(
  /('f0000000-0000-0000-0000-000000000017'[\s\S]*?)ON CONFLICT \(id\) DO NOTHING;/m,
  '$1ON CONFLICT (id) DO UPDATE SET price_kurus = EXCLUDED.price_kurus, is_available = true, deleted_at = NULL;',
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated 007_seed.sql with real prices.');
