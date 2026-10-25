import { Router } from 'express';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { intParam, route } from '../http/router.js';
import { notFound } from '../lib/errors.js';
import { mapProduct, mapStore, PRODUCT_SELECT, STORE_SELECT } from './mappers.js';

/**
 * Catálogo público (Etapa 1).
 * Todas las consultas corren con el rol restringido: RLS filtra lo que es
 * visible para el público (comercios y productos activos).
 */
export const catalogRouter = Router();

async function withPublic<T>(db: any, guestToken: string | null, fn: (tx: DbExecutor) => Promise<T>) {
  return db.transaction(async (tx: DbExecutor) => {
    await applyClaims(tx, { guest_token: guestToken });
    return fn(tx);
  });
}

const ACTIVE_STORE = "s.status = 'active' and s.deleted_at is null";
const ACTIVE_PRODUCT = "p.status = 'active' and p.deleted_at is null";

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */
catalogRouter.get(
  '/home',
  route(async (ctx) => {
    return withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const [categories, stores, banners, promotions, popular, newest, unaffiliated, settings] = await Promise.all([
        tx.query(
          `select c.id, c.name, c.slug, c.icon_url, c.sort_order, c.active,
                  (select count(*) from public.stores s2
                    where s2.category_id = c.id and s2.status = 'active' and s2.deleted_at is null) as stores_count,
                  (select count(*) from public.products p2 join public.stores s3 on s3.id = p2.store_id
                    where p2.category_id = c.id and p2.status = 'active' and s3.status = 'active') as products_count
             from public.categories c
            where c.active = true
            order by c.sort_order, c.name`,
        ),
        tx.query(
          `select ${STORE_SELECT},
                  c.name as category_name,
                  (select count(*) from public.products p where p.store_id = s.id and p.status = 'active' and p.deleted_at is null) as products_count,
                  exists (
                    select 1 from public.ad_campaigns ac
                     where ac.store_id = s.id and ac.status = 'active'
                       and ac.starts_at <= now() and ac.ends_at >= now()
                       and ac.placement in ('home_banner','category_featured')
                  ) as is_sponsored
             from public.stores s
             left join public.categories c on c.id = s.category_id
            where ${ACTIVE_STORE}
            order by s.featured desc, s.rating desc, s.created_at desc
            limit 8`,
        ),
        tx.query(
          `select b.id, b.title, b.subtitle, b.image_url, b.link_url, b.placement, b.sort_order,
                  exists (
                    select 1 from public.ad_campaigns ac
                     where ac.banner_id = b.id and ac.status = 'active'
                       and ac.starts_at <= now() and ac.ends_at >= now()
                  ) as is_sponsored
             from public.banners b
            where b.active = true
              and (b.starts_at is null or b.starts_at <= now())
              and (b.ends_at is null or b.ends_at >= now())
            order by b.sort_order, b.created_at desc
            limit 8`,
        ),
        tx.query(
          `select pr.id, pr.title, pr.description, pr.discount_type, pr.discount_value, pr.min_subtotal,
                  pr.store_id, s.name as store_name, s.slug as store_slug,
                  (pr.store_id is null) as is_global
             from public.promotions pr
             left join public.stores s on s.id = pr.store_id
            where pr.active = true
              and (pr.starts_at is null or pr.starts_at <= now())
              and (pr.ends_at is null or pr.ends_at >= now())
              and (pr.store_id is null or (s.status = 'active' and s.deleted_at is null))
            order by (pr.store_id is null) desc, pr.created_at desc
            limit 8`,
        ),
        tx.query(
          `select ${PRODUCT_SELECT}, s.name as store_name, s.slug as store_slug
             from public.products p
             join public.stores s on s.id = p.store_id
            where ${ACTIVE_PRODUCT} and ${ACTIVE_STORE} and p.is_available = true
            order by p.featured desc, p.created_at desc
            limit 8`,
        ),
        tx.query(
          `select ${PRODUCT_SELECT}, s.name as store_name, s.slug as store_slug
             from public.products p
             join public.stores s on s.id = p.store_id
            where ${ACTIVE_PRODUCT} and ${ACTIVE_STORE} and p.is_available = true
            order by p.created_at desc
            limit 8`,
        ),
        tx.query(
          `select pp.id, pp.name, pp.description, pp.price, pp.stock, pp.image_url,
                  pp.category_id, c.name as category_name, pp.is_available, pp.featured,
                  pp.status, pp.created_at, null::uuid as store_id, null::text as store_name, null::text as store_slug
             from public.platform_products pp
             left join public.categories c on c.id = pp.category_id
            where pp.status = 'active' and pp.deleted_at is null and pp.is_available = true
            order by pp.created_at desc
            limit 8`,
        ),
        tx.query(`select key, value from public.settings where key in
                  ('contact','social','coverage','hours','platform','payment_methods','features')`),
      ]);

      return {
        categories: categories.rows.map((r: any) => ({
          ...r,
          stores_count: Number(r.stores_count ?? 0),
          products_count: Number(r.products_count ?? 0),
        })),
        stores: stores.rows.map(mapStore),
        banners: banners.rows,
        promotions: promotions.rows,
        popular: popular.rows.map(mapProduct),
        newest: newest.rows.map(mapProduct),
        unaffiliated: unaffiliated.rows.map(mapProduct),
        settings: Object.fromEntries(settings.rows.map((r: any) => [r.key, r.value])),
      };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Categorías                                                          */
/* ------------------------------------------------------------------ */
catalogRouter.get(
  '/categories',
  route(async (ctx) =>
    withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const { rows } = await tx.query(
        `select c.id, c.name, c.slug, c.icon_url, c.sort_order, c.active,
                (select count(*) from public.stores s
                  where s.category_id = c.id and s.status = 'active' and s.deleted_at is null) as stores_count,
                (select count(*) from public.products p join public.stores s2 on s2.id = p.store_id
                  where p.category_id = c.id and p.status = 'active' and s2.status = 'active') as products_count
           from public.categories c
          where c.active = true
          order by c.sort_order, c.name`,
      );
      return {
        items: rows.map((r: any) => ({
          ...r,
          stores_count: Number(r.stores_count ?? 0),
          products_count: Number(r.products_count ?? 0),
        })),
      };
    }),
  ),
);

/* ------------------------------------------------------------------ */
/* Comercios                                                           */
/* ------------------------------------------------------------------ */
catalogRouter.get(
  '/stores',
  route(async (ctx, req) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const page = Math.max(1, intParam(req.query.page, 1));
    const pageSize = Math.min(60, Math.max(1, intParam(req.query.pageSize, 12)));

    return withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const params: unknown[] = [];
      const where: string[] = [ACTIVE_STORE];
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where.push(`(lower(s.name) like $${params.length} or lower(coalesce(s.description,'')) like $${params.length})`);
      }
      if (category) {
        params.push(category);
        where.push(`s.category_id = $${params.length}`);
      }
      const whereSql = where.join(' and ');

      const rows = await tx.query(
        `select ${STORE_SELECT}, c.name as category_name,
                (select count(*) from public.products p where p.store_id = s.id and p.status = 'active' and p.deleted_at is null) as products_count,
                exists (
                  select 1 from public.ad_campaigns ac
                   where ac.store_id = s.id and ac.status = 'active'
                     and ac.starts_at <= now() and ac.ends_at >= now()
                ) as is_sponsored
           from public.stores s
           left join public.categories c on c.id = s.category_id
          where ${whereSql}
          order by s.rating desc, s.created_at desc
          limit ${pageSize} offset ${(page - 1) * pageSize}`,
        params,
      );
      const count = await tx.query(`select count(*)::int as total from public.stores s where ${whereSql}`, params);
      return {
        items: rows.rows.map(mapStore),
        total: count.rows[0]?.total ?? 0,
        page,
        page_size: pageSize,
      };
    });
  }),
);

catalogRouter.get(
  '/stores/:slug',
  route(async (ctx, req) => {
    const slug = String(req.params.slug);
    return withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const store = await tx.query(
        `select ${STORE_SELECT}, c.name as category_name,
                (select count(*) from public.products p where p.store_id = s.id and p.status = 'active' and p.deleted_at is null) as products_count
           from public.stores s
           left join public.categories c on c.id = s.category_id
          where s.slug = $1 and s.deleted_at is null`,
        [slug],
      );
      const row = store.rows[0];
      if (!row) throw notFound('El comercio no existe o ya no está disponible');

      const [products, promos, categories] = await Promise.all([
        tx.query(
          `select ${PRODUCT_SELECT}, s.name as store_name, s.slug as store_slug
             from public.products p join public.stores s on s.id = p.store_id
            where p.store_id = $1 and ${ACTIVE_PRODUCT}
            order by p.featured desc, p.name`,
          [row.id],
        ),
        tx.query(
          `select id, title, description, discount_type, discount_value, min_subtotal
             from public.promotions
            where active = true and store_id = $1
              and (starts_at is null or starts_at <= now())
              and (ends_at is null or ends_at >= now())`,
          [row.id],
        ),
        tx.query(
          `select c.id, c.name, c.slug,
                  (select count(*) from public.products p where p.category_id = c.id and p.store_id = $1 and p.status = 'active') as products_count
             from public.categories c
            where c.active = true
              and exists (select 1 from public.products p2 where p2.category_id = c.id and p2.store_id = $1 and p2.status = 'active')
            order by c.sort_order, c.name`,
          [row.id],
        ),
      ]);

      return {
        store: mapStore(row),
        products: products.rows.map(mapProduct),
        promotions: promos.rows,
        categories: categories.rows.map((c: any) => ({ ...c, products_count: Number(c.products_count) })),
      };
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */
catalogRouter.get(
  '/products',
  route(async (ctx, req) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const storeId = typeof req.query.store === 'string' ? req.query.store : '';
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'popular';
    const page = Math.max(1, intParam(req.query.page, 1));
    const pageSize = Math.min(60, Math.max(1, intParam(req.query.pageSize, 12)));

    return withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const params: unknown[] = [];
      const where: string[] = [ACTIVE_PRODUCT, ACTIVE_STORE, 'p.is_available = true'];
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where.push(`(lower(p.name) like $${params.length} or lower(coalesce(p.description,'')) like $${params.length})`);
      }
      if (category) {
        params.push(category);
        where.push(`p.category_id = $${params.length}`);
      }
      if (storeId) {
        params.push(storeId);
        where.push(`p.store_id = $${params.length}`);
      }
      const whereSql = where.join(' and ');
      const order =
        sort === 'price_asc'
          ? 'p.price asc'
          : sort === 'price_desc'
            ? 'p.price desc'
            : sort === 'new'
              ? 'p.created_at desc'
              : 'p.featured desc, p.created_at desc';

      const rows = await tx.query(
        `select ${PRODUCT_SELECT}, s.name as store_name, s.slug as store_slug
           from public.products p join public.stores s on s.id = p.store_id
          where ${whereSql}
          order by ${order}
          limit ${pageSize} offset ${(page - 1) * pageSize}`,
        params,
      );
      const count = await tx.query(
        `select count(*)::int as total from public.products p join public.stores s on s.id = p.store_id where ${whereSql}`,
        params,
      );
      return {
        items: rows.rows.map(mapProduct),
        total: count.rows[0]?.total ?? 0,
        page,
        page_size: pageSize,
      };
    });
  }),
);

catalogRouter.get(
  '/products/:id',
  route(async (ctx, req) => {
    const id = String(req.params.id);
    return withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const { rows } = await tx.query(
        `select ${PRODUCT_SELECT}, s.name as store_name, s.slug as store_slug,
                s.logo_url as store_logo_url, s.is_open, s.open_hours, s.locality, s.status as store_status
           from public.products p join public.stores s on s.id = p.store_id
          where p.id = $1`,
        [id],
      );
      if (!rows.length) throw notFound('El producto no existe');
      const product = mapProduct(rows[0]);
      if (rows[0].store_status === 'active') {
        product.store_id = rows[0].store_id ?? null;
      }
      return product;
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Búsqueda global                                                     */
/* ------------------------------------------------------------------ */
catalogRouter.get(
  '/search',
  route(async (ctx, req) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return { stores: [], products: [] };
    return withPublic(ctx.db, ctx.guestToken, async (tx) => {
      const pattern = `%${q.toLowerCase()}%`;
      const [stores, products] = await Promise.all([
        tx.query(
          `select ${STORE_SELECT}, c.name as category_name
             from public.stores s left join public.categories c on c.id = s.category_id
            where ${ACTIVE_STORE} and (lower(s.name) like $1 or lower(coalesce(s.description,'')) like $1)
            order by s.rating desc limit 8`,
          [pattern],
        ),
        tx.query(
          `select ${PRODUCT_SELECT}, s.name as store_name, s.slug as store_slug
             from public.products p join public.stores s on s.id = p.store_id
            where ${ACTIVE_PRODUCT} and ${ACTIVE_STORE}
              and (lower(p.name) like $1 or lower(coalesce(p.description,'')) like $1)
            order by p.featured desc limit 12`,
          [pattern],
        ),
      ]);
      return { stores: stores.rows.map(mapStore), products: products.rows.map(mapProduct) };
    });
  }),
);
