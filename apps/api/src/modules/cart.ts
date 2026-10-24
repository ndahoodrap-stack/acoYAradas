import { Router } from 'express';
import { z } from 'zod';
import type { Claims, DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { route, validate } from '../http/router.js';
import { conflict, notFound } from '../lib/errors.js';
import { guestToken as newGuestToken } from '../lib/ids.js';
import { money } from '../lib/money.js';

/**
 * Carrito de compras (Etapa 1).
 * Regla de negocio: un pedido corresponde a un solo comercio. Si se intenta
 * mezclar productos de negocios distintos se informa con claridad y el
 * cliente puede cambiar de comercio de forma explícita (replace=true),
 * sin perder el carrito actual por accidente.
 */
export const cartRouter = Router();

const addItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(500).default(1),
  notes: z.string().max(500).optional().default(''),
  replace: z.boolean().optional().default(false),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(0).max(500),
});

interface CartRow {
  id: string;
  store_id: string | null;
}

async function run<T>(
  db: any,
  claims: Claims,
  fn: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx: DbExecutor) => {
    await applyClaims(tx, claims);
    return fn(tx);
  });
}

async function findOrCreateCart(
  tx: DbExecutor,
  userId: string | null,
  guest: string | null,
): Promise<CartRow> {
  if (userId) {
    const existing = await tx.query<CartRow>(
      'select id, store_id from public.carts where user_id = $1 limit 1',
      [userId],
    );
    if (existing.rows.length) return existing.rows[0];
    const created = await tx.query<CartRow>(
      'insert into public.carts (user_id) values ($1) returning id, store_id',
      [userId],
    );
    return created.rows[0];
  }
  if (guest) {
    const existing = await tx.query<CartRow>(
      'select id, store_id from public.carts where guest_token = $1 limit 1',
      [guest],
    );
    if (existing.rows.length) return existing.rows[0];
  }
  const created = await tx.query<CartRow>(
    'insert into public.carts (guest_token) values ($1) returning id, store_id',
    [guest],
  );
  return created.rows[0];
}

async function readCart(tx: DbExecutor, cartId: string) {
  const items = await tx.query(
    `select ci.id, ci.product_id, ci.quantity, ci.notes,
            p.name as product_name, p.price, p.image_url, p.stock, p.is_available, p.status,
            p.store_id, s.name as store_name, s.slug as store_slug, s.is_open, s.status as store_status
       from public.cart_items ci
       join public.products p on p.id = ci.product_id
       join public.stores s on s.id = p.store_id
      where ci.cart_id = $1
      order by ci.created_at`,
    [cartId],
  );

  const mapped = items.rows.map((r: any) => ({
    id: r.id,
    product_id: r.product_id,
    store_id: r.store_id,
    store_name: r.store_name,
    store_slug: r.store_slug,
    product_name: r.product_name,
    price: Number(r.price),
    image_url: r.image_url,
    quantity: Number(r.quantity),
    notes: r.notes,
    stock: Number(r.stock),
    available: r.is_available && r.status === 'active',
    line_total: money(Number(r.price) * Number(r.quantity)),
  }));

  const byStore = new Map<string, { store_id: string; store_name: string; items: number }>();
  let subtotal = 0;
  for (const item of mapped) {
    subtotal += item.line_total;
    const entry = byStore.get(item.store_id) ?? {
      store_id: item.store_id,
      store_name: item.store_name,
      items: 0,
    };
    entry.items += 1;
    byStore.set(item.store_id, entry);
  }
  const stores = [...byStore.values()];
  const primary = stores[0] ?? null;

  return {
    items: mapped,
    subtotal: money(subtotal),
    store_id: primary?.store_id ?? null,
    store_name: primary?.store_name ?? null,
    other_stores: stores.length > 1 ? stores.slice(1) : [],
  };
}

async function syncCartStore(tx: DbExecutor, cartId: string) {
  const rows = await tx.query<{ store_id: string }>(
    `select distinct p.store_id from public.cart_items ci
       join public.products p on p.id = ci.product_id
      where ci.cart_id = $1`,
    [cartId],
  );
  await tx.query('update public.carts set store_id = $2, updated_at = now() where id = $1', [
    cartId,
    rows.rows[0]?.store_id ?? null,
  ]);
}

/* ------------------------------------------------------------------ */

cartRouter.get(
  '/',
  route(async (ctx, req, res) => {
    let guest = ctx.guestToken;
    if (!ctx.user && !guest) {
      guest = newGuestToken();
      res.setHeader('x-guest-token', guest);
    }
    const claims: Claims = { sub: ctx.user?.id ?? null, guest_token: guest };
    return run(ctx.db, claims, async (tx) => {
      const cart = await findOrCreateCart(tx, ctx.user?.id ?? null, guest);
      return readCart(tx, cart.id);
    });
  }),
);

cartRouter.post(
  '/items',
  route(async (ctx, req, res) => {
    const body = validate(addItemSchema, req.body);
    let guest = ctx.guestToken;
    if (!ctx.user && !guest) {
      guest = newGuestToken();
      res.setHeader('x-guest-token', guest);
    }
    const claims: Claims = { sub: ctx.user?.id ?? null, guest_token: guest };

    return run(ctx.db, claims, async (tx) => {
      const product = await tx.query(
        `select p.id, p.store_id, p.name, p.price, p.stock, p.status, p.is_available,
                s.name as store_name, s.slug as store_slug, s.status as store_status
           from public.products p join public.stores s on s.id = p.store_id
          where p.id = $1 and p.deleted_at is null`,
        [body.product_id],
      );
      const row = product.rows[0];
      if (!row) throw notFound('El producto no existe');
      if (row.status !== 'active' || row.store_status !== 'active') {
        throw conflict('El producto no está disponible');
      }

      const cart = await findOrCreateCart(tx, ctx.user?.id ?? null, guest);

      const current = await tx.query<{ store_id: string; store_name: string; items: number }>(
        `select distinct p.store_id, s.name as store_name, count(*)::int as items
           from public.cart_items ci
           join public.products p on p.id = ci.product_id
           join public.stores s on s.id = p.store_id
          where ci.cart_id = $1
          group by p.store_id, s.name`,
        [cart.id],
      );

      const other = current.rows.find((c) => c.store_id !== row.store_id);
      if (other && !body.replace) {
        throw conflict(
          `Tu carrito tiene productos de ${other.store_name}. Un pedido corresponde a un solo comercio.`,
          {
            reason: 'mixed_stores',
            current_store: { id: other.store_id, name: other.store_name, items: other.items },
            new_store: { id: row.store_id, name: row.store_name },
          },
        );
      }
      if (other && body.replace) {
        await tx.query('delete from public.cart_items where cart_id = $1', [cart.id]);
      }

      const existing = await tx.query<{ id: string; quantity: number }>(
        'select id, quantity from public.cart_items where cart_id = $1 and product_id = $2',
        [cart.id, body.product_id],
      );
      const currentQty = existing.rows[0]?.quantity ?? 0;
      const desired = currentQty + body.quantity;
      if (Number(row.stock) < desired) {
        throw conflict(
          `Stock insuficiente: quedan ${row.stock} unidades disponibles`,
          { stock: Number(row.stock) },
        );
      }

      if (existing.rows.length) {
        await tx.query('update public.cart_items set quantity = $2, notes = $3, updated_at = now() where id = $1', [
          existing.rows[0].id,
          desired,
          body.notes || null,
        ]);
      } else {
        await tx.query(
          'insert into public.cart_items (cart_id, product_id, quantity, notes) values ($1,$2,$3,$4)',
          [cart.id, body.product_id, body.quantity, body.notes || null],
        );
      }
      await syncCartStore(tx, cart.id);
      return readCart(tx, cart.id);
    });
  }),
);

cartRouter.patch(
  '/items/:id',
  route(async (ctx, req, res) => {
    const body = validate(updateItemSchema, req.body);
    let guest = ctx.guestToken;
    if (!ctx.user && !guest) {
      guest = newGuestToken();
      res.setHeader('x-guest-token', guest);
    }
    const claims: Claims = { sub: ctx.user?.id ?? null, guest_token: guest };
    return run(ctx.db, claims, async (tx) => {
      const item = await tx.query<{ cart_id: string; product_id: string }>(
        'select cart_id, product_id from public.cart_items where id = $1',
        [String(req.params.id)],
      );
      if (!item.rows.length) throw notFound('El artículo no está en el carrito');
      const cart = await findOrCreateCart(tx, ctx.user?.id ?? null, guest);
      if (cart.id !== item.rows[0].cart_id) throw notFound('El artículo no está en el carrito');

      if (body.quantity === 0) {
        await tx.query('delete from public.cart_items where id = $1', [String(req.params.id)]);
      } else {
        const stock = await tx.query<{ stock: number }>(
          'select stock from public.products where id = $1',
          [item.rows[0].product_id],
        );
        if (Number(stock.rows[0]?.stock ?? 0) < body.quantity) {
          throw conflict(`Stock insuficiente: quedan ${stock.rows[0]?.stock} unidades`);
        }
        await tx.query('update public.cart_items set quantity = $2, updated_at = now() where id = $1', [
          String(req.params.id),
          body.quantity,
        ]);
      }
      await syncCartStore(tx, cart.id);
      return readCart(tx, cart.id);
    });
  }),
);

cartRouter.delete(
  '/items/:id',
  route(async (ctx, req, res) => {
    let guest = ctx.guestToken;
    if (!ctx.user && !guest) {
      guest = newGuestToken();
      res.setHeader('x-guest-token', guest);
    }
    const claims: Claims = { sub: ctx.user?.id ?? null, guest_token: guest };
    return run(ctx.db, claims, async (tx) => {
      const cart = await findOrCreateCart(tx, ctx.user?.id ?? null, guest);
      await tx.query('delete from public.cart_items where id = $1 and cart_id = $2', [
        String(req.params.id),
        cart.id,
      ]);
      await syncCartStore(tx, cart.id);
      return readCart(tx, cart.id);
    });
  }),
);

cartRouter.delete(
  '/',
  route(async (ctx, req, res) => {
    let guest = ctx.guestToken;
    if (!ctx.user && !guest) {
      guest = newGuestToken();
      res.setHeader('x-guest-token', guest);
    }
    const claims: Claims = { sub: ctx.user?.id ?? null, guest_token: guest };
    return run(ctx.db, claims, async (tx) => {
      const cart = await findOrCreateCart(tx, ctx.user?.id ?? null, guest);
      await tx.query('delete from public.cart_items where cart_id = $1', [cart.id]);
      await syncCartStore(tx, cart.id);
      return readCart(tx, cart.id);
    });
  }),
);

/** Fusiona el carrito de invitado con el del usuario al iniciar sesión. */
cartRouter.post(
  '/merge',
  route(async (ctx, req) => {
    if (!ctx.user) throw notFound('Necesitás iniciar sesión');
    const guest = (req.body?.guest_token as string) || ctx.guestToken;
    if (!guest) return { merged: 0 };
    const claims: Claims = { sub: ctx.user.id, guest_token: guest };
    return run(ctx.db, claims, async (tx) => {
      const guestCart = await tx.query<CartRow>(
        'select id, store_id from public.carts where guest_token = $1 limit 1',
        [guest],
      );
      if (!guestCart.rows.length) return { merged: 0 };
      const userCart = await findOrCreateCart(tx, ctx.user!.id, null);
      const guestItems = await tx.query<{ product_id: string; quantity: number; notes: string | null }>(
        'select product_id, quantity, notes from public.cart_items where cart_id = $1',
        [guestCart.rows[0].id],
      );
      let merged = 0;
      for (const item of guestItems.rows) {
        const existing = await tx.query<{ id: string; quantity: number }>(
          'select id, quantity from public.cart_items where cart_id = $1 and product_id = $2',
          [userCart.id, item.product_id],
        );
        if (existing.rows.length) {
          await tx.query('update public.cart_items set quantity = $2 where id = $1', [
            existing.rows[0].id,
            existing.rows[0].quantity + item.quantity,
          ]);
        } else {
          await tx.query(
            'insert into public.cart_items (cart_id, product_id, quantity, notes) values ($1,$2,$3,$4)',
            [userCart.id, item.product_id, item.quantity, item.notes],
          );
        }
        merged += 1;
      }
      await tx.query('delete from public.cart_items where cart_id = $1', [guestCart.rows[0].id]);
      await syncCartStore(tx, userCart.id);
      return { merged, cart: await readCart(tx, userCart.id) };
    });
  }),
);
