import { config } from '../config.js';
import type { Claims, Database, DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';

export interface NotificationInput {
  user_id?: string | null;
  store_id?: string | null;
  rider_id?: string | null;
  order_id?: string | null;
  channel?: 'in_app' | 'whatsapp' | 'email';
  template: string;
  payload?: Record<string, unknown>;
}

export interface NotificationRow {
  id: string;
  user_id: string | null;
  store_id: string | null;
  rider_id: string | null;
  order_id: string | null;
  channel: 'in_app' | 'whatsapp' | 'email';
  template: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

/**
 * Registra notificaciones dentro de la transacción actual.
 * Se escriben con los claims del destinatario para que las políticas RLS
 * de `notifications` los permitan (el usuario sólo puede insertar
 * notificaciones dirigidas a sí mismo / a su comercio / a su repartoidor).
 */
export async function queueNotifications(
  tx: DbExecutor,
  notifications: NotificationInput[],
): Promise<void> {
  for (const n of notifications) {
    const channel = n.channel ?? 'in_app';
    await tx.query(
      `insert into public.notifications
         (user_id, store_id, rider_id, order_id, channel, template, payload, status, error)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [
        n.user_id ?? null,
        n.store_id ?? null,
        n.rider_id ?? null,
        n.order_id ?? null,
        channel,
        n.template,
        JSON.stringify(n.payload ?? {}),
        channel === 'in_app' ? 'queued' : 'queued',
        channel === 'in_app' ? null : 'Proveedor no configurado',
      ],
    );
  }
}

/**
 * Envío de notificaciones a canales externos (WhatsApp / email).
 *
 * El proveedor por defecto es "none": las notificaciones quedan registradas
 * en la base como `queued` y NO se afirma que se hayan enviado.
 * Con WHATSAPP_PROVIDER=webhook se delega a un webhook propio.
 */
export async function dispatchNotifications(
  db: Database,
  notifications: NotificationInput[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const n of notifications) {
    const channel = n.channel ?? 'in_app';
    if (channel === 'in_app') {
      sent += 1;
      continue;
    }
    if (!config.whatsappProvider || config.whatsappProvider === 'none') {
      failed += 1;
      continue;
    }
    try {
      const res = await fetch(config.whatsappWebhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.whatsappWebhookToken
            ? { authorization: `Bearer ${config.whatsappWebhookToken}` }
            : {}),
        },
        body: JSON.stringify({ template: n.template, ...n.payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sent += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.warn(`[notify] fallo el envío (${channel}):`, (err as Error).message);
    }
  }
  return { sent, failed };
}

/** Inserta notificaciones en su propia transacción con los claims del destinatario. */
export async function insertNotificationsAs(
  db: Database,
  claims: Claims,
  notifications: NotificationInput[],
): Promise<void> {
  if (notifications.length === 0) return;
  await db.transaction(async (tx) => {
    await applyClaims(tx, claims);
    await queueNotifications(tx, notifications);
  });
}
