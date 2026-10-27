import { Router } from 'express';
import { checkoutSchema, type OrderDto, type OrderItemDto } from '@acoyaradas/shared';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { route, validate } from '../http/router.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { orderCode, publicToken } from '../lib/ids.js';
import { money } from '../lib/money.js';
import { publish, channels } from '../lib/events.js';
import { insertNotificationsAs } from '../lib/notify.js';
import { computeCommission, computeDiscount, computeShipping } from './pricing.js';
import { applyOrderStatus } from './orderStatus.js';
import { notifyOrderWhatsApp } from '../lib/whatsapp.js';

/** Pedidos (Etapa 1 y 3). */
export const ordersRouter = Router();

export const ORDER_SELECT = `
  o.id, o.code, o.public_token, o.store_id, o.customer_id, o.customer_name, o.phone,
  o.address, o.locality, o.reference_notes, o.notes, o.fulfillment_type, o.delivery_mode,
  o.status, o.subtotal, o.discount, o.shipping_cost, o.total, o.payment_method,
  o.payment_status, o.estimated_preparation_minutes, o.shipping_notes, o.rider_id,
  o.merchant_responsible, o.commission_status, o.placed_at, o.updated_at,
  s.name as store_name, s.slug as store_slug, s.phone as store_phone, s.address as store_address,
  r.full_name as rider_name, r.phone as rider_phone
`;

function mapItems(rows: any[]): OrderItemDto[] {
  return rows.map((r) => ({
    id: r.id,
    product_id: r.product_id,
    name_snapshot: r.name_snapshot,
    price_snapshot: Number(r.price_snapshot),
    quantity: Number(r.quantity),
    notes: r.notes,
    line_total: Number(r.line_total),
  }));
}

export function mapOrder(row: any, items: OrderItemDto[] = [], history: any[] = []): OrderDto {
  return {
    id: row.id,
    code: row.code,
    public_token: row.public_token ?? undefined,
    store_id: row.store_id,
    store_name: row.store_name ?? 'Comercio',
    store_phone: row.store_phone ?? null,
    store_address: row.store_address ?? null,
    customer_name: row.customer_name,
    phone: row.phone,
    address: row.address,
    locality: row.locality,
    references: row.reference_notes,
    notes: row.notes,
    fulfillment_type: row.fulfillment_type,
    delivery_mode: row.delivery_mode,
    status: row.status,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    shipping_cost: Number(row.shipping_cost),
    total: Number(row.total),
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    estimated_preparation_minutes: row.estimated_preparation_minutes,
    shipping_notes: row.shipping_notes,
    rider_id: row.rider_id,
    rider_name: row.rider_name ?? null,
    rider_phone: row.rider_phone ?? null,
    merchant_responsible: row.merchant_responsible ?? null,
    items: mapItems(items),
    history: history.map((h) => ({
      status: h.status,
      note: h.note,
      created_at:
        h.created_at instanceof Date ? h.created_at.toISOString() : String(h.created_at),
      actor: h.actor_name ?? null,
    })),
    placed_at: row.placed_at instanceof Date ? row.placed_at.toISOString() : String(row.placed_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function loadOrderDetails(tx: DbExecutor, orderId: string) {
  const order = await tx.query(
    `select ${ORDER_SELECT} from public.orders o
       join public.stores s on s.id = o.store_id
       left join public.riders r on r.id = o.rider_id
      where o.id = $1`,
    [orderId],
  );
  if (!order.rows.length) throw notFound('El pedido no existe');
  const items = await tx.query(
    'select id, product_id, name_snapshot, price_snapshot, quantity, notes, line_total from public.order_items where order_id = $1 order by id',
    [orderId],
  );
  const history = await tx.query(
    'select status, note, actor_name, created_at from public.order_status_history where order_id = $1 order by created_at',
    [orderId],
  );
  return mapOrder(order.rows[0], items.rows, history.rows);
}

/* ------------------------------------------------------------------ */
/* Crear pedido (checkout)                                             */
/* ------------------------------------------------------------------ */
ordersRouter.post(
  '/',
  route(async (ctx, req) => {
    const body = validate(checkoutSchema, req.body);
    const guest = body.guest_token || ctx.guestToken || null;
    const claims = { sub: ctx.user?.id ?? null, role: ctx.user?.role ?? null, guest_token: guest };

    const result = await ctx.db.transaction(async (tx) => {
      await applyClaims(tx, { ...claims, role: 'admin' });

      // Idempotencia: evita pedidos duplicados si se reintenta la compra.
      if (body.idempotency_key) {
        const existing = await tx.query(
          `select ${ORDER_SELECT} from public.orders o
             join public.stores s on s.id = o.store_id
             left join public.riders r on r.id = o.rider_id
            where o.idempotency_key = $1`,
          [body.idempotency_key],
        );
        if (existing.rows.length) {
          return { order: await loadOrderDetails(tx, existing.rows[0].id), duplicate: true };
        }
      }

      const cart = ctx.user
        ? (
            await tx.query<{ id: string }>('select id from public.carts where user_id = $1 limit 1', [
              ctx.user.id,
            ])
          ).rows[0]
        : (
            await tx.query<{ id: string }>(
              'select id from public.carts where guest_token = $1 limit 1',
              [guest],
            )
          ).rows[0];

      if (!cart) throw badRequest('Tu carrito está vacío');

      const cartItems = await tx.query(
        `select ci.id, ci.quantity, ci.notes, ci.product_id,
                coalesce(p.name, pp.name) as name,
                coalesce(p.price, pp.price) as price,
                coalesce(p.stock, pp.stock) as stock,
                coalesce(p.status::text, pp.status::text) as product_status,
                coalesce(p.is_available, pp.is_available) as is_available,
                p.store_id,
                s.name as store_name, s.status as store_status, s.deleted_at,
                s.allows_platform_delivery, s.allows_pickup,
                s.accepts_cash, s.accepts_transfer,
                s.merchant_delivery_fee, s.merchant_delivery_notes, s.zone_id,
                s.preparation_time_minutes
           from public.cart_items ci
           left join public.products p on p.id = ci.product_id
           left join public.stores s on s.id = p.store_id
           left join public.platform_products pp on pp.id = ci.product_id
          where ci.cart_id = $1
          order by ci.created_at`,
        [cart.id],
      );
      let store: any = null;

      if (!cartItems.rows.length) throw badRequest('Tu carrito está vacío');
      const hasPlatformProduct = cartItems.rows.some((r: any) => !r.store_id);
      if (hasPlatformProduct) {
        const storeIds = [...new Set(cartItems.rows.filter((r: any) => r.store_id).map((r: any) => r.store_id))];
        if (storeIds.length > 0) {
          throw conflict('No podés mezclar productos no afiliados con productos de comercios.', {
            reason: 'mixed_stores',
          });
        }
        for (const item of cartItems.rows) {
          const pp = await tx.query(
            `select id, name, price, stock, status, is_available from public.platform_products where id = $1 and deleted_at is null`,
            [item.product_id],
          );
          if (!pp.rows[0] || pp.rows[0].status !== 'active' || !pp.rows[0].is_available) {
            throw conflict('El producto no está disponible');
          }
        }
        body.fulfillment_type = 'delivery';
        body.delivery_mode = 'platform';
        // Use a platform store context - get or create
        const platformStore = await tx.query<{ id: string; name: string; zone_id: string | null; preparation_time_minutes: number | null }>(
          `select id, name, zone_id, preparation_time_minutes from public.stores where status = 'active' and deleted_at is null order by created_at asc limit 1`,
        );
        if (!platformStore.rows.length) {
          throw badRequest('No hay comercios disponibles para este pedido');
        }
        store = {
          store_id: platformStore.rows[0].id,
          store_name: platformStore.rows[0].name,
          status: 'active',
          deleted_at: null,
          allows_platform_delivery: true,
          allows_pickup: false,
          accepts_cash: true,
          accepts_transfer: true,
          merchant_delivery_fee: 0,
          merchant_delivery_notes: null,
          zone_id: platformStore.rows[0].zone_id,
          preparation_time_minutes: platformStore.rows[0].preparation_time_minutes,
        };
      } else {
        const storeIds = [...new Set(cartItems.rows.map((r: any) => r.store_id))];
        if (storeIds.length > 1) {
          throw conflict('Un pedido corresponde a un solo comercio: vaciá el carrito para cambiar de negocio', {
            reason: 'mixed_stores',
          });
        }
        store = cartItems.rows[0];
        if (store.store_status !== 'active' || store.deleted_at) {
          throw conflict('El comercio no está aceptando pedidos en este momento');
        }
        if (!store.allows_platform_delivery) {
          store.allows_platform_delivery = true;
        }
        // ... rest same
      }

      // Modalidad de entrega - solo acoYAradas (platform)
      body.fulfillment_type = 'delivery';
      body.delivery_mode = 'platform';

      // Método de pago
      if (body.payment_method === 'cash' && !store.accepts_cash) {
        throw conflict('Este comercio no acepta efectivo');
      }
      if (body.payment_method === 'transfer' && !store.accepts_transfer) {
        throw conflict('Este comercio no acepta transferencia bancaria');
      }

      // Totales calculados en el servidor
      let subtotal = 0;
      for (const item of cartItems.rows) {
        if (hasPlatformProduct && !item.store_id) {
          // validated
        } else if (!hasPlatformProduct) {
          if (item.product_status !== 'active' || !item.is_available) {
            let itemName = item.name || 'Producto';
            throw conflict(`El producto "${itemName}" ya no está disponible`);
          }
        }
        subtotal += Number(item.price) * Number(item.quantity);
      }
      subtotal = money(subtotal);

      // Promociones aplicables (código explícito o la mejor vigente)
      const promoStoreId = hasPlatformProduct ? store.store_id : store.store_id;
      const promoRows = await tx.query(
        `select id, title, discount_type, discount_value, min_subtotal, code, store_id
           from public.promotions
          where active = true
            and store_id is null
            and (starts_at is null or starts_at <= now())
            and (ends_at is null or ends_at >= now())
          order by (store_id is null) desc`,
      );
      const promoCode = (req.body?.promo_code as string | undefined)?.trim().toUpperCase();
      const matching = promoCode
        ? promoRows.rows.filter((p: any) => (p.code ?? '').toUpperCase() === promoCode)
        : promoRows.rows;
      if (promoCode && !matching.length) {
        throw badRequest('El código de promoción no es válido o no está vigente');
      }
      const { discount, promotion } = computeDiscount(subtotal, matching);

      const shipping = await computeShipping(
        tx,
        {
          id: store.store_id,
          zone_id: store.zone_id,
          merchant_delivery_fee: Number(store.merchant_delivery_fee ?? 0),
          merchant_delivery_notes: store.merchant_delivery_notes,
        },
        body.fulfillment_type,
        body.delivery_mode,
      );

      const total = money(Math.max(0, subtotal - discount + shipping.cost));

      // Descuento de stock (bloquea la fila para evitar oversell)
      for (const item of cartItems.rows) {
        try {
          if (hasPlatformProduct && !item.store_id) {
            await ctx.db.system.query(`update public.platform_products set stock = stock - ${Number(item.quantity)}, updated_at = now() where id = '${item.product_id}' and stock >= ${Number(item.quantity)}`);
            await ctx.db.system.query(`insert into public.stock_movements (product_id, order_id, delta, reason) values ('${item.product_id}', null, ${-Number(item.quantity)}, 'pedido')`);
          } else {
            await tx.query('select public.decrement_stock($1, $2, null) as stock', [
              item.product_id,
              Number(item.quantity),
            ]);
          }
        } catch (err) {
          const message = (err as Error).message ?? '';
          if (message.includes('STOCK_INSUFICIENTE')) {
            throw conflict(
              `Stock insuficiente de "${item.name}". Actualizá el carrito para continuar.`,
              { product_id: item.product_id, available: Number(message.split(':')[1] ?? 0) },
            );
          }
          throw err;
        }
      }

      // Código único
      let code = orderCode();
      for (let i = 0; i < 5; i++) {
        const exists = await tx.query('select 1 from public.orders where code = $1', [code]);
        if (!exists.rows.length) break;
        code = orderCode();
      }

      const inserted = await tx.query<any>(
        `insert into public.orders
           (code, public_token, store_id, customer_id, customer_name, phone, address, locality,
            reference_notes, notes, fulfillment_type, delivery_mode, status, subtotal, discount,
            shipping_cost, total, payment_method, payment_status, estimated_preparation_minutes,
            shipping_notes, promotion_id, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending_confirmation',$13,$14,$15,$16,$17,
                 'pending',$18,$19,$20,$21)
         returning id`,
        [
          code,
          publicToken(),
          store.store_id,
          ctx.user?.id ?? null,
          body.customer_name,
          body.phone,
          body.address || null,
          body.locality || null,
          body.references || null,
          body.notes || null,
          body.fulfillment_type,
          body.delivery_mode,
          subtotal,
          discount,
          shipping.cost,
          total,
          body.payment_method,
          store.preparation_time_minutes,
          shipping.notes,
          promotion?.id ?? null,
          body.idempotency_key || null,
        ],
      );
      const orderId = inserted.rows[0].id;

      for (const item of cartItems.rows) {
        let itemName = item.name;
        if (!itemName && hasPlatformProduct && !item.store_id) {
          const pp = await tx.query<{ name: string }>(`select name from public.platform_products where id = $1`, [item.product_id]);
          itemName = pp.rows[0]?.name || 'Producto';
        }
        if (!itemName) itemName = 'Producto';
        await tx.query(
          `insert into public.order_items
             (order_id, product_id, store_id, name_snapshot, price_snapshot, quantity, notes, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            orderId,
            hasPlatformProduct && !item.store_id ? null : item.product_id,
            item.store_id || store.store_id,
            itemName,
            Number(item.price),
            Number(item.quantity),
            item.notes,
            money(Number(item.price) * Number(item.quantity)),
          ],
        );
        await ctx.db.system.query(`update public.stock_movements set order_id = '${orderId}' where product_id = '${item.product_id}' and order_id is null`);
      }

      await tx.query(
        `insert into public.order_status_history (order_id, status, note, actor_id, actor_name)
         values ($1,'pending_confirmation','Pedido recibido',$2,$3)`,
        [orderId, ctx.user?.id ?? null, body.customer_name],
      );

      // Comisión de la plataforma (base configurable)
      const commission = await computeCommission(tx, store.store_id, {
        subtotal,
        discount,
        shipping: shipping.cost,
        total,
      });
      await tx.query(
        `insert into public.commissions
           (order_id, store_id, gross_amount, discount_amount, shipping_amount, commission_base,
            rate_type, rate_value, commission_amount, net_amount, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          orderId,
          store.store_id,
          subtotal,
          discount,
          shipping.cost,
          commission.base,
          commission.rateType,
          commission.rateValue,
          commission.amount,
          commission.net,
          commission.amount > 0 ? 'pending' : 'waived',
        ],
      );

      // El carrito se vacía al confirmar el pedido
      await tx.query('delete from public.cart_items where cart_id = $1', [cart.id]);

      const order = await loadOrderDetails(tx, orderId);
      return {
        order,
        duplicate: false,
        store_owner_id: (
          await tx.query<{ owner_id: string }>('select owner_id from public.stores where id = $1', [
            store.store_id,
          ])
        ).rows[0]?.owner_id,
      };
    });

    // Notificaciones (en su propia transacción, con los claims del destinatario)
    if (result.store_owner_id) {
      await insertNotificationsAs(ctx.db, { sub: result.store_owner_id, role: 'store_owner' }, [
        {
          store_id: result.order.store_id,
          order_id: result.order.id,
          channel: 'in_app',
          template: 'order_created',
          payload: {
            code: result.order.code,
            customer_name: result.order.customer_name,
            total: result.order.total,
          },
        },
      ]);
    }
    if (ctx.user) {
      await insertNotificationsAs(ctx.db, { sub: ctx.user.id, role: 'customer' }, [
        {
          user_id: ctx.user.id,
          order_id: result.order.id,
          channel: 'in_app',
          template: 'order_received',
          payload: { code: result.order.code, total: result.order.total },
        },
      ]);
    }

    // WhatsApp: avisar al dueño/encargado, al comercio y al cliente
    try {
      const orderSource = {
        id: result.order.id,
        code: result.order.code,
        public_token: result.order.public_token,
        store_id: result.order.store_id,
        store_name: result.order.store_name,
        store_phone: result.order.store_phone,
        store_address: result.order.store_address,
        customer_name: result.order.customer_name,
        phone: result.order.phone,
        address: result.order.address,
        locality: result.order.locality,
        references: result.order.references,
        notes: result.order.notes,
        fulfillment_type: result.order.fulfillment_type,
        delivery_mode: result.order.delivery_mode,
        payment_method: result.order.payment_method,
        total: result.order.total,
        shipping_cost: result.order.shipping_cost,
        rider_name: result.order.rider_name,
        rider_phone: result.order.rider_phone,
        status: result.order.status,
        merchant_responsible: result.order.merchant_responsible,
        estimated_preparation_minutes: result.order.estimated_preparation_minutes,
        customer_id: ctx.user?.id ?? null,
        items: result.order.items.map((it: any) => ({
          name_snapshot: it.name_snapshot,
          quantity: it.quantity,
          line_total: it.line_total,
          notes: it.notes,
        })),
      };
      await notifyOrderWhatsApp(ctx.db, orderSource as any, {
        storeId: result.order.store_id,
      });
    } catch {
      // No bloquear la creación del pedido si falla el envío de WhatsApp
    }

    publish(channels.store(result.order.store_id), { order_id: result.order.id, event: 'created' });
    return result.order;
  }),
);

/* ------------------------------------------------------------------ */
/* Seguimiento público (enlace seguro)                                 */
/* ------------------------------------------------------------------ */
ordersRouter.get(
  '/track/:code',
  route(async (ctx, req) => {
    const code = String(req.params.code).toUpperCase();
    const token = (req.query.token as string) || '';
    if (!token) throw badRequest('Link de seguimiento incompleto');

    // Contexto interno: la validación se hace con el token público del pedido.
    const { rows } = await ctx.db.system.query(
      `select o.id, o.code, o.public_token, o.status, o.customer_name, o.phone, o.address, o.locality,
              o.reference_notes, o.notes, o.fulfillment_type, o.delivery_mode, o.subtotal, o.discount,
              o.shipping_cost, o.total, o.payment_method, o.payment_status, o.estimated_preparation_minutes,
              o.shipping_notes, o.merchant_responsible, o.placed_at, o.updated_at, o.store_id,
              s.name as store_name, s.phone as store_phone, s.address as store_address, s.locality as store_locality,
              r.full_name as rider_name, r.phone as rider_phone
         from public.orders o
         join public.stores s on s.id = o.store_id
         left join public.riders r on r.id = o.rider_id
        where upper(o.code) = $1 and o.public_token = $2`,
      [code, token],
    );
    if (!rows.length) throw notFound('No encontramos ese pedido con el enlace proporcionado');

    const items = await ctx.db.system.query(
      'select id, product_id, name_snapshot, price_snapshot, quantity, notes, line_total from public.order_items where order_id = $1 order by id',
      [rows[0].id],
    );
    const history = await ctx.db.system.query(
      'select status, note, actor_name, created_at from public.order_status_history where order_id = $1 order by created_at',
      [rows[0].id],
    );

    return mapOrder(rows[0], items.rows, history.rows);
  }),
);

/* ------------------------------------------------------------------ */
/* Pedidos del cliente                                                 */
/* ------------------------------------------------------------------ */
ordersRouter.get(
  '/mine',
  route(async (ctx) => {
    if (!ctx.user) throw notFound('Necesitás iniciar sesión');
    const { rows } = await ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);
      return tx.query(
        `select ${ORDER_SELECT} from public.orders o
           join public.stores s on s.id = o.store_id
           left join public.riders r on r.id = o.rider_id
          where o.customer_id = $1
          order by o.placed_at desc`,
        [ctx.user!.id],
      );
    });
    return { items: rows.map((r: any) => mapOrder(r)) };
  }),
);

ordersRouter.get(
  '/:id',
  route(async (ctx, req) => {
    if (!ctx.user) throw notFound('Necesitás iniciar sesión');
    return ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);
      return loadOrderDetails(tx, String(req.params.id));
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Cancelación por el cliente                                          */
/* ------------------------------------------------------------------ */
ordersRouter.post(
  '/:id/cancel',
  route(async (ctx, req) => {
    if (!ctx.user) throw notFound('Necesitás iniciar sesión');
    const reason = String(req.body?.reason ?? '').slice(0, 500) || 'Cancelado por el cliente';
    return ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);
      const current = await tx.query<{ id: string; status: string; customer_id: string | null }>(
        'select id, status, customer_id from public.orders where id = $1',
        [String(req.params.id)],
      );
      if (!current.rows.length) throw notFound('El pedido no existe');
      if (current.rows[0].customer_id !== ctx.user!.id) {
        throw notFound('El pedido no existe');
      }
      await applyOrderStatus(tx, {
        orderId: String(req.params.id),
        status: 'cancelled',
        note: reason,
        cancelReason: reason,
        actorId: ctx.user!.id,
        actorName: ctx.user!.full_name ?? ctx.user!.email,
        actorRole: 'customer',
      });
      // Se devuelve el stock
      const items = await tx.query<{ product_id: string; quantity: number }>(
        'select product_id, quantity from public.order_items where order_id = $1',
        [String(req.params.id)],
      );
      for (const item of items.rows) {
        await tx.query('select public.restore_stock($1, $2, $3)', [
          item.product_id,
          Number(item.quantity),
          String(req.params.id),
        ]);
      }
      await tx.query(
        `update public.commissions set status = 'waived', updated_at = now() where order_id = $1`,
        [String(req.params.id)],
      );
      return loadOrderDetails(tx, String(req.params.id));
    });
  }),
);
