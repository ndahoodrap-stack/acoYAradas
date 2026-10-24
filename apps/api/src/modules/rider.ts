import { Router } from 'express';
import { z } from 'zod';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { requireRider } from '../http/context.js';
import { route, validate } from '../http/router.js';
import { badRequest, notFound } from '../lib/errors.js';
import { money } from '../lib/money.js';
import { insertNotificationsAs } from '../lib/notify.js';
import { notifyOrderStatusWhatsApp } from '../lib/whatsapp.js';
import { applyOrderStatus } from './orderStatus.js';
import { mapOrder, ORDER_SELECT } from './orders.js';

/** Panel del repartidor (Etapa 3). Vista móvil, sólo lo necesario para entregar. */
export const riderRouter = Router();

const availabilitySchema = z.object({
  available: z.boolean(),
});

async function run<T>(ctx: any, fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return ctx.db.transaction(async (tx: DbExecutor) => {
    await applyClaims(tx, ctx.claims);
    return fn(tx);
  });
}

riderRouter.get(
  '/profile',
  route(async (ctx) => {
    const { riderId } = requireRider(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select id, full_name, phone, vehicle_type, zones, active, available from public.riders where id = $1`,
        [riderId],
      );
      if (!rows.length) throw notFound('No tenés un perfil de repartidor');
      return rows[0];
    });
  }),
);

riderRouter.patch(
  '/profile',
  route(async (ctx, req) => {
    const { riderId } = requireRider(ctx);
    const input = validate(availabilitySchema, req.body);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        'update public.riders set available = $2, updated_at = now() where id = $1 returning id, full_name, phone, vehicle_type, zones, active, available',
        [riderId, input.available],
      );
      return rows[0];
    });
  }),
);

riderRouter.get(
  '/orders',
  route(async (ctx, req) => {
    const { riderId } = requireRider(ctx);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    return run(ctx, async (tx) => {
      const params: unknown[] = [riderId];
      let where = '(o.rider_id = $1 or exists (select 1 from public.rider_assignments ra where ra.order_id = o.id and ra.rider_id = $1))';
      if (status && status !== 'all') {
        params.push(status);
        where += ` and o.status = $${params.length}`;
      }
      const { rows } = await tx.query(
        `select ${ORDER_SELECT}, ra.status as assignment_status, ra.amount_collected, ra.amount_due
           from public.orders o
           join public.stores s on s.id = o.store_id
           left join public.riders r on r.id = o.rider_id
           left join public.rider_assignments ra on ra.order_id = o.id and ra.rider_id = $1
          where ${where}
          order by o.placed_at desc
          limit 100`,
        params,
      );
      const items = await tx.query(
        `select oi.* from public.order_items oi
           join public.orders o2 on o2.id = oi.order_id
           join public.rider_assignments ra2 on ra2.order_id = o2.id and ra2.rider_id = $1
          order by oi.id`,
        [riderId],
      );
      const byOrder = new Map<string, any[]>();
      for (const item of items.rows) {
        const list = byOrder.get(item.order_id) ?? [];
        list.push(item);
        byOrder.set(item.order_id, list);
      }
      return {
        items: rows.map((r: any) => ({
          ...mapOrder(r, byOrder.get(r.id) ?? []),
          assignment_status: r.assignment_status ?? null,
          amount_collected: money(Number(r.amount_collected ?? 0)),
          amount_due: money(Number(r.amount_due ?? 0)),
        })),
      };
    });
  }),
);

riderRouter.patch(
  '/orders/:id/status',
  route(async (ctx, req) => {
    const { riderId, user } = requireRider(ctx);
    const status = String(req.body?.status ?? '');
    const note = String(req.body?.note ?? '').slice(0, 1000);
    const amountCollected =
      req.body?.amount_collected === undefined ? null : money(Number(req.body.amount_collected));

    const allowed = ['on_the_way', 'delivered', 'incident'];
    if (!allowed.includes(status)) throw badRequest('Estado no permitido para el repartidor');

    const orderId = String(req.params.id);

    const info = await run(ctx, async (tx) => {
      const owned = await tx.query<{ id: string; customer_id: string | null; store_id: string }>(
        `select o.id, o.customer_id, o.store_id from public.orders o
          where o.id = $1 and (o.rider_id = $2 or exists (
            select 1 from public.rider_assignments ra where ra.order_id = o.id and ra.rider_id = $2))`,
        [orderId, riderId],
      );
      if (!owned.rows.length) throw notFound('El pedido no está asignado a vos');

      await applyOrderStatus(tx, {
        orderId,
        status: status as any,
        note,
        actorId: user.id,
        actorName: user.full_name ?? user.email,
        actorRole: 'courier',
      });

      const assignmentStatus =
        status === 'on_the_way' ? 'picked_up' : status === 'delivered' ? 'delivered' : 'failed';
      await tx.query(
        `update public.rider_assignments
            set status = $2::text::rider_assignment_status,
                picked_up_at = case when $2::text = 'picked_up' then now() else picked_up_at end,
                delivered_at = case when $2::text = 'delivered' then now() else delivered_at end,
                amount_collected = coalesce($3, amount_collected),
                notes = coalesce($4, notes)
          where order_id = $1 and rider_id = $5`,
        [orderId, assignmentStatus, amountCollected, note || null, riderId],
      );
      return owned.rows[0];
    });

    if (info.customer_id) {
      await insertNotificationsAs(ctx.db, { sub: info.customer_id, role: 'customer' }, [
        {
          user_id: info.customer_id,
          order_id: orderId,
          channel: 'in_app',
          template: `order_${status}`,
          payload: { status },
        },
      ]);
    }
    try {
      await notifyOrderStatusWhatsApp(ctx.db, orderId, {
        recipients: ['customer'],
        statusNote: note || null,
      });
    } catch {
      // El cambio de estado no se bloquea si WhatsApp falla
    }
    return { ok: true, status };
  }),
);

riderRouter.get(
  '/history',
  route(async (ctx) => {
    const { riderId } = requireRider(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select ${ORDER_SELECT}, ra.status as assignment_status, ra.amount_collected, ra.amount_due, ra.delivered_at
           from public.rider_assignments ra
           join public.orders o on o.id = ra.order_id
           join public.stores s on s.id = o.store_id
           left join public.riders r on r.id = o.rider_id
          where ra.rider_id = $1
          order by ra.assigned_at desc
          limit 100`,
        [riderId],
      );
      const items = await tx.query(
        `select oi.* from public.order_items oi
           join public.rider_assignments ra on ra.order_id = oi.order_id
          where ra.rider_id = $1 order by oi.id`,
        [riderId],
      );
      const byOrder = new Map<string, any[]>();
      for (const item of items.rows) {
        const list = byOrder.get(item.order_id) ?? [];
        list.push(item);
        byOrder.set(item.order_id, list);
      }
      const totals = rows.reduce(
        (acc, r: any) => {
          acc.orders += 1;
          acc.collected += Number(r.amount_collected ?? 0);
          acc.due += Number(r.amount_due ?? 0);
          return acc;
        },
        { orders: 0, collected: 0, due: 0 },
      );
      return {
        items: rows.map((r: any) => ({
          ...mapOrder(r, byOrder.get(r.id) ?? []),
          assignment_status: r.assignment_status,
          amount_collected: money(Number(r.amount_collected ?? 0)),
          amount_due: money(Number(r.amount_due ?? 0)),
        })),
        totals: {
          orders: totals.orders,
          collected: money(totals.collected),
          due: money(totals.due),
        },
      };
    });
  }),
);
