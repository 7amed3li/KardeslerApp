import postgres from 'postgres';
import { verifyDbSecurityPosture } from '../src/infrastructure/db/client.js';

async function run() {
  const roSql = postgres('postgresql://app_readonly:readonly_dev_secret_change_me@127.0.0.1:5434/kardesler_db', { max: 1 });

  console.log('=== (a) Booting with app_migrator as API role ===');
  const migratorSql = postgres('postgresql://app_migrator:migrator_dev_secret_change_me@127.0.0.1:5434/kardesler_db', { max: 1 });
  try {
    await verifyDbSecurityPosture(migratorSql, roSql);
    console.log('UNEXPECTED: Allowed boot with app_migrator!');
  } catch (err: any) {
    console.log('REFUSED:', err.message);
  } finally {
    await migratorSql.end({ timeout: 1 });
  }

  console.log('=== (b) Booting with BYPASSRLS / SUPERUSER role (postgres) ===');
  const superSql = postgres('postgresql://postgres@127.0.0.1:5434/kardesler_db', { max: 1 });
  try {
    await verifyDbSecurityPosture(superSql, roSql);
    console.log('UNEXPECTED: Allowed boot with postgres superuser!');
  } catch (err: any) {
    console.log('REFUSED:', err.message);
  } finally {
    await superSql.end({ timeout: 1 });
  }

  console.log('=== (c) Booting with app_readonly as API role ===');
  try {
    await verifyDbSecurityPosture(roSql, roSql);
    console.log('UNEXPECTED: Allowed boot with app_readonly as API role!');
  } catch (err: any) {
    console.log('REFUSED:', err.message);
  } finally {
    await roSql.end({ timeout: 1 });
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

