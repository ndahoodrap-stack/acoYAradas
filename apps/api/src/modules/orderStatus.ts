import { ORDER_STATUS_FLOW, type OrderStatus } from '@acoyaradas/shared';
import type { DbExecutor } from '../db/index.js';
import { badRequest } from '../lib/errors.js';
import { publish, channels } from '../lib/events.js';

export interface StatusChange {
  orderId: string;
  status: OrderStatus;
  note?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  /** Repartidor asignado al asignar el pedido. */
  riderId?: string | null;
  merchantResponsible?: string | null;
  preparationMinutes?: number | null;
  cancelReason?: string | null;
}

export interface OrderRow {
  id: string;
  code: string;
  store_id: string;
  customer_id: string | null;
  customer_name: string;
  phone: string;
  status: OrderStatus;
  delivery_mode: 'platform' | 'merchant';
  fulfillment_type: 'delivery' | 'pickup';
  rider_id: string | null;
  merchant_responsible: string | null;
  estimated_preparation_minutes: number | null;
  shipping_notes: string | null;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  shipping_notes_text?: string | null;
}

const ALLOWED = ORDER_STATUS_FLOW;

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return;
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw badRequest(
      `No se puede pasar de "${from}" a "${to}". Transiciones permitidas: ${allowed.join(', ') || 'ninguna'}.`,
    );
  }
}

/**
 * Aplica un cambio de estado, escribe el historial y notifica en vivo.
 * El cálculo de timestamps y las notificaciones quedan del lado del servidor.
 */
export async function applyOrderStatus(tx: DbExecutor, change: StatusChange): Promise<void> {
  const { rows } = await tx.query<any>(
    `select id, code, status, store_id, customer_id, delivery_mode, fulfillment_type, rider_id
       from public.orders where id = $1 for update`,
    [change.orderId],
  );
  const order = rows[0];
  if (!order) throw badRequest('El pedido no existe');

  const previous = order.status as OrderStatus;
  assertTransition(previous, change.status);

  const sets: string[] = ['status = $2'];
  const params: unknown[] = [change.orderId, change.status];
  let idx = 3;

  if (change.status === 'confirmed') {
    sets.push(`confirmed_at = now()`);
  } else if (change.status === 'ready') {
    sets.push(`ready_at = now()`);
  } else if (change.status === 'delivered') {
    sets.push(`delivered_at = now()`);
  } else if (change.status === 'cancelled') {
    sets.push(`cancelled_at = now()`);
  } else if (change.status === 'incident') {
    sets.push(`incident_notes = $${idx++}`);
    params.push(change.note ?? 'Incidencia reportada');
  }
  if (change.riderId) {
    sets.push(`rider_id = $${idx++}`);
    params.push(change.riderId);
  }
  if (change.merchantResponsible !== undefined && change.merchantResponsible !== null) {
    sets.push(`merchant_responsible = $${idx++}`);
    params.push(change.merchantResponsible);
  }
  if (change.preparationMinutes !== undefined && change.preparationMinutes !== null) {
    sets.push(`estimated_preparation_minutes = $${idx++}`);
    params.push(change.preparationMinutes);
  }
  if (change.cancelReason) {
    sets.push(`cancel_reason = $${idx++}`);
    params.push(change.cancelReason);
  }
  sets.push('updated_at = now()');

  await tx.query(`update public.orders set ${sets.join(', ')} where id = $1`, params);

  await tx.query(
    `insert into public.order_status_history (order_id, status, note, actor_id, actor_name)
     values ($1,$2,$3,$4,$5)`,
    [change.orderId, change.status, change.note ?? null, change.actorId ?? null, change.actorName ?? null],
  );

  publish(channels.order(change.orderId), {
    order_id: change.orderId,
    code: order.code,
    status: change.status,
    previous_status: previous,
    note: change.note ?? null,
  });
  publish(channels.store(order.store_id), {
    order_id: change.orderId,
    status: change.status,
    previous_status: previous,
  });
  if (order.customer_id) {
    publish(channels.user(order.customer_id), {
      order_id: change.orderId,
      status: change.status,
      previous_status: previous,
    });
  }
}
