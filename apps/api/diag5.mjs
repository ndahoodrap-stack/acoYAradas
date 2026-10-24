import { createPgliteDatabase } from './src/db/pglite.js';
import { runMigrations } from './src/db/migrate.js';
import { seedDemoData } from './src/db/seed.js';
import { applyClaims } from './src/db/index.js';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const db = await createPgliteDatabase('memory://');
await runMigrations({ db, root: REPO_ROOT, silent: true });
await seedDemoData(db);

const RIDER_USER = '33333333-3333-4333-8333-333333333333';
// find rider id
const r0 = await db.system.query('select id from public.riders where user_id = $1', [RIDER_USER]);
const riderId = r0.rows[0].id;
console.log('riderId', riderId);

await db.transaction(async (tx) => {
  await applyClaims(tx, { sub: RIDER_USER, role: 'courier', email: 'repartidor@acoyaradas.app' });
  console.log('uid', (await tx.query('select public.app_current_user_id() as uid')).rows);
  console.log('updating...');
  const r = await tx.query('update public.riders set available = false, updated_at = now() where id = $1 returning id, available', [riderId]);
  console.log('update result', r.rows);
});

await db.close();
console.log('done');
