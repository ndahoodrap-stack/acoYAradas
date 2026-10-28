import { Router } from 'express';
import {
  campaignSchema,
  productSchema,
  promotionSchema,
  storeApplicationSchema,
  storeProfileSchema,
  type CampaignInput,
} from '@acoyaradas/shared';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { requireStoreManager, requireAuth } from '../http/context.js';
import { route, validate } from '../http/router.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { slugify, uniqueSlug } from '../lib/ids.js';
import { money } from '../lib/money.js';
import { audit } from '../lib/audit.js';
import { insertNotificationsAs } from '../lib/notify.js';
import { notifyOrderStatusWhatsApp } from '../lib/whatsapp.js';
import { applyOrderStatus } from './orderStatus.js';
import { mapOrder, ORDER_SELECT } from './orders.js';
import { isStoreOpenNow } from '../lib/storeHours.js';

/** Panel del comercio (Etapa 2). */
export const storeRouter = Router();

async function run<T>(ctx: any, fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return ctx.db.transaction(async (tx: DbExecutor) => {
    await applyClaims(tx, ctx.claims);
    return fn(tx);
  });
}

async function slugExists(tx: DbExecutor, storeId: string, slug: string): Promise<boolean> {
  const { rows } = await tx.query('select 1 from public.products where store_id = $1 and slug = $2', [
    storeId,
    slug,
  ]);
  return rows.length > 0;
}

/** Límites del plan vigente (o del plan gratuito por defecto). */
async function planLimits(tx: DbExecutor, storeId: string) {
  const { rows } = await tx.query<any>(
    `select p.product_limit, p.promo_limit, p.name, p.code, s.status, s.ends_at
       from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.store_id = $1 and s.status = 'active' and s.ends_at > now()
      order by s.ends_at desc limit 1`,
    [storeId],
  );
  if (rows.length) {
    return {
      name: rows[0].name,
      code: rows[0].code,
      product_limit: Number(rows[0].product_limit),
      promo_limit: Number(rows[0].promo_limit),
      ends_at: rows[0].ends_at,
      paid: true,
    };
  }
  const free = await tx.query<any>(
    `select id, name, code, product_limit, promo_limit from public.plans where code = 'free' and active = true and deleted_at is null limit 1`,
  );
  if (free.rows.length) {
    return {
      name: free.rows[0].name,
      code: free.rows[0].code,
      product_limit: Number(free.rows[0].product_limit),
      promo_limit: Number(free.rows[0].promo_limit),
      ends_at: null,
      paid: false,
    };
  }
  return { name: 'Sin plan', code: 'none', product_limit: 10, promo_limit: 1, ends_at: null, paid: false };
}

/* ------------------------------------------------------------------ */
/* Solicitud de registro comercial (público)                          */
/* ------------------------------------------------------------------ */
storeRouter.post(
  '/applications',
  route(async (ctx, req) => {
    const input = validate(storeApplicationSchema, req.body);
    const user = requireAuth(ctx);
    return run(ctx, async (tx) => {
      const existing = await tx.query(
        `select id, name, status from public.stores
          where owner_id = $1 and deleted_at is null and status in ('pending','active','suspended') limit 1`,
        [user.id],
      );
      if (existing.rows.length) {
        throw conflict('Ya tenés una solicitud o un comercio asociado a tu cuenta');
      }
      const slug = await uniqueSlug(
        async (candidate) => {
          const { rows } = await tx.query('select 1 from public.stores where slug = $1', [candidate]);
          return rows.length > 0;
        },
        input.store_name,
      );

      const inserted = await tx.query<any>(
        `insert into public.stores
           (owner_id, name, slug, phone, address, locality, category_id, email, status, accepts_terms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pending', true)
         returning id, name, slug, status`,
        [
          user.id,
          input.store_name,
          slug,
          input.phone,
          input.address,
          input.locality,
          input.category_id,
          input.email || user.email,
        ],
      );
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        actorName: user.full_name ?? user.email,
        action: 'store_application_created',
        entityType: 'store',
        entityId: inserted.rows[0].id,
        metadata: { name: input.store_name, notes: input.notes },
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Perfil del comercio                                                  */
/* ------------------------------------------------------------------ */
storeRouter.get(
  '/profile',
  route(async (ctx) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const store = await tx.query(
        `select s.*, c.name as category_name,
                (select count(*) from public.products p where p.store_id = s.id and p.deleted_at is null) as products_count
           from public.stores s left join public.categories c on c.id = s.category_id
          where s.id = $1`,
        [storeId],
      );
      if (!store.rows.length) throw notFound('No tenés un comercio asociado');
      const limits = await planLimits(tx, storeId);
      const subscription = await tx.query(
        `select s.id, s.status, s.starts_at, s.ends_at, p.name as plan_name, p.code as plan_code, p.price
           from public.subscriptions s join public.plans p on p.id = s.plan_id
          where s.store_id = $1 order by s.created_at desc limit 1`,
        [storeId],
      );
      const storeData = store.rows[0];
      // Calculate is_open from open_hours for consistency with public catalog
      const calculatedIsOpen = storeData.status === 'active' ? isStoreOpenNow(storeData.open_hours ?? {}) : Boolean(storeData.is_open);
      return {
        store: { ...storeData, is_open: calculatedIsOpen },
        limits,
        subscription: subscription.rows[0] ?? null,
      };
    });
  }),
);

storeRouter.patch(
  '/profile',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    const input = validate(storeProfileSchema, req.body);
    return run(ctx, async (tx) => {
      const fields: string[] = [];
      const params: unknown[] = [storeId];
      const map: Record<string, string> = {
        name: 'name',
        description: 'description',
        logo_url: 'logo_url',
        cover_url: 'cover_url',
        phone: 'phone',
        whatsapp: 'whatsapp',
        email: 'email',
        address: 'address',
        locality: 'locality',
        category_id: 'category_id',
        preparation_time_minutes: 'preparation_time_minutes',
        merchant_delivery_fee: 'merchant_delivery_fee',
        merchant_delivery_notes: 'merchant_delivery_notes',
      };
      for (const [key, column] of Object.entries(map)) {
        const value = (input as any)[key];
        if (value !== undefined) {
          params.push(value === '' ? null : value);
          fields.push(`${column} = $${params.length}`);
        }
      }
      const bools: Record<string, string> = {
        is_open: 'is_open',
        allows_platform_delivery: 'allows_platform_delivery',
        allows_pickup: 'allows_pickup',
        accepts_cash: 'accepts_cash',
        accepts_transfer: 'accepts_transfer',
        accepts_terms: 'accepts_terms',
      };
      for (const [key, column] of Object.entries(bools)) {
        const value = (input as any)[key];
        if (value !== undefined) {
          params.push(value);
          fields.push(`${column} = $${params.length}`);
        }
      }
      if (input.open_hours !== undefined) {
        params.push(JSON.stringify(input.open_hours));
        fields.push(`open_hours = $${params.length}::jsonb`);
        // Auto-calculate is_open from open_hours for consistency
        const calculatedIsOpen = isStoreOpenNow(input.open_hours);
        params.push(calculatedIsOpen);
        fields.push(`is_open = $${params.length}`);
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      params.push(new Date().toISOString());
      fields.push(`updated_at = $${params.length}`);
      await tx.query(`update public.stores set ${fields.join(', ')} where id = $1`, params);
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        actorName: user.full_name ?? user.email,
        action: 'store_profile_updated',
        entityType: 'store',
        entityId: storeId,
        metadata: { fields: Object.keys(input) },
        ip: ctx.ip,
      });
      const store = await tx.query('select * from public.stores where id = $1', [storeId]);
      return store.rows[0];
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */
storeRouter.get(
  '/products',
  route(async (ctx) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select p.*, c.name as category_name
           from public.products p left join public.categories c on c.id = p.category_id
          where p.store_id = $1 and p.deleted_at is null
          order by p.created_at desc`,
        [storeId],
      );
      return { items: rows };
    });
  }),
);

storeRouter.post(
  '/products',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    const input = validate(productSchema, req.body);
    return run(ctx, async (tx) => {
      const limits = await planLimits(tx, storeId);
      const count = await tx.query(
        'select count(*)::int as total from public.products where store_id = $1 and deleted_at is null',
        [storeId],
      );
      if (Number(count.rows[0].total) >= limits.product_limit) {
        throw forbidden(
          `Tu plan (${limits.name}) permite ${limits.product_limit} productos. Actualizá tu plan para publicar más.`,
        );
      }
      const slug = await uniqueSlug(
        (candidate) => slugExists(tx, storeId, candidate),
        `${input.name}-${slugify(String(input.price))}`,
      );
      const inserted = await tx.query(
        `insert into public.products
           (store_id, name, slug, description, price, stock, category_id, image_url, is_available, featured)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [
          storeId,
          input.name,
          slug,
          input.description || null,
          input.price,
          input.stock,
          input.category_id ?? null,
          input.image_url || null,
          input.is_available ?? true,
          input.featured ?? false,
        ],
      );
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        actorName: user.full_name ?? user.email,
        action: 'product_created',
        entityType: 'product',
        entityId: inserted.rows[0].id,
        metadata: { name: input.name },
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

storeRouter.patch(
  '/products/:id',
  route(async (ctx, req) => {
    const { storeId } = requireStoreManager(ctx);
    const input = validate(productSchema.partial(), req.body);
    return run(ctx, async (tx) => {
      const owned = await tx.query('select id from public.products where id = $1 and store_id = $2', [
        String(req.params.id),
        storeId,
      ]);
      if (!owned.rows.length) throw notFound('El producto no existe en tu comercio');

      const fields: string[] = [];
      const params: unknown[] = [String(req.params.id)];
      const map: Record<string, string> = {
        name: 'name',
        description: 'description',
        price: 'price',
        stock: 'stock',
        category_id: 'category_id',
        image_url: 'image_url',
      };
      for (const [key, column] of Object.entries(map)) {
        const value = (input as any)[key];
        if (value !== undefined) {
          params.push(value === '' ? null : value);
          fields.push(`${column} = $${params.length}`);
        }
      }
      for (const key of ['is_available', 'featured']) {
        const value = (input as any)[key];
        if (value !== undefined) {
          params.push(value);
          fields.push(`${key} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      params.push(new Date().toISOString());
      fields.push(`updated_at = $${params.length}`);
      await tx.query(`update public.products set ${fields.join(', ')} where id = $1`, params);
      return (await tx.query('select * from public.products where id = $1', [String(req.params.id)])).rows[0];
    });
  }),
);

storeRouter.delete(
  '/products/:id',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const owned = await tx.query('select id from public.products where id = $1 and store_id = $2', [
        String(req.params.id),
        storeId,
      ]);
      if (!owned.rows.length) throw notFound('El producto no existe en tu comercio');
      await tx.query(
        'update public.products set deleted_at = now(), is_available = false, updated_at = now() where id = $1',
        [String(req.params.id)],
      );
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        actorName: user.full_name ?? user.email,
        action: 'product_deleted',
        entityType: 'product',
        entityId: String(req.params.id),
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Pedidos del comercio                                                 */
/* ------------------------------------------------------------------ */
storeRouter.get(
  '/orders',
  route(async (ctx, req) => {
    const { storeId } = requireStoreManager(ctx);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    return run(ctx, async (tx) => {
      const params: unknown[] = [storeId];
      let where = 'o.store_id = $1';
      if (status && status !== 'all') {
        params.push(status);
        where += ` and o.status = $${params.length}`;
      }
      const { rows } = await tx.query(
        `select ${ORDER_SELECT} from public.orders o
           join public.stores s on s.id = o.store_id
           left join public.riders r on r.id = o.rider_id
          where ${where}
          order by o.placed_at desc
          limit 200`,
        params,
      );
      const items = await tx.query(
        `select oi.* from public.order_items oi
           join public.orders o2 on o2.id = oi.order_id
          where o2.store_id = $1 order by oi.order_id, oi.id`,
        [storeId],
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

storeRouter.patch(
  '/orders/:id/status',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    const status = String(req.body?.status ?? '');
    const note = String(req.body?.note ?? '').slice(0, 1000);
    const prepMinutes =
      req.body?.preparation_minutes === undefined || req.body?.preparation_minutes === null
        ? null
        : Number(req.body.preparation_minutes);
    const responsible =
      req.body?.merchant_responsible === undefined
        ? null
        : String(req.body.merchant_responsible ?? '').slice(0, 120);

    const allowed = ['confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'incident'];
    if (!allowed.includes(status)) throw badRequest('Estado no permitido para el comercio');

    const updated = await run(ctx, async (tx) => {
      const owned = await tx.query<{ id: string; customer_id: string | null; store_id: string }>(
        'select id, customer_id, store_id from public.orders where id = $1',
        [String(req.params.id)],
      );
      if (!owned.rows.length || owned.rows[0].store_id !== storeId) {
        throw notFound('El pedido no existe en tu comercio');
      }
      await applyOrderStatus(tx, {
        orderId: String(req.params.id),
        status: status as any,
        note,
        preparationMinutes: prepMinutes,
        merchantResponsible: responsible,
        actorId: user.id,
        actorName: user.full_name ?? user.email,
        actorRole: user.role,
      });
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        actorName: user.full_name ?? user.email,
        action: `order_${status}`,
        entityType: 'order',
        entityId: String(req.params.id),
        ip: ctx.ip,
      });
      return { customerId: owned.rows[0].customer_id };
    });

    // Aviso al cliente (fuera de la transacción para no anidar transacciones)
    if (updated.customerId) {
      await insertNotificationsAs(ctx.db, { sub: updated.customerId, role: 'customer' }, [
        {
          user_id: updated.customerId,
          order_id: String(req.params.id),
          channel: 'in_app',
          template: `order_${status}`,
          payload: { status },
        },
      ]);
    }
    // WhatsApp automático al cliente con el nuevo estado
    try {
      await notifyOrderStatusWhatsApp(ctx.db, String(req.params.id), {
        recipients: ['customer'],
        statusNote: note || null,
      });
    } catch {
      // El cambio de estado no se bloquea si WhatsApp falla
    }
    return { ok: true, status };
  }),
);

/* ------------------------------------------------------------------ */
/* Promociones                                                         */
/* ------------------------------------------------------------------ */
storeRouter.get(
  '/promotions',
  route(async (ctx) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        'select * from public.promotions where store_id = $1 order by created_at desc',
        [storeId],
      );
      return { items: rows };
    });
  }),
);

storeRouter.post(
  '/promotions',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    const input = validate(promotionSchema, req.body);
    return run(ctx, async (tx) => {
      const limits = await planLimits(tx, storeId);
      const count = await tx.query(
        'select count(*)::int as total from public.promotions where store_id = $1 and active = true',
        [storeId],
      );
      if (Number(count.rows[0].total) >= limits.promo_limit) {
        throw forbidden(`Tu plan (${limits.name}) permite ${limits.promo_limit} promociones activas.`);
      }
      const inserted = await tx.query(
        `insert into public.promotions
           (store_id, title, description, discount_type, discount_value, code, starts_at, ends_at, min_subtotal, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [
          storeId,
          input.title,
          input.description || null,
          input.discount_type,
          input.discount_value,
          input.code || null,
          input.starts_at || null,
          input.ends_at || null,
          input.min_subtotal ?? 0,
          input.active ?? true,
        ],
      );
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: 'promotion_created',
        entityType: 'promotion',
        entityId: inserted.rows[0].id,
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

storeRouter.patch(
  '/promotions/:id',
  route(async (ctx, req) => {
    const { storeId } = requireStoreManager(ctx);
    const input = validate(promotionSchema.partial(), req.body);
    return run(ctx, async (tx) => {
      const owned = await tx.query('select id from public.promotions where id = $1 and store_id = $2', [
        String(req.params.id),
        storeId,
      ]);
      if (!owned.rows.length) throw notFound('La promoción no existe en tu comercio');
      const fields: string[] = [];
      const params: unknown[] = [String(req.params.id)];
      const map: Record<string, string> = {
        title: 'title',
        description: 'description',
        discount_type: 'discount_type',
        discount_value: 'discount_value',
        code: 'code',
        starts_at: 'starts_at',
        ends_at: 'ends_at',
        min_subtotal: 'min_subtotal',
        active: 'active',
      };
      for (const [key, column] of Object.entries(map)) {
        const value = (input as any)[key];
        if (value !== undefined) {
          params.push(value === '' ? null : value);
          fields.push(`${column} = $${params.length}`);
        }
      }
      if (!fields.length) throw badRequest('No hay cambios para guardar');
      await tx.query(`update public.promotions set ${fields.join(', ')}, updated_at = now() where id = $1`, params);
      return (await tx.query('select * from public.promotions where id = $1', [String(req.params.id)])).rows[0];
    });
  }),
);

storeRouter.delete(
  '/promotions/:id',
  route(async (ctx, req) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const owned = await tx.query('select id from public.promotions where id = $1 and store_id = $2', [
        String(req.params.id),
        storeId,
      ]);
      if (!owned.rows.length) throw notFound('La promoción no existe en tu comercio');
      await tx.query('update public.promotions set active = false, updated_at = now() where id = $1', [
        String(req.params.id),
      ]);
      return { ok: true };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Estadísticas y finanzas del comercio                                 */
/* ------------------------------------------------------------------ */
storeRouter.get(
  '/stats',
  route(async (ctx) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const [sales, byStatus, top] = await Promise.all([
        tx.query(
          `select count(*)::int as orders,
                  coalesce(sum(subtotal),0) as gross,
                  coalesce(sum(discount),0) as discounts,
                  coalesce(sum(shipping_cost),0) as shipping,
                  coalesce(sum(total),0) as total
             from public.orders
            where store_id = $1 and status <> 'cancelled'`,
          [storeId],
        ),
        tx.query(
          'select status, count(*)::int as total from public.orders where store_id = $1 group by status',
          [storeId],
        ),
        tx.query(
          `select oi.name_snapshot as name, sum(oi.quantity)::int as units, sum(oi.line_total) as amount
             from public.order_items oi join public.orders o on o.id = oi.order_id
            where o.store_id = $1 and o.status <> 'cancelled'
            group by oi.name_snapshot order by amount desc limit 10`,
          [storeId],
        ),
      ]);
      const commission = await tx.query(
        `select coalesce(sum(commission_amount),0) as pending,
                coalesce(sum(commission_amount) filter (where status = 'settled'),0) as settled,
                coalesce(sum(net_amount),0) as net
           from public.commissions where store_id = $1`,
        [storeId],
      );
      return {
        sales: {
          orders: Number(sales.rows[0].orders ?? 0),
          gross: money(Number(sales.rows[0].gross ?? 0)),
          discounts: money(Number(sales.rows[0].discounts ?? 0)),
          shipping: money(Number(sales.rows[0].shipping ?? 0)),
          total: money(Number(sales.rows[0].total ?? 0)),
        },
        commission: {
          pending: money(Number(commission.rows[0]?.pending ?? 0)),
          settled: money(Number(commission.rows[0]?.settled ?? 0)),
          net: money(Number(commission.rows[0]?.net ?? 0)),
        },
        orders_by_status: Object.fromEntries(byStatus.rows.map((r: any) => [r.status, Number(r.total)])),
        top_products: top.rows,
      };
    });
  }),
);

storeRouter.get(
  '/finance',
  route(async (ctx) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const [payments, subscriptions, commissions, campaigns, limits] = await Promise.all([
        tx.query(
          `select id, kind, amount, method, status, due_at, paid_at, confirmed_at, notes, created_at
             from public.payments where store_id = $1 order by created_at desc limit 100`,
          [storeId],
        ),
        tx.query(
          `select s.id, s.status, s.starts_at, s.ends_at, p.name as plan_name, p.code as plan_code, p.price, p.billing_period
             from public.subscriptions s join public.plans p on p.id = s.plan_id
            where s.store_id = $1 order by s.created_at desc`,
          [storeId],
        ),
        tx.query(
          `select c.id, c.order_id, c.gross_amount, c.discount_amount, c.shipping_amount, c.commission_base,
                  c.rate_type, c.rate_value, c.commission_amount, c.net_amount, c.status, c.created_at, o.code as order_code
             from public.commissions c join public.orders o on o.id = c.order_id
            where c.store_id = $1 order by c.created_at desc limit 100`,
          [storeId],
        ),
        tx.query(
          `select id, title, placement, starts_at, ends_at, price, status, impressions, clicks
             from public.ad_campaigns where store_id = $1 order by created_at desc`,
          [storeId],
        ),
        planLimits(tx, storeId),
      ]);
      return {
        payments: payments.rows,
        subscriptions: subscriptions.rows,
        commissions: commissions.rows,
        campaigns: campaigns.rows,
        limits,
      };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Campañas publicitarias del comercio                                  */
/* ------------------------------------------------------------------ */
storeRouter.get(
  '/campaigns',
  route(async (ctx) => {
    const { storeId } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select c.*, p.name as placement_name, p.price_per_day
           from public.ad_campaigns c left join public.ad_placements p on p.key = c.placement::text
          where c.store_id = $1 order by c.created_at desc`,
        [storeId],
      );
      return { items: rows };
    });
  }),
);

storeRouter.post(
  '/campaigns',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    const input: CampaignInput = validate(campaignSchema, req.body);
    if (input.store_id !== storeId) throw forbidden('Sólo podés crear campañas para tu comercio');
    return run(ctx, async (tx) => {
      const inserted = await tx.query(
        `insert into public.ad_campaigns
           (store_id, placement, title, body, image_url, link_url, product_id, starts_at, ends_at, price, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11) returning *`,
        [
          storeId,
          input.placement,
          input.title,
          input.body || null,
          input.image_url || null,
          input.link_url || null,
          input.product_id ?? null,
          input.starts_at,
          input.ends_at,
          input.price,
          user.id,
        ],
      );
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        action: 'campaign_created',
        entityType: 'campaign',
        entityId: inserted.rows[0].id,
        metadata: { title: input.title, price: input.price },
        ip: ctx.ip,
      });
      return inserted.rows[0];
    });
  }),
);

storeRouter.delete(
  '/campaigns/:id',
  route(async (ctx, req) => {
    const { storeId, user } = requireStoreManager(ctx);
    return run(ctx, async (tx) => {
      const owned = await tx.query<{ id: string; banner_id: string | null }>(
        'select id, banner_id from public.ad_campaigns where id = $1 and store_id = $2',
        [String(req.params.id), storeId],
      );
      if (!owned.rows.length) throw notFound('La campaña no existe en tu comercio');
      const bannerId = owned.rows[0].banner_id;
      if (bannerId) {
        await tx.query('delete from public.banners where id = $1', [bannerId]);
      }
      await tx.query('delete from public.ad_campaigns where id = $1', [String(req.params.id)]);
      await audit(tx, {
        actorId: user.id,
        actorRole: user.role,
        actorName: user.full_name ?? user.email,
        action: 'campaign_deleted',
        entityType: 'campaign',
        entityId: String(req.params.id),
        ip: ctx.ip,
      });
      return { ok: true };
    });
  }),
);
