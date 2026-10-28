import { Router } from 'express';
import {
  adEventSchema,
  campaignSchema,
  commissionRuleSchema,
  legalPageSchema,
  planSchema,
  riderSchema,
  storeReviewSchema,
  tariffSchema,
} from '@acoyaradas/shared';
import { z } from 'zod';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { requireAdmin } from '../http/context.js';
import { route, validate } from '../http/router.js';
import { badRequest, notFound } from '../lib/errors.js';
import { money } from '../lib/money.js';
import { toCsv } from '../lib/csv.js';
import { audit } from '../lib/audit.js';
import { insertNotificationsAs } from '../lib/notify.js';
import { notifyOrderStatusWhatsApp } from '../lib/whatsapp.js';
import { applyOrderStatus } from './orderStatus.js';
import { mapOrder, ORDER_SELECT } from './orders.js';
import { uuid } from '../lib/ids.js';
import { hashPassword } from '../auth/password.js';

/** Panel administrativo (Etapa 4). Exclusivo del administrador de acoYAradas!. */
export const adminRouter = Router();

async function run<T>(ctx: any, fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return ctx.db.transaction(async (tx: DbExecutor) => {
    await applyClaims(tx, ctx.claims);
    return fn(tx);
  });
}

function dateRange(req: any): { from: string; to: string } {
  const to = req.query?.to ? String(req.query.to) : new Date().toISOString();
  const from = req.query?.from
    ? String(req.query.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/dashboard',
  route(async (ctx) => {
    requireAdmin(ctx);
    const { from, to } = dateRange(ctx.req ?? { query: {} });
    return run(ctx, async (tx) => {
      const [sales, byStatus, stores, ads, subs, commissions, revenue, logistics, incidents] =
        await Promise.all([
          tx.query(
            `select count(*)::int as orders,
                    coalesce(sum(subtotal),0) as gross,
                    coalesce(sum(discount),0) as discounts,
                    coalesce(sum(shipping_cost),0) as shipping,
                    coalesce(sum(total),0) as total
               from public.orders
              where placed_at >= $1::timestamptz and placed_at <= $2::timestamptz`,
            [from, to],
          ),
          tx.query(
            'select status, count(*)::int as total from public.orders group by status',
          ),
          tx.query(
            `select count(*) filter (where status = 'active')::int as active,
                    count(*) filter (where status = 'pending')::int as pending,
                    count(*) filter (where status = 'suspended')::int as suspended
               from public.stores where deleted_at is null`,
          ),
          tx.query(
            `select count(*) filter (where status = 'active')::int as active,
                    count(*) filter (where status = 'active' and ends_at <= now() + interval '7 days')::int as expiring
               from public.ad_campaigns`,
          ),
          tx.query(
            `select count(*) filter (where status = 'active' and ends_at > now())::int as active,
                    count(*) filter (where status in ('expired','past_due') or (status = 'active' and ends_at <= now()))::int as expired
               from public.subscriptions`,
          ),
          tx.query(
            `select coalesce(sum(commission_amount) filter (where status = 'pending'),0) as pending,
                    coalesce(sum(commission_amount) filter (where status = 'settled'),0) as settled,
                    coalesce(sum(net_amount),0) as net
               from public.commissions`,
          ),
          tx.query(
            `select coalesce(sum(amount) filter (where kind = 'subscription' and status = 'confirmed'),0) as subscriptions,
                    coalesce(sum(amount) filter (where kind = 'advertising' and status = 'confirmed'),0) as advertising,
                    coalesce(sum(amount) filter (where kind = 'commission' and status = 'confirmed'),0) as commissions,
                    coalesce(sum(amount) filter (where status = 'pending'),0) as pending_amount
               from public.payments`,
          ),
          tx.query(
            `select coalesce(sum(ra.amount_due),0) as due_to_riders,
                    count(*)::int as deliveries,
                    coalesce(sum(o.shipping_cost) filter (where o.delivery_mode = 'platform'),0) as shipping_collected
               from public.rider_assignments ra
               left join public.orders o on o.id = ra.order_id`,
          ),
          tx.query(
            `select count(*) filter (where status = 'incident')::int as incidents,
                    count(*) filter (where status = 'cancelled')::int as cancelled
               from public.orders`,
          ),
        ]);

      const statusMap = Object.fromEntries(byStatus.rows.map((r: any) => [r.status, Number(r.total)]));
      const gross = money(Number(sales.rows[0].gross ?? 0));
      const commissionPending = money(Number(commissions.rows[0].pending ?? 0));

      return {
        period: { from, to },
        sales_period: {
          gross,
          orders: Number(sales.rows[0].orders ?? 0),
          discounts: money(Number(sales.rows[0].discounts ?? 0)),
          shipping: money(Number(sales.rows[0].shipping ?? 0)),
          total: money(Number(sales.rows[0].total ?? 0)),
          // Ingreso propio = comisión: el valor bruto de la venta NO es ingreso de la plataforma.
          commission: commissionPending,
          net_platform: money(
            Number(revenue.rows[0].subscriptions ?? 0) +
              Number(revenue.rows[0].advertising ?? 0) +
              commissionPending,
          ),
        },
        orders_by_status: statusMap,
        pending_acceptance: statusMap.pending_confirmation ?? 0,
        preparing: statusMap.preparing ?? 0,
        deliveries_pending:
          (statusMap.rider_assigned ?? 0) + (statusMap.on_the_way ?? 0) + (statusMap.ready ?? 0),
        stores_active: Number(stores.rows[0].active ?? 0),
        stores_pending: Number(stores.rows[0].pending ?? 0),
        stores_suspended: Number(stores.rows[0].suspended ?? 0),
        ads_active: Number(ads.rows[0].active ?? 0),
        ads_expiring: Number(ads.rows[0].expiring ?? 0),
        subscriptions_active: Number(subs.rows[0].active ?? 0),
        subscriptions_expired: Number(subs.rows[0].expired ?? 0),
        commissions: {
          pending: commissionPending,
          settled: money(Number(commissions.rows[0].settled ?? 0)),
        },
        revenue: {
          subscriptions: money(Number(revenue.rows[0].subscriptions ?? 0)),
          advertising: money(Number(revenue.rows[0].advertising ?? 0)),
          commissions: commissionPending,
          pending_amount: money(Number(revenue.rows[0].pending_amount ?? 0)),
        },
        logistics_expenses: money(Number(logistics.rows[0].due_to_riders ?? 0)),
        logistics: {
          deliveries: Number(logistics.rows[0].deliveries ?? 0),
          due_to_riders: money(Number(logistics.rows[0].due_to_riders ?? 0)),
          shipping_collected: money(Number(logistics.rows[0].shipping_collected ?? 0)),
        },
        incidents: Number(incidents.rows[0].incidents ?? 0),
        cancelled: Number(incidents.rows[0].cancelled ?? 0),
      };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Comercios                                                           */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/stores',
  route(async (ctx) => {
    requireAdmin(ctx);
    const status = typeof ctx.req.query.status === 'string' ? ctx.req.query.status : '';
    const search = typeof ctx.req.query.search === 'string' ? ctx.req.query.search : '';
    return run(ctx, async (tx) => {
      const params: unknown[] = [];
      const where: string[] = ['s.deleted_at is null'];
      if (status && status !== 'all') {
        params.push(status);
        where.push(`s.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where.push(`lower(s.name) like $${params.length}`);
      }
      const { rows } = await tx.query(
        `select s.*, c.name as category_name, p.email as owner_email, p.full_name as owner_name,
                (select count(*) from public.products pr where pr.store_id = s.id and pr.deleted_at is null) as products_count,
                (select count(*) from public.orders o2 where o2.store_id = s.id) as orders_count
           from public.stores s
           left join public.categories c on c.id = s.category_id
           left join public.profiles p on p.id = s.owner_id
          where ${where.join(' and ')}
          order by case s.status when 'pending' then 0 else 1 end, s.created_at desc
          limit 200`,
        params,
      );
      return { items: rows };
    });
  }),
);

adminRouter.patch(
  '/stores/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    const review = ctx.req.body?.review ? validate(storeReviewSchema, ctx.req.body.review) : null;
    const result = await run(ctx, async (tx) => {
      const current = await tx.query<any>('select * from public.stores where id = $1', [id]);
      if (!current.rows.length) throw notFound('El comercio no existe');
      const store = current.rows[0];

      const fields: string[] = [];
      const params: unknown[] = [id];
      const allowed = [
        'name',
        'description',
        'logo_url',
        'cover_url',
        'phone',
        'whatsapp',
        'email',
        'address',
        'locality',
        'category_id',
        'is_open',
        'featured',
        'preparation_time_minutes',
        'allows_platform_delivery',
        'allows_pickup',
        'merchant_delivery_fee',
        'merchant_delivery_notes',
        'accepts_cash',
        'accepts_transfer',
        'accepts_terms',
        'verified',
      ];
      for (const key of allowed) {
        const value = ctx.req.body?.[key];
        if (value !== undefined) {
          params.push(value === '' ? null : value);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (review) {
        params.push(review.status);
        fields.push(`status = $${params.length}`);
        fields.push(`verified = ${review.status === 'active' ? 'true' : 'verified'}`);
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      params.push(new Date().toISOString());
      fields.push(`updated_at = $${params.length}`);
      await tx.query(`update public.stores set ${fields.join(', ')} where id = $1`, params);

      if (review && review.status === 'active') {
        // Plan gratuito por defecto al aprobar el comercio
        const free = await tx.query<{ id: string }>(
          `select id from public.plans where code = 'free' and active = true limit 1`,
        );
        if (free.rows.length) {
          const existing = await tx.query(
            `select 1 from public.subscriptions where store_id = $1 and status = 'active' and ends_at > now() limit 1`,
            [id],
          );
          if (!existing.rows.length) {
            await tx.query(
              `insert into public.subscriptions (store_id, plan_id, status, starts_at, ends_at, notes)
               values ($1,$2,'active', now(), now() + interval '1 month', 'Plan gratuito de bienvenida')`,
              [id, free.rows[0].id],
            );
          }
        }
      }

      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: review ? `store_${review.status}` : 'store_updated',
        entityType: 'store',
        entityId: id,
        metadata: { note: review?.note ?? null },
        ip: ctx.ip,
      });

      // Aviso al comercio (fuera de la transacción: las notificaciones se
      // escriben con los claims del destinatario en su propia transacción).
      return {
        store: (await tx.query('select * from public.stores where id = $1', [id])).rows[0],
        ownerId: store.owner_id as string | null,
      };
    });

    if (review && result.ownerId) {
      await insertNotificationsAs(ctx.db, { sub: result.ownerId, role: 'store_owner' }, [
        {
          store_id: id,
          channel: 'in_app',
          template: `store_${review.status}`,
          payload: { note: review.note ?? null },
        },
      ]);
    }
    return result.store;
  }),
);

adminRouter.delete(
  '/stores/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const store = await tx.query<any>('select * from public.stores where id = $1', [id]);
      if (!store.rows.length) throw notFound('El comercio no existe');
      await tx.query('update public.stores set deleted_at = now(), status = $2, updated_at = now() where id = $1', [
        id,
        'suspended',
      ]);
      await tx.query('update public.products set deleted_at = now(), is_available = false where store_id = $1', [id]);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'store_deleted',
        entityType: 'store',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/orders',
  route(async (ctx) => {
    requireAdmin(ctx);
    const q = ctx.req.query;
    return run(ctx, async (tx) => {
      const params: unknown[] = [];
      const where: string[] = ['true'];
      if (q.status && q.status !== 'all') {
        params.push(String(q.status));
        where.push(`o.status = $${params.length}`);
      }
      if (q.store_id) {
        params.push(String(q.store_id));
        where.push(`o.store_id = $${params.length}`);
      }
      if (q.rider_id) {
        params.push(String(q.rider_id));
        where.push(`o.rider_id = $${params.length}`);
      }
      if (q.mode) {
        params.push(String(q.mode));
        where.push(`o.delivery_mode = $${params.length}`);
      }
      if (q.from) {
        params.push(String(q.from));
        where.push(`o.placed_at >= $${params.length}::timestamptz`);
      }
      if (q.to) {
        params.push(String(q.to));
        where.push(`o.placed_at <= $${params.length}::timestamptz`);
      }
      const { rows } = await tx.query(
        `select ${ORDER_SELECT} from public.orders o
           join public.stores s on s.id = o.store_id
           left join public.riders r on r.id = o.rider_id
          where ${where.join(' and ')}
          order by o.placed_at desc limit 300`,
        params,
      );
      const items = await tx.query(
        'select * from public.order_items order by order_id, id limit 2000',
      );
      const byOrder = new Map<string, any[]>();
      for (const item of items.rows) {
        const list = byOrder.get(item.order_id) ?? [];
        list.push(item);
        byOrder.set(item.order_id, list);
      }
      return { items: rows.map((r: any) => mapOrder(r, byOrder.get(r.id) ?? [])) };
    });
  }),
);

adminRouter.patch(
  '/orders/:id/status',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const status = String(ctx.req.body?.status ?? '');
    const note = String(ctx.req.body?.note ?? '').slice(0, 1000);
    const result = await run(ctx, async (tx) => {
      const order = await tx.query<{ id: string; customer_id: string | null }>(
        'select id, customer_id from public.orders where id = $1',
        [String(ctx.req.params.id)],
      );
      if (!order.rows.length) throw notFound('El pedido no existe');
      await applyOrderStatus(tx, {
        orderId: String(ctx.req.params.id),
        status: status as any,
        note,
        actorId: admin.id,
        actorName: admin.full_name ?? admin.email,
        actorRole: 'admin',
      });
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: `order_${status}`,
        entityType: 'order',
        entityId: String(ctx.req.params.id),
        ip: ctx.ip,
      });
      return { ok: true, status, customerId: order.rows[0].customer_id };
    });
    try {
      await notifyOrderStatusWhatsApp(ctx.db, String(ctx.req.params.id), {
        recipients: ['customer'],
        statusNote: note || null,
      });
    } catch {
      // El cambio de estado no se bloquea si WhatsApp falla
    }
    return result;
  }),
);

/** Elimina (cancela) un pedido desde el panel de administración. */
adminRouter.delete(
  '/orders/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    const reason = String(ctx.req.body?.reason ?? '').slice(0, 500) || 'Cancelado por administración';
    const result = await run(ctx, async (tx) => {
      const current = await tx.query<{ id: string; status: string; customer_id: string | null }>(
        'select id, status, customer_id from public.orders where id = $1',
        [id],
      );
      if (!current.rows.length) throw notFound('El pedido no existe');
      if (current.rows[0].status === 'cancelled') return { already: true, customerId: current.rows[0].customer_id };
      await applyOrderStatus(tx, {
        orderId: id,
        status: 'cancelled',
        note: reason,
        cancelReason: reason,
        actorId: admin.id,
        actorName: admin.full_name ?? admin.email,
        actorRole: 'admin',
      });
      const items = await tx.query<{ product_id: string; quantity: number }>(
        'select product_id, quantity from public.order_items where order_id = $1',
        [id],
      );
      for (const item of items.rows) {
        await tx.query('select public.restore_stock($1, $2, $3)', [
          item.product_id,
          Number(item.quantity),
          id,
        ]);
      }
      await tx.query(`update public.commissions set status = 'waived', updated_at = now() where order_id = $1`, [id]);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'order_deleted',
        entityType: 'order',
        entityId: id,
        metadata: { reason },
        ip: ctx.ip,
      });
      return { already: false, customerId: current.rows[0].customer_id };
    });
    if (result.customerId) {
      await insertNotificationsAs(ctx.db, { sub: result.customerId, role: 'customer' }, [
        {
          user_id: result.customerId,
          order_id: id,
          channel: 'in_app',
          template: 'order_cancelled',
          payload: { status: 'cancelled', reason },
        },
      ]);
    }
    try {
      await notifyOrderStatusWhatsApp(ctx.db, id, { recipients: ['customer'], statusNote: reason });
    } catch {
      // WhatsApp no bloquea la cancelación
    }
    return { ok: true, cancelled: !result.already };
  }),
);

/** Asigna un repartidor (modalidad A: entrega organizada por acoYAradas!). */
adminRouter.post(
  '/orders/:id/assign',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const riderId = String(ctx.req.body?.rider_id ?? '');
    const orderId = String(ctx.req.params.id);
    if (!riderId) throw badRequest('Indicá el repartidor');
    const result = await run(ctx, async (tx) => {
      const order = await tx.query<any>('select * from public.orders where id = $1', [
        String(ctx.req.params.id),
      ]);
      if (!order.rows.length) throw notFound('El pedido no existe');
      if (order.rows[0].delivery_mode !== 'platform') {
        throw badRequest('Este pedido se gestiona con entrega propia del comercio');
      }
      const rider = await tx.query<any>('select * from public.riders where id = $1', [riderId]);
      if (!rider.rows.length || !rider.rows[0].active) {
        throw badRequest('El repartidor no está disponible');
      }

      const existing = await tx.query(
        'select id from public.rider_assignments where order_id = $1 and status in ($2,$3)',
        [String(ctx.req.params.id), 'assigned', 'picked_up'],
      );
      if (existing.rows.length) {
        await tx.query(
          `update public.rider_assignments set rider_id = $2, assigned_by = $3, status = 'assigned', notes = 'Reasignado'
            where id = $1`,
          [existing.rows[0].id, riderId, admin.id],
        );
      } else {
        await tx.query(
          `insert into public.rider_assignments (order_id, rider_id, assigned_by, status, amount_due)
           values ($1,$2,$3,'assigned',$4)`,
          [String(ctx.req.params.id), riderId, admin.id, Number(order.rows[0].shipping_cost ?? 0)],
        );
      }

      await applyOrderStatus(tx, {
        orderId: String(ctx.req.params.id),
        status: 'rider_assigned',
        note: `Repartidor asignado: ${rider.rows[0].full_name}`,
        riderId,
        actorId: admin.id,
        actorName: admin.full_name ?? admin.email,
        actorRole: 'admin',
      });

      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'order_assigned',
        entityType: 'order',
        entityId: String(ctx.req.params.id),
        metadata: { rider_id: riderId },
        ip: ctx.ip,
      });
      return { ok: true, rider_id: riderId, rider_phone: rider.rows[0].phone ?? null, rider_name: rider.rows[0].full_name };
    });

    // WhatsApp: el repartidor recibe el pedido completo y el cliente el aviso.
    try {
      await notifyOrderStatusWhatsApp(ctx.db, orderId, {
        recipients: ['rider', 'customer'],
        statusNote: `Repartidor asignado: ${result.rider_name}`,
      });
    } catch {
      // La asignación no se bloquea si WhatsApp falla
    }
    return { ok: true, rider_id: result.rider_id, rider_phone: result.rider_phone };
  }),
);

/* ------------------------------------------------------------------ */
/* Repartidores                                                        */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/riders',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select r.*, p.email as email, p.full_name as full_name,
                (select count(*) from public.rider_assignments ra where ra.rider_id = r.id) as assignments,
                (select count(*) from public.rider_assignments ra where ra.rider_id = r.id and ra.status = 'delivered') as delivered,
                (select coalesce(sum(ra.amount_due),0) from public.rider_assignments ra where ra.rider_id = r.id) as amount_due
           from public.riders r left join public.profiles p on p.id = r.user_id
          where r.deleted_at is null
          order by r.created_at desc`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/riders',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const input = validate(riderSchema, req.body);
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.riders (full_name, phone, vehicle_type, zones, active, available)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [
          input.full_name,
          input.phone,
          input.vehicle_type || null,
          input.zones ?? [],
          input.active ?? true,
          input.available ?? true,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'rider_created',
        entityType: 'rider',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/riders/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const input = validate(riderSchema.partial(), req.body);
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      const map: Record<string, string> = {
        full_name: 'full_name',
        phone: 'phone',
        vehicle_type: 'vehicle_type',
        active: 'active',
        available: 'available',
      };
      for (const [key, column] of Object.entries(map)) {
        const value = (input as any)[key];
        if (value !== undefined) {
          params.push(value === '' ? null : value);
          fields.push(`${column} = $${params.length}`);
        }
      }
      if (input.zones !== undefined) {
        params.push(input.zones);
        fields.push(`zones = $${params.length}`);
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.riders set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'rider_updated',
        entityType: 'rider',
        entityId: String(ctx.req.params.id),
        ip: ctx.ip,
      });
      return (await tx.query('select * from public.riders where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

/** Baja lógica de un repartidor (conserva asignaciones e historial). */
adminRouter.delete(
  '/riders/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const rider = await tx.query('select id, full_name from public.riders where id = $1 and deleted_at is null', [id]);
      if (!rider.rows.length) throw notFound('El repartidor no existe');
      await tx.query(
        `update public.riders set deleted_at = now(), active = false, available = false, updated_at = now() where id = $1`,
        [id],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'rider_deleted',
        entityType: 'rider',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Categorías                                                          */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/categories',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select c.*, (select count(*) from public.stores s where s.category_id = c.id) as stores_count,
                (select count(*) from public.products p where p.category_id = c.id) as products_count
           from public.categories c order by c.sort_order, c.name`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/categories',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const name = String(ctx.req.body?.name ?? '').trim();
    if (name.length < 2) throw badRequest('Ingresá el nombre de la categoría');
    return run(ctx, async (tx) => {
      const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const inserted = await tx.query(
        `insert into public.categories (name, slug, icon_url, sort_order, active)
         values ($1,$2,$3,$4,$5) returning *`,
        [
          name,
          slug,
          ctx.req.body?.icon_url ?? null,
          Number(ctx.req.body?.sort_order ?? 0),
          ctx.req.body?.active ?? true,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'category_created',
        entityType: 'category',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/categories/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['name', 'icon_url', 'sort_order', 'active']) {
        if (body[key] !== undefined) {
          params.push(body[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.categories set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.categories where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/categories/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      await tx.query('update public.categories set active = false where id = $1', [String(ctx.req.params.id)]);
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Banners y publicidad                                                */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/banners',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select b.*, c.store_id, c.status as campaign_status
           from public.banners b left join public.ad_campaigns c on c.banner_id = b.id
          order by b.sort_order, b.created_at desc`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/banners',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.banners (title, subtitle, image_url, link_url, placement, sort_order, active, starts_at, ends_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [
          body.title ?? 'Banner',
          body.subtitle ?? null,
          body.image_url ?? null,
          body.link_url ?? null,
          body.placement ?? 'home_banner',
          Number(body.sort_order ?? 0),
          body.active ?? true,
          body.starts_at ?? null,
          body.ends_at ?? null,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'banner_created',
        entityType: 'banner',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/banners/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['title', 'subtitle', 'image_url', 'link_url', 'placement', 'sort_order', 'active', 'starts_at', 'ends_at']) {
        if (body[key] !== undefined) {
          params.push(body[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.banners set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.banners where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/banners/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const banner = await tx.query('select id from public.banners where id = $1', [id]);
      if (!banner.rows.length) throw notFound('El banner no existe');
      await tx.query('delete from public.banners where id = $1', [id]);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'banner_deleted',
        entityType: 'banner',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

adminRouter.get(
  '/campaigns',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select c.*, s.name as store_name, s.slug as store_slug, p.name as placement_name, p.price_per_day
           from public.ad_campaigns c
           join public.stores s on s.id = c.store_id
           left join public.ad_placements p on p.key = c.placement::text
          order by c.created_at desc`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.patch(
  '/campaigns/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const body = validate(campaignSchema.partial(), ctx.req.body ?? {});
    const status = body.status ? String(body.status) : null;
    return run(ctx, async (tx) => {
      const campaign = await tx.query<any>('select * from public.ad_campaigns where id = $1', [
        String(ctx.req.params.id),
      ]);
      if (!campaign.rows.length) throw notFound('La campaña no existe');
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      if (status) {
        params.push(status);
        fields.push(`status = $${params.length}`);
      }
      if (body.review_note !== undefined) {
        params.push(body.review_note);
        fields.push(`review_note = $${params.length}`);
      }
      for (const key of ['title', 'body', 'image_url', 'link_url', 'starts_at', 'ends_at', 'price']) {
        const value = (body as Record<string, unknown>)[key];
        if (value !== undefined) {
          params.push(value);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.ad_campaigns set ${fields.join(', ')}, updated_at = now() where id = $1`, params);

      // Banner asociado para la home (cuando la campaña se aprueba)
      if (status === 'active' && campaign.rows[0].placement === 'home_banner') {
        const existing = await tx.query('select id from public.banners where id is not null limit 0');
        void existing;
        const banner = await tx.query(
          `insert into public.banners (title, subtitle, image_url, link_url, placement, active, starts_at, ends_at)
           values ($1,$2,$3,$4,'home_banner', true, $5, $6) returning id`,
          [
            campaign.rows[0].title,
            campaign.rows[0].body,
            campaign.rows[0].image_url,
            campaign.rows[0].link_url,
            campaign.rows[0].starts_at,
            campaign.rows[0].ends_at,
          ],
        );
        await tx.query('update public.ad_campaigns set banner_id = $2 where id = $1', [
          String(ctx.req.params.id),
          banner.rows[0].id,
        ]);
      }
      if ((status === 'paused' || status === 'rejected' || status === 'finished') && campaign.rows[0].banner_id) {
        await tx.query('update public.banners set active = false where id = $1', [campaign.rows[0].banner_id]);
      }

      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: `campaign_${status ?? 'updated'}`,
        entityType: 'campaign',
        entityId: String(ctx.req.params.id),
        ip: ctx.ip,
      });
      return (await tx.query('select * from public.ad_campaigns where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/campaigns/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const campaign = await tx.query<{ id: string; banner_id: string | null }>(
        'select id, banner_id from public.ad_campaigns where id = $1',
        [id],
      );
      if (!campaign.rows.length) throw notFound('La campaña no existe');
      const bannerId = campaign.rows[0].banner_id;
      if (bannerId) await tx.query('delete from public.banners where id = $1', [bannerId]);
      await tx.query('delete from public.ad_campaigns where id = $1', [id]);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'campaign_deleted',
        entityType: 'campaign',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

adminRouter.get(
  '/ad-events',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select e.*, c.title as campaign_title, c.store_id
           from public.ad_events e join public.ad_campaigns c on c.id = e.campaign_id
          order by e.created_at desc limit 200`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/ad-events',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const input = validate(adEventSchema, ctx.req.body);
    return run(ctx, async (tx) => {
      const campaign = await tx.query('select id from public.ad_campaigns where id = $1', [input.campaign_id]);
      if (!campaign.rows.length) throw notFound('La campaña no existe');
      await tx.query('select public.register_ad_event($1,$2,$3)', [input.campaign_id, input.type, admin.id]);
      const updated = await tx.query('select impressions, clicks from public.ad_campaigns where id = $1', [
        input.campaign_id,
      ]);
      return { ok: true, ...updated.rows[0] };
    });
  }),
);

adminRouter.get(
  '/ad-placements',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query('select * from public.ad_placements where deleted_at is null order by name');
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/ad-placements',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.ad_placements (key, name, description, price_per_day, active)
         values ($1,$2,$3,$4,$5) returning *`,
        [
          String(body.key ?? '').trim(),
          body.name ?? '',
          body.description ?? null,
          Number(body.price_per_day ?? 0),
          body.active ?? true,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'ad_placement_created',
        entityType: 'ad_placement',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/ad-placements/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['name', 'description', 'price_per_day', 'active']) {
        if (body[key] !== undefined) {
          params.push(body[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.ad_placements set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.ad_placements where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/ad-placements/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const placement = await tx.query('select id from public.ad_placements where id = $1 and deleted_at is null', [id]);
      if (!placement.rows.length) throw notFound('El espacio publicitario no existe');
      await tx.query(
        'update public.ad_placements set deleted_at = now(), active = false, updated_at = now() where id = $1',
        [id],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'ad_placement_deleted',
        entityType: 'ad_placement',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Planes, suscripciones y pagos                                        */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/plans',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query('select * from public.plans where deleted_at is null order by price');
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/plans',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const input = validate(planSchema, ctx.req.body);
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.plans (name, code, price, billing_period, product_limit, promo_limit, features, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [
          input.name,
          input.code,
          input.price,
          input.billing_period,
          input.product_limit,
          input.promo_limit,
          input.features ?? [],
          input.active ?? true,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'plan_created',
        entityType: 'plan',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/plans/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const input = validate(planSchema.partial(), ctx.req.body);
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['name', 'price', 'billing_period', 'product_limit', 'promo_limit', 'active']) {
        if ((input as any)[key] !== undefined) {
          params.push((input as any)[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (input.features !== undefined) {
        params.push(input.features);
        fields.push(`features = $${params.length}`);
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.plans set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.plans where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/plans/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const plan = await tx.query<any>('select id, code from public.plans where id = $1 and deleted_at is null', [id]);
      if (!plan.rows.length) throw notFound('El plan no existe');
      if (plan.rows[0].code === 'free') throw badRequest('El plan gratuito no se puede eliminar');
      const subs = await tx.query(
        `select 1 from public.subscriptions where plan_id = $1 and status = 'active' and ends_at > now() limit 1`,
        [id],
      );
      if (subs.rows.length) {
        throw badRequest('El plan tiene suscripciones activas: cambialas de plan antes de eliminarlo');
      }
      await tx.query('update public.plans set deleted_at = now(), active = false, updated_at = now() where id = $1', [id]);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'plan_deleted',
        entityType: 'plan',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

adminRouter.get(
  '/subscriptions',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select s.*, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                st.name as store_name, st.slug as store_slug
           from public.subscriptions s
           join public.plans p on p.id = s.plan_id
           join public.stores st on st.id = s.store_id
          order by s.created_at desc`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/subscriptions',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const storeId = String(ctx.req.body?.store_id ?? '');
    const planId = String(ctx.req.body?.plan_id ?? '');
    const months = Number(ctx.req.body?.months ?? 1);
    if (!storeId || !planId) throw badRequest('Indicá comercio y plan');
    return run(ctx, async (tx) => {
      const plan = await tx.query<any>('select * from public.plans where id = $1', [planId]);
      if (!plan.rows.length) throw notFound('El plan no existe');
      const period = plan.rows[0].billing_period === 'yearly' ? '1 year' : `${months} month`;
      const inserted = await tx.query(
        `insert into public.subscriptions (store_id, plan_id, status, starts_at, ends_at, notes)
         values ($1,$2,'active', now(), now() + $3::interval, $4) returning *`,
        [storeId, planId, period, ctx.req.body?.notes ?? null],
      );
      // Registro de pago pendiente: NO es un cobro confirmado.
      const payment = await tx.query(
        `insert into public.payments (store_id, subscription_id, kind, amount, status, due_at, notes)
         values ($1,$2,'subscription',$3,'pending', now() + $4::interval, $5) returning *`,
        [storeId, inserted.rows[0].id, Number(plan.rows[0].price), period, 'Abono mensual (pendiente de confirmación)'],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'subscription_created',
        entityType: 'subscription',
        entityId: inserted.rows[0].id,
        metadata: { store_id: storeId, plan_id: planId },
        ip: ctx.ip,
      });
      return { subscription: inserted.rows[0], payment: payment.rows[0] };
    });
  }),
);

adminRouter.get(
  '/payments',
  route(async (ctx) => {
    requireAdmin(ctx);
    const status = typeof ctx.req.query.status === 'string' ? ctx.req.query.status : '';
    return run(ctx, async (tx) => {
      const params: unknown[] = [];
      let where = 'true';
      if (status && status !== 'all') {
        params.push(status);
        where = `p.status = $${params.length}`;
      }
      const { rows } = await tx.query(
        `select p.*, s.name as store_name, o.code as order_code
           from public.payments p
           left join public.stores s on s.id = p.store_id
           left join public.orders o on o.id = p.order_id
          where ${where}
          order by p.created_at desc limit 300`,
        params,
      );
      return { items: rows };
    });
  }),
);

adminRouter.patch(
  '/payments/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    const status = body.status ? String(body.status) : null;
    return run(ctx, async (tx) => {
      const payment = await tx.query<any>('select * from public.payments where id = $1', [
        String(ctx.req.params.id),
      ]);
      if (!payment.rows.length) throw notFound('El pago no existe');
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      if (status) {
        params.push(status);
        fields.push(`status = $${params.length}`);
        if (status === 'confirmed') {
          fields.push('confirmed_at = now()');
          fields.push(`confirmed_by = $${params.length + 1}`);
          params.push(admin.id);
          fields.push('paid_at = now()');
        }
      }
      if (body.method !== undefined) {
        params.push(body.method);
        fields.push(`method = $${params.length}`);
      }
      if (body.notes !== undefined) {
        params.push(body.notes);
        fields.push(`notes = $${params.length}`);
      }
      if (body.external_ref !== undefined) {
        params.push(body.external_ref);
        fields.push(`external_ref = $${params.length}`);
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.payments set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: `payment_${status ?? 'updated'}`,
        entityType: 'payment',
        entityId: String(ctx.req.params.id),
        ip: ctx.ip,
      });
      return (await tx.query('select * from public.payments where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Comisiones, tarifas y zonas                                          */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/commissions',
  route(async (ctx) => {
    requireAdmin(ctx);
    const q = ctx.req.query;
    return run(ctx, async (tx) => {
      const params: unknown[] = [];
      let where = 'true';
      if (q.status && q.status !== 'all') {
        params.push(String(q.status));
        where = `c.status = $${params.length}`;
      }
      if (q.store_id) {
        params.push(String(q.store_id));
        where += ` and c.store_id = $${params.length}`;
      }
      const { rows } = await tx.query(
        `select c.*, o.code as order_code, o.status as order_status, s.name as store_name, s.slug as store_slug
           from public.commissions c
           join public.orders o on o.id = c.order_id
           join public.stores s on s.id = c.store_id
          where ${where}
          order by c.created_at desc limit 300`,
        params,
      );
      return { items: rows };
    });
  }),
);

/** Liquida (settled) o condona (waived) una comisión. */
adminRouter.patch(
  '/commissions/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const status = String(ctx.req.body?.status ?? '');
    if (!['pending', 'settled', 'waived'].includes(status)) {
      throw badRequest('Estado de comisión inválido');
    }
    return run(ctx, async (tx) => {
      const current = await tx.query<any>('select * from public.commissions where id = $1', [
        String(ctx.req.params.id),
      ]);
      if (!current.rows.length) throw notFound('La comisión no existe');
      await tx.query(
        'update public.commissions set status = $2, updated_at = now() where id = $1',
        [String(ctx.req.params.id), status],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: `commission_${status}`,
        entityType: 'commission',
        entityId: String(ctx.req.params.id),
        metadata: { order_id: current.rows[0].order_id, amount: current.rows[0].commission_amount },
        ip: ctx.ip,
      });
      return (await tx.query('select * from public.commissions where id = $1', [
        String(ctx.req.params.id),
      ])).rows[0];
    });
  }),
);

adminRouter.get(
  '/commission-rules',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select cr.*, s.name as store_name from public.commission_rules cr
           left join public.stores s on s.id = cr.store_id
          where cr.deleted_at is null
          order by cr.store_id nulls last`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/commission-rules',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const input = validate(commissionRuleSchema, ctx.req.body);
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.commission_rules (store_id, type, value, basis, active)
         values ($1,$2,$3,$4,$5) returning *`,
        [input.store_id ?? null, input.type, input.value, input.basis, input.active ?? true],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'commission_rule_created',
        entityType: 'commission_rule',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/commission-rules/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const input = validate(commissionRuleSchema.partial(), ctx.req.body);
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['store_id', 'type', 'value', 'basis', 'active']) {
        if ((input as any)[key] !== undefined) {
          params.push((input as any)[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.commission_rules set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.commission_rules where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/commission-rules/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const rule = await tx.query('select id from public.commission_rules where id = $1 and deleted_at is null', [id]);
      if (!rule.rows.length) throw notFound('La regla de comisión no existe');
      await tx.query(
        'update public.commission_rules set deleted_at = now(), active = false, updated_at = now() where id = $1',
        [id],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'commission_rule_deleted',
        entityType: 'commission_rule',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

adminRouter.get(
  '/tariffs',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select t.*, z.name as zone_name, s.name as store_name
           from public.shipping_tariffs t
           left join public.coverage_zones z on z.id = t.zone_id
           left join public.stores s on s.id = t.store_id
          where t.deleted_at is null
          order by t.name`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/tariffs',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const input = validate(tariffSchema, ctx.req.body);
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.shipping_tariffs
           (name, zone_id, store_id, mode, base_price, price_per_km, min_price, max_price, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [
          input.name,
          input.zone_id ?? null,
          input.store_id ?? null,
          input.mode,
          input.base_price ?? 0,
          input.price_per_km ?? 0,
          input.min_price ?? null,
          input.max_price ?? null,
          input.active ?? true,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'tariff_created',
        entityType: 'tariff',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/tariffs/:id',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const input = validate(tariffSchema.partial(), ctx.req.body);
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['name', 'zone_id', 'store_id', 'mode', 'base_price', 'price_per_km', 'min_price', 'max_price', 'active']) {
        if ((input as any)[key] !== undefined) {
          params.push((input as any)[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.shipping_tariffs set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.shipping_tariffs where id = $1', [String(ctx.req.params.id)])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/tariffs/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const tariff = await tx.query('select id from public.shipping_tariffs where id = $1 and deleted_at is null', [id]);
      if (!tariff.rows.length) throw notFound('La tarifa no existe');
      await tx.query(
        'update public.shipping_tariffs set deleted_at = now(), active = false, updated_at = now() where id = $1',
        [id],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'tariff_deleted',
        entityType: 'tariff',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

adminRouter.get(
  '/zones',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select z.*, (select count(*) from public.stores s where s.zone_id = z.id) as stores_count
           from public.coverage_zones z where z.deleted_at is null order by z.name`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/zones',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.coverage_zones (name, code, description, active)
         values ($1,$2,$3,$4) returning *`,
        [
          body.name ?? '',
          String(body.code ?? '').trim() || String(body.name ?? '').toLowerCase().replace(/\s+/g, '-'),
          body.description ?? null,
          body.active ?? true,
        ],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'zone_created',
        entityType: 'zone',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.patch(
  '/zones/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const body = ctx.req.body ?? {};
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [String(ctx.req.params.id)];
      for (const key of ['name', 'code', 'description', 'active']) {
        if (body[key] !== undefined) {
          params.push(body[key]);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.coverage_zones set ${fields.join(', ')} where id = $1`, params);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'zone_updated',
        entityType: 'zone',
        entityId: String(ctx.req.params.id),
        ip: ctx.ip,
      });
      return (await tx.query('select * from public.coverage_zones where id = $1', [
        String(ctx.req.params.id),
      ])).rows[0];
    });
  }),
);

adminRouter.delete(
  '/zones/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    return run(ctx, async (tx) => {
      const zone = await tx.query('select id from public.coverage_zones where id = $1 and deleted_at is null', [id]);
      if (!zone.rows.length) throw notFound('La zona no existe');
      await tx.query(
        'update public.coverage_zones set deleted_at = now(), active = false where id = $1',
        [id],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'zone_deleted',
        entityType: 'zone',
        entityId: id,
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Usuarios, auditoría, configuración y páginas legales                 */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/users',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select p.id, p.email, p.full_name, p.phone, p.role, p.created_at,
                (select count(*) from public.stores s where s.owner_id = p.id and s.deleted_at is null) as stores_count
           from public.profiles p where p.deleted_at is null order by p.created_at desc limit 300`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.patch(
  '/users/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    const role = String(ctx.req.body?.role ?? '');
    if (id === admin.id) throw badRequest('No podés cambiar tu propio rol');
    if (!['admin', 'store_owner', 'store_staff', 'courier', 'customer'].includes(role)) {
      throw badRequest('Rol inválido');
    }
    return run(ctx, async (tx) => {
      await tx.query('update public.profiles set role = $2, updated_at = now() where id = $1', [id, role]);
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'user_role_changed',
        entityType: 'profile',
        entityId: id,
        metadata: { role },
        ip: ctx.ip,
      });
      return (await tx.query('select id, email, full_name, phone, role from public.profiles where id = $1', [id])).rows[0];
    });
  }),
);

/** Admin crea usuario (permite dominio @acoyaradas.app para pruebas de comercios). */
adminRouter.post(
  '/users',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const { email, password, full_name, phone, role = 'customer' } = ctx.req.body ?? {};
    if (!email || !password || !full_name) throw badRequest('Faltan datos obligatorios');
    if (!['admin', 'store_owner', 'store_staff', 'courier', 'customer'].includes(role)) {
      throw badRequest('Rol inválido');
    }
    // Validación de email: admite @acoyaradas.app solo para admins creando usuarios de prueba
    const isTestDomain = email.endsWith('@acoyaradas.app');
    if (isTestDomain && ctx.claims.role !== 'admin') {
      throw badRequest('Solo administradores pueden usar el dominio de pruebas');
    }

    const userId = uuid();
    const passwordHash = await hashPassword(password);

    return run(ctx, async (tx) => {
      // Crear usuario via auth local (bypass Supabase domain restrictions)
      await tx.query(
        `insert into public.local_users (id, email, password_hash, role) values ($1,$2,$3,'customer')`,
        [userId, email.toLowerCase(), passwordHash],
      );
      await tx.query(
        `insert into public.profiles (id, email, full_name, phone, role) values ($1,$2,$3,$4,$5)`,
        [userId, email.toLowerCase(), full_name, phone?.trim() || null, role],
      );

      // Si el rol es store_owner, crear un comercio asociado automáticamente
      let storeId: string | null = null;
      if (role === 'store_owner') {
        storeId = uuid();
        // Generar slug único basado en el nombre
        const baseSlug = full_name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 50);
        const slug = `${baseSlug}-${storeId.slice(0, 8)}`;

        await tx.query(
          `insert into public.stores (id, owner_id, name, slug, phone, email, address, status, accepts_terms, open_hours)
           values ($1,$2,$3,$4,$5,$6,$7,'active',true,'{}'::jsonb)`,
          [
            storeId,
            userId,
            full_name,
            slug,
            phone?.trim() || null,
            email.toLowerCase(),
            phone?.trim() || null, // usamos phone como address inicial si no hay otro dato
          ],
        );

        // Agregar al owner como miembro del comercio
        await tx.query(
          `insert into public.store_members (store_id, user_id, role) values ($1,$2,'store_owner')`,
          [storeId, userId],
        );
      }

      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'user_created',
        entityType: 'profile',
        entityId: userId,
        metadata: { email, role, testDomain: isTestDomain, storeId },
        ip: ctx.ip,
      });
      return { id: userId, email, full_name, role, storeId };
    });
  }),
);

adminRouter.delete(
  '/users/:id',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const id = String(ctx.req.params.id);
    if (id === admin.id) throw badRequest('No podés eliminar tu propia cuenta');
    return run(ctx, async (tx) => {
      const user = await tx.query<any>('select id, email, role from public.profiles where id = $1', [id]);
      if (!user.rows.length) throw notFound('El usuario no existe');

      // Verificar comercios activos (no eliminados)
      const activeStores = await tx.query(
        'select 1 from public.stores where owner_id = $1 and deleted_at is null limit 1',
        [id],
      );
      if (activeStores.rows.length) {
        throw badRequest('El usuario es dueño de un comercio activo: primero dá de baja el comercio');
      }

      // Eliminar comercios del usuario (incluyendo los soft-deleted) para liberar FK
      await tx.query('delete from public.stores where owner_id = $1', [id]);

      // Eliminar membresías de comercios
      await tx.query('delete from public.store_members where user_id = $1', [id]);

      // Eliminar perfil (hard delete - libera el email en el índice único)
      await tx.query('delete from public.profiles where id = $1', [id]);

      // Eliminar rider si existe
      await tx.query('delete from public.riders where user_id = $1', [id]);

      // Eliminar usuario de auth local
      await tx.query('delete from public.local_users where id = $1', [id]);

      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'user_deleted',
        entityType: 'profile',
        entityId: id,
        metadata: { email: user.rows[0].email, role: user.rows[0].role },
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

adminRouter.get(
  '/audit',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select * from public.audit_log order by created_at desc limit 300`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.get(
  '/settings',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query('select key, value, updated_at from public.settings order by key');
      return { items: rows };
    });
  }),
);

adminRouter.patch(
  '/settings/:key',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const key = String(ctx.req.params.key);
    const value = ctx.req.body?.value;
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.settings (key, value) values ($1,$2::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()
         returning *`,
        [key, JSON.stringify(value ?? {})],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'settings_updated',
        entityType: 'settings',
        entityId: key,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

adminRouter.get(
  '/legal-pages',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query('select * from public.legal_pages order by title');
      return { items: rows };
    });
  }),
);

adminRouter.patch(
  '/legal-pages/:slug',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const slug = String(ctx.req.params.slug);
    const input = validate(legalPageSchema, ctx.req.body);
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.legal_pages (slug, title, body) values ($1,$2,$3)
         on conflict (slug) do update set title = excluded.title, body = excluded.body, updated_at = now()
         returning *`,
        [slug, input.title, input.body],
      );
      await audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        action: 'legal_page_updated',
        entityType: 'legal_page',
        entityId: slug,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Reportes CSV                                                        */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/reports/:kind.csv',
  route(async (ctx) => {
    requireAdmin(ctx);
    const kind = String(ctx.req.params.kind).replace(/\.csv$/, '');
    const { from, to } = dateRange(ctx.req);
    const rows = await ctx.db.system.query<any>(
      `select ${ORDER_SELECT} from public.orders o
         join public.stores s on s.id = o.store_id
         left join public.riders r on r.id = o.rider_id
        where o.placed_at >= $1::timestamptz and o.placed_at <= $2::timestamptz
        order by o.placed_at desc`,
      [from, to],
    );

    if (kind === 'orders' || kind === 'sales') {
      const csv = toCsv(rows.rows, [
        { header: 'Codigo', value: (r) => r.code },
        { header: 'Fecha', value: (r) => (r.placed_at instanceof Date ? r.placed_at.toISOString() : r.placed_at) },
        { header: 'Comercio', value: (r) => r.store_name },
        { header: 'Cliente', value: (r) => r.customer_name },
        { header: 'Estado', value: (r) => r.status },
        { header: 'Entrega', value: (r) => r.delivery_mode },
        { header: 'Retiro/Envio', value: (r) => r.fulfillment_type },
        { header: 'Subtotal', value: (r) => Number(r.subtotal) },
        { header: 'Descuento', value: (r) => Number(r.discount) },
        { header: 'Envio', value: (r) => Number(r.shipping_cost) },
        { header: 'Total', value: (r) => Number(r.total) },
        { header: 'Metodo de pago', value: (r) => r.payment_method },
        { header: 'Repartidor', value: (r) => r.rider_name ?? '' },
      ]);
      ctx.res
        .setHeader('content-type', 'text/csv; charset=utf-8')
        .setHeader('content-disposition', `attachment; filename="acoYAradas-${kind}-${from.slice(0, 10)}-${to.slice(0, 10)}.csv"`)
        .send(csv);
      return undefined;
    }

    if (kind === 'commissions') {
      const commissions = await ctx.db.system.query<any>(
        `select c.*, o.code as order_code, s.name as store_name
           from public.commissions c
           join public.orders o on o.id = c.order_id
           join public.stores s on s.id = c.store_id
          where c.created_at >= $1::timestamptz and c.created_at <= $2::timestamptz
          order by c.created_at desc`,
        [from, to],
      );
      const csv = toCsv(commissions.rows, [
        { header: 'Pedido', value: (r) => r.order_code },
        { header: 'Comercio', value: (r) => r.store_name },
        { header: 'Bruto', value: (r) => Number(r.gross_amount) },
        { header: 'Descuento', value: (r) => Number(r.discount_amount) },
        { header: 'Envio', value: (r) => Number(r.shipping_amount) },
        { header: 'Base comision', value: (r) => Number(r.commission_base) },
        { header: 'Tipo', value: (r) => r.rate_type },
        { header: 'Valor', value: (r) => Number(r.rate_value) },
        { header: 'Comision', value: (r) => Number(r.commission_amount) },
        { header: 'Neto comercio', value: (r) => Number(r.net_amount) },
        { header: 'Estado', value: (r) => r.status },
      ]);
      ctx.res
        .setHeader('content-type', 'text/csv; charset=utf-8')
        .setHeader('content-disposition', `attachment; filename="acoYAradas-comisiones.csv"`)
        .send(csv);
      return undefined;
    }

    if (kind === 'ads') {
      const campaigns = await ctx.db.system.query<any>(
        `select c.*, s.name as store_name from public.ad_campaigns c
           join public.stores s on s.id = c.store_id
          where c.created_at >= $1::timestamptz and c.created_at <= $2::timestamptz
          order by c.created_at desc`,
        [from, to],
      );
      const csv = toCsv(campaigns.rows, [
        { header: 'Campana', value: (r) => r.title },
        { header: 'Comercio', value: (r) => r.store_name },
        { header: 'Ubicacion', value: (r) => r.placement },
        { header: 'Desde', value: (r) => r.starts_at },
        { header: 'Hasta', value: (r) => r.ends_at },
        { header: 'Precio', value: (r) => Number(r.price) },
        { header: 'Estado', value: (r) => r.status },
        { header: 'Impresiones', value: (r) => Number(r.impressions) },
        { header: 'Clics', value: (r) => Number(r.clicks) },
      ]);
      ctx.res
        .setHeader('content-type', 'text/csv; charset=utf-8')
        .setHeader('content-disposition', `attachment; filename="acoYAradas-publicidad.csv"`)
        .send(csv);
      return undefined;
    }

    throw notFound('Reporte desconocido');
  }),
);

/* ------------------------------------------------------------------ */
/* Productos no afiliados (platform products)                          */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/platform-products',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select pp.id, pp.name, pp.description, pp.price, pp.stock, pp.image_url,
                pp.category_id, c.name as category_name, pp.is_available, pp.featured,
                pp.status, pp.created_at
           from public.platform_products pp
           left join public.categories c on c.id = pp.category_id
          where pp.deleted_at is null
          order by pp.created_at desc`,
      );
      return { items: rows };
    });
  }),
);

adminRouter.post(
  '/platform-products',
  route(async (ctx) => {
    requireAdmin(ctx);
    const body = validate(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional().or(z.literal('')),
        price: z.number().min(0),
        stock: z.number().int().min(0).optional(),
        image_url: z.string().max(500).optional().or(z.literal('')),
        category_id: z.string().uuid().nullable().optional(),
        is_available: z.boolean().optional(),
        featured: z.boolean().optional(),
      }),
      ctx.req.body,
    );
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `insert into public.platform_products (name, description, price, stock, image_url, category_id, is_available, featured, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          body.name,
          body.description || null,
          body.price,
          body.stock ?? 0,
          body.image_url || null,
          body.category_id || null,
          body.is_available ?? true,
          body.featured ?? false,
          ctx.claims.sub,
        ],
      );
      await audit(tx, { actorId: ctx.claims.sub, actorRole: ctx.claims.role, action: 'platform_product.create', entityType: 'platform_product', entityId: rows[0].id, metadata: body });
      return { id: rows[0].id };
    });
  }),
);

adminRouter.patch(
  '/platform-products/:id',
  route(async (ctx) => {
    requireAdmin(ctx);
    const body = validate(
      z.object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional().or(z.literal('')),
        price: z.number().min(0).optional(),
        stock: z.number().int().min(0).optional(),
        image_url: z.string().max(500).optional().or(z.literal('')),
        category_id: z.string().uuid().nullable().optional(),
        is_available: z.boolean().optional(),
        featured: z.boolean().optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }),
      ctx.req.body,
    );
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const vals: any[] = [];
      let i = 1;
      const push = (col: string, v: any) => {
        fields.push(`${col} = $${i++}`);
        vals.push(v);
      };
      if (body.name !== undefined) push('name', body.name);
      if (body.description !== undefined) push('description', body.description || null);
      if (body.price !== undefined) push('price', body.price);
      if (body.stock !== undefined) push('stock', body.stock);
      if (body.image_url !== undefined) push('image_url', body.image_url || null);
      if (body.category_id !== undefined) push('category_id', body.category_id || null);
      if (body.is_available !== undefined) push('is_available', body.is_available);
      if (body.featured !== undefined) push('featured', body.featured);
      if (body.status !== undefined) push('status', body.status);
      if (fields.length === 0) throw badRequest('Sin cambios');
      vals.push(ctx.req.params.id);
      const { rowCount } = await tx.query(
        `update public.platform_products set ${fields.join(', ')} where id = $${i} and deleted_at is null`,
        vals,
      );
      if (!rowCount) throw notFound('Producto no encontrado');
      await audit(tx, { actorId: ctx.claims.sub, actorRole: ctx.claims.role, action: 'platform_product.update', entityType: 'platform_product', entityId: ctx.req.params.id, metadata: body });
      return { ok: true };
    });
  }),
);

adminRouter.delete(
  '/platform-products/:id',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rowCount } = await tx.query(
        `update public.platform_products set deleted_at = now(), status = 'inactive'
          where id = $1 and deleted_at is null`,
        [ctx.req.params.id],
      );
      if (!rowCount) throw notFound('Producto no encontrado');
      await audit(tx, { actorId: ctx.claims.sub, actorRole: ctx.claims.role, action: 'platform_product.delete', entityType: 'platform_product', entityId: ctx.req.params.id, metadata: {} });
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Tienda de plataforma (acoYAradas) para productos no afiliados       */
/* ------------------------------------------------------------------ */
adminRouter.get(
  '/platform-store',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select id, name, slug, description, phone, email, address, locality, zone_id,
                preparation_time_minutes, allows_platform_delivery, allows_merchant_delivery, allows_pickup,
                merchant_delivery_fee, merchant_delivery_notes, accepts_cash, accepts_transfer, accepts_cash_on_delivery,
                open_hours, status, is_open, featured, verified
           from public.stores
          where slug = 'acoyaradas' and deleted_at is null
          limit 1`,
      );
      return rows[0] ?? null;
    });
  }),
);

adminRouter.patch(
  '/platform-store',
  route(async (ctx) => {
    requireAdmin(ctx);
    const body = validate(
      z.object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional().or(z.literal('')),
        phone: z.string().max(50).optional().or(z.literal('')),
        email: z.string().email().optional().or(z.literal('')),
        address: z.string().max(500).optional().or(z.literal('')),
        locality: z.string().max(120).optional().or(z.literal('')),
        zone_id: z.string().uuid().nullable().optional(),
        preparation_time_minutes: z.number().int().min(0).max(480).optional(),
        allows_platform_delivery: z.boolean().optional(),
        allows_merchant_delivery: z.boolean().optional(),
        allows_pickup: z.boolean().optional(),
        merchant_delivery_fee: z.number().min(0).optional(),
        merchant_delivery_notes: z.string().max(500).optional().or(z.literal('')),
        accepts_cash: z.boolean().optional(),
        accepts_transfer: z.boolean().optional(),
        accepts_cash_on_delivery: z.boolean().optional(),
        open_hours: z.record(z.string(), z.any()).optional(),
        status: z.enum(['active', 'pending', 'suspended', 'rejected']).optional(),
        is_open: z.boolean().optional(),
        featured: z.boolean().optional(),
      }),
      ctx.req.body,
    );
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const vals: any[] = [];
      let i = 1;
      const push = (col: string, v: any) => {
        fields.push(`${col} = $${i++}`);
        vals.push(v);
      };
      if (body.name !== undefined) push('name', body.name);
      if (body.description !== undefined) push('description', body.description || null);
      if (body.phone !== undefined) push('phone', body.phone || null);
      if (body.email !== undefined) push('email', body.email || null);
      if (body.address !== undefined) push('address', body.address || null);
      if (body.locality !== undefined) push('locality', body.locality || null);
      if (body.zone_id !== undefined) push('zone_id', body.zone_id);
      if (body.preparation_time_minutes !== undefined) push('preparation_time_minutes', body.preparation_time_minutes);
      if (body.allows_platform_delivery !== undefined) push('allows_platform_delivery', body.allows_platform_delivery);
      if (body.allows_merchant_delivery !== undefined) push('allows_merchant_delivery', body.allows_merchant_delivery);
      if (body.allows_pickup !== undefined) push('allows_pickup', body.allows_pickup);
      if (body.merchant_delivery_fee !== undefined) push('merchant_delivery_fee', body.merchant_delivery_fee);
      if (body.merchant_delivery_notes !== undefined) push('merchant_delivery_notes', body.merchant_delivery_notes || null);
      if (body.accepts_cash !== undefined) push('accepts_cash', body.accepts_cash);
      if (body.accepts_transfer !== undefined) push('accepts_transfer', body.accepts_transfer);
      if (body.accepts_cash_on_delivery !== undefined) push('accepts_cash_on_delivery', body.accepts_cash_on_delivery);
      if (body.open_hours !== undefined) push('open_hours', JSON.stringify(body.open_hours));
      if (body.status !== undefined) push('status', body.status);
      if (body.is_open !== undefined) push('is_open', body.is_open);
      if (body.featured !== undefined) push('featured', body.featured);
      if (fields.length === 0) throw badRequest('Sin cambios');
      vals.push('acoyaradas');
      const { rowCount } = await tx.query(
        `update public.stores set ${fields.join(', ')}, updated_at = now() where slug = $${i} and deleted_at is null`,
        vals,
      );
      if (!rowCount) throw notFound('Tienda de plataforma no encontrada');
      await audit(tx, { actorId: ctx.claims.sub, actorRole: ctx.claims.role, action: 'platform_store.update', entityType: 'store', entityId: 'acoyaradas', metadata: body });
      return { ok: true };
    });
  }),
);
