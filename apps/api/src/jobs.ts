import type { Database } from './db/index.js';
import { applyClaims } from './db/index.js';
import { money } from './lib/money.js';

/**
 * Job periódico: procesa suscripciones vencidas según las reglas
 * configuradas (marca `expired` y deja el cobro pendiente registrado,
 * sin marcarlo como confirmado).
 */
export async function processExpiredSubscriptions(db: Database): Promise<number> {
  return db.transaction(async (tx) => {
    await applyClaims(tx, { role: 'admin' });
    const expired = await tx.query<any>(
      `select s.id, s.store_id, s.plan_id, s.ends_at, p.price, p.code
         from public.subscriptions s join public.plans p on p.id = s.plan_id
        where s.status = 'active' and s.ends_at <= now()`,
    );
    for (const sub of expired.rows) {
      await tx.query(`update public.subscriptions set status = 'expired', updated_at = now() where id = $1`, [
        sub.id,
      ]);
      if (Number(sub.price ?? 0) > 0) {
        const exists = await tx.query(
          `select 1 from public.payments where subscription_id = $1 and kind = 'subscription' and status = 'pending' limit 1`,
          [sub.id],
        );
        if (!exists.rows.length) {
          await tx.query(
            `insert into public.payments (store_id, subscription_id, kind, amount, status, due_at, notes)
             values ($1,$2,'subscription',$3,'pending', now(), $4)`,
            [
              sub.store_id,
              sub.id,
              money(Number(sub.price)),
              'Renovación de abono (pendiente de confirmación)',
            ],
          );
        }
      }
    }
    return expired.rows.length;
  });
}

/** Inicia los jobs periódicos de la plataforma. */
export function startJobs(db: Database): () => void {
  const run = async () => {
    try {
      const processed = await processExpiredSubscriptions(db);
      if (processed > 0) {
        // eslint-disable-next-line no-console
        console.log(`[jobs] ${processed} suscripciones vencidas procesadas`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[jobs] error procesando suscripciones:', (err as Error).message);
    }
  };
  void run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
