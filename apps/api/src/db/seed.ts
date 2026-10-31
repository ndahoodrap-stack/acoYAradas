import path from 'node:path';
import { config } from '../config.js';
import { createDatabase } from './factory.js';
import { applyClaims } from './index.js';
import type { Database } from './index.js';
import { hashPassword } from '../auth/password.js';
import { DEFAULT_CATEGORIES } from '@acoyaradas/shared';

/**
 * Datos de demostración (claramente identificados).
 * Uso: `npm run db:seed`
 */

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const STORE_OWNER_ID = '22222222-2222-4222-8222-222222222222';
const ALBEMA_ID = '33333333-3333-4333-8333-333333333333';

export const DEMO_PASSWORD = 'Demo1234!';

interface SeedUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  password: string;
}

const USERS: SeedUser[] = [
  {
    id: ADMIN_ID,
    email: 'ndahoodrap@gmail.com',
    full_name: 'Albus Bro',
    phone: '+5491100000001',
    role: 'admin',
    password: DEMO_PASSWORD,
  },
  {
    id: STORE_OWNER_ID,
    email: 'iltano@acoyaradas.app',
    full_name: 'Restaurante iltano',
    phone: '+5491100000002',
    role: 'store_owner',
    password: DEMO_PASSWORD,
  },
  {
    id: ALBEMA_ID,
    email: 'albema@acoyaradas.app',
    full_name: 'Albema',
    phone: '+5491100000003',
    role: 'customer',
    password: DEMO_PASSWORD,
  },
];

const STORES = [
  {
    id: '77777777-7777-4777-8777-777777777771',
    owner: STORE_OWNER_ID,
    name: 'Restaurante iltano',
    slug: 'restaurante-iltano',
    category: 'gastronomia',
    description: 'Restaurante con entrega a domicilio',
    address: 'Av. San Martín 123',
    locality: 'San Carlos de Bolívar',
    phone: '+5491100000002',
    whatsapp: '+5491100000002',
    logo: '/placeholders/logo-iltano.svg',
    cover: '/placeholders/cover-iltano.svg',
    platform: true,
    merchant: true,
    prep: 30,
    cash: true,
    transfer: true,
    cod: true,
    featured: true,
  },
];

const PRODUCTS: Array<{ store: number; name: string; description: string; price: number; stock: number; image: string; category: string; featured: boolean }> = [];

const LEGAL_PAGES = [
  {
    slug: 'terminos',
    title: 'Términos y condiciones',
    body: `## Términos y condiciones de uso

Última actualización: pendiente de revisión legal.

1. **Objeto.** acoYAradas! es una plataforma que conecta clientes, comercios locales y repartidores.
2. **Rol de la plataforma.** acoYAradas! actúa como intermediario entre el cliente y el comercio. La relação comercial del pedido es entre el cliente y el comercio.
3. **Precios y pagos.** Los precios son los publicados por cada comercio. Los métodos de pago disponibles se configuran por comercio.
4. **Entregas.** Las condiciones de entrega dependen de la modalidad elegida por el comercio (entrega organizada por acoYAradas! o entrega propia del comercio).
5. **Disponibilidad.** Los horarios y la disponibilidad pueden variar. La plataforma muestra el estado del comercio en el momento de la compra.

> Documento de demostración. Debe ser revisado por un profesional legal antes de operar comercialmente en Argentina.`,
  },
  {
    slug: 'privacidad',
    title: 'Política de privacidad',
    body: `## Política de privacidad

Última actualización: pendiente de revisión legal.

- **Datos que recogemos:** nombre, teléfono, dirección de entrega, referencias y datos de la cuenta (email).
- **Para qué los usarmos:** gestionar pedidos, coordinar entregas y permitir el seguimiento.
- **Compartición:** los datos de entrega se comparten con el comercio y, cuando corresponde, con el repartidor asignado. No se almacenan datos de tarjetas bancarias.
- **Tus derechos:** podés solicitar acceso, rectificación o eliminación escribiendo a contacto@acoyaradas.app.

> Documento de demostración. Debe ser revisado por un profesional legal antes de operar comercialmente en Argentina.`,
  },
  {
    slug: 'comercios',
    title: 'Condiciones para comercios',
    body: `## Condiciones para comercios

- Registrás tu negocio, completás el formulario y la administración aprueba o rechaza la solicitud.
- Publicás tu catálogo, tus horarios, tus formas de entrega y los métodos de pago que aceptás.
- Podés contratar un abono mensual, publicidad y/o quedar sujeto a comisiones según la configuración vigente.
- Los pedidos de tu comercio sólo son visibles para vos y para la administración de la plataforma.

> Documento de demostración. Debe ser revisado por un profesional legal antes de operar comercialmente en Argentina.`,
  },
  {
    slug: 'devoluciones',
    title: 'Cancelaciones y devoluciones',
    body: `## Cancelaciones y devoluciones

- El cliente puede cancelar su pedido mientras el comercio no lo haya preparado.
- Si el comercio ya preparó el pedido, la cancelación se coordina directamente entre las partes.
- Los pagos confirmados se devuelven según el medio de pago y los plazos del proveedor o del banco.

> Documento de demostración. Debe ser revisado por un profesional legal antes de operar comercialmente en Argentina.`,
  },
  {
    slug: 'entregas',
    title: 'Condiciones de entrega',
    body: `## Condiciones de entrega

acoYAradas! ofrece dos modalidades:

1. **Entrega organizada por acoYAradas!:** la plataforma asigna un repartidor de su red.
2. **Entrega propia del comercio:** el comercio coordina su propia entrega o un servicio externo.

En ambos casos el cliente recibe un enlace seguro para consultar el estado del pedido.

> Documento de demostración. Debe ser revisado por un profesional legal antes de operar comercialmente en Argentina.`,
  },
  {
    slug: 'comisiones',
    title: 'Comisiones y publicidad',
    body: `## Comisiones y publicidad

- Las comisiones se calculan sobre la base configurada por la administración (importe de productos o total del pedido).
- El porcentaje o importe fijo por comercio se define en el panel de administración.
- La publicidad se contrata por campaña, con fechas de inicio y fin, e incluye registro de impresiones y clics.
- Los registros de pago internos no constituyen comprobantes hasta su confirmación.

> Documento de demostración. Debe ser revisado por un profesional legal antes de operar comercialmente en Argentina.`,
  },
];

/**
 * Carga los datos de demostración (claramente identificados) en una base ya migrada.
 * Es idempotente: se puede ejecutar varias veces sobre la misma base.
 * Usa db.system (contexto interno, propietario de tablas) para saltar RLS.
 */
export async function seedDemoData(db: Database): Promise<void> {
  const tx = db.system;

  // --- Guardia de seguridad: si ya hay datos reales, no hacer seed ---
  const existingUsers = await tx.query('select count(*) from public.profiles');
  const userCount = Number(existingUsers.rows[0]?.count ?? 0);
  if (userCount > 3) {  // Solo nuestros 3 usuarios permitidos
    console.log('[seed] Datos reales detectados (users > 3), saltando seed demo');
    return;
  }

    // --- Categorías -------------------------------------------------
    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      await tx.query(
        `insert into public.categories (name, slug, sort_order) values ($1,$2,$3)
         on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order`,
        [category.name, category.slug, index],
      );
    }
    const categories = await tx.query<{ id: string; slug: string }>(
      'select id, slug from public.categories',
    );
    const categoryId = (slug: string) => categories.rows.find((c) => c.slug === slug)?.id ?? null;

    // --- Zonas de cobertura ----------------------------------------
    const zones = [
      { name: 'San Carlos de Bolívar', code: 'san-carlos-bolivar', description: 'Casco urbano y barrios' },
    ];
    for (const zone of zones) {
      await tx.query(
        `insert into public.coverage_zones (name, code, description) values ($1,$2,$3)
         on conflict (code) do nothing`,
        [zone.name, zone.code, zone.description],
      );
    }
    const zoneRows = await tx.query<{ id: string; code: string }>('select id, code from public.coverage_zones');
    const zoneId = (code: string) => zoneRows.rows.find((z) => z.code === code)?.id ?? null;

    // --- Tarifas de envío -------------------------------------------
    await tx.query(
      `insert into public.shipping_tariffs (name, zone_id, mode, base_price, price_per_km, min_price, max_price)
       select 'Envío San Carlos de Bolívar', $1, 'zone', 2500, 0, 2000, 6000
       where not exists (select 1 from public.shipping_tariffs where name = 'Envío San Carlos de Bolívar')`,
      [zoneId('san-carlos-bolivar')],
    );
    await tx.query(
      `insert into public.shipping_tariffs (name, mode, base_price, price_per_km, min_price, max_price)
       select 'Envío general', 'fixed', 3000, 0, 2500, 8000
       where not exists (select 1 from public.shipping_tariffs where name = 'Envío general')`,
    );

    // --- Planes comerciales ------------------------------------------
    const plans = [
      {
        name: 'Gratis',
        code: 'free',
        price: 0,
        billing_period: 'monthly',
        product_limit: 10,
        promo_limit: 1,
        features: ['10 productos', '1 promoción activa', 'Tienda pública'],
      },
      {
        name: 'Profesional',
        code: 'pro',
        price: 15000,
        billing_period: 'monthly',
        product_limit: 100,
        promo_limit: 10,
        features: ['100 productos', '10 promociones', 'Estadísticas de ventas'],
      },
      {
        name: 'Premium',
        code: 'premium',
        price: 35000,
        billing_period: 'monthly',
        product_limit: 1000,
        promo_limit: 50,
        features: ['Catálogo ilimitado', 'Campañas publicitarias', 'Atención prioritaria'],
      },
    ];
    for (const plan of plans) {
      await tx.query(
        `insert into public.plans (name, code, price, billing_period, product_limit, promo_limit, features)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (code) do update set name = excluded.name, price = excluded.price,
           product_limit = excluded.product_limit, promo_limit = excluded.promo_limit, features = excluded.features`,
        [plan.name, plan.code, plan.price, plan.billing_period, plan.product_limit, plan.promo_limit, plan.features],
      );
    }

    // --- Espacios publicitarios --------------------------------------
    const placements = [
      { key: 'home_banner', name: 'Banner en la página de inicio', price_per_day: 8000, description: 'Banner principal en el home' },
      { key: 'category_featured', name: 'Comercio destacado en categorías', price_per_day: 5000, description: 'Destacado dentro del listado de categorías' },
      { key: 'product_sponsored', name: 'Producto patrocinado', price_per_day: 3000, description: 'Producto promocionado en listados y detalle' },
    ];
    for (const placement of placements) {
      await tx.query(
        `insert into public.ad_placements (key, name, description, price_per_day)
         values ($1,$2,$3,$4) on conflict (key) do update set name = excluded.name, price_per_day = excluded.price_per_day`,
        [placement.key, placement.name, placement.description, placement.price_per_day],
      );
    }

    // --- Regla de comisión por defecto --------------------------------
    const commissionExists = await tx.query(
      `select 1 from public.commission_rules where store_id is null limit 1`,
    );
    if (!commissionExists.rows.length) {
      await tx.query(
        `insert into public.commission_rules (store_id, type, value, basis, active)
         values (null, 'percent', 8, 'product_total', true)`,
      );
    }

    // --- Usuarios de demostración --------------------------------------
    for (const user of USERS) {
      const exists = await tx.query('select id from public.profiles where id = $1', [user.id]);
      if (!exists.rows.length) {
        await tx.query(
          `insert into public.profiles (id, email, full_name, phone, role) values ($1,$2,$3,$4,$5)
           on conflict (email) do nothing`,
          [user.id, user.email, user.full_name, user.phone, user.role],
        );
      }
      if (config.authMode === 'local') {
        const localExists = await tx.query('select id from public.local_users where id = $1', [user.id]);
        if (!localExists.rows.length) {
          await tx.query(
            `insert into public.local_users (id, email, password_hash, role) values ($1,$2,$3,$4)
             on conflict (email) do nothing`,
            [user.id, user.email, await hashPassword(user.password), user.role],
          );
        }
      }
    }

    // --- Comercios de demostración --------------------------------------
    for (const store of STORES) {
      const exists = await tx.query('select id from public.stores where id = $1', [store.id]);
      if (!exists.rows.length) {
        await tx.query(
          `insert into public.stores
             (id, owner_id, name, slug, logo_url, cover_url, description, category_id, phone, whatsapp,
              address, locality, zone_id, status, is_open, featured, preparation_time_minutes,
              allows_platform_delivery, allows_merchant_delivery, allows_pickup, merchant_delivery_fee,
              merchant_delivery_notes, accepts_cash, accepts_transfer, accepts_cash_on_delivery,
              accepts_terms, verified, open_hours)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active', true, $14, $15, $16, $17, true,
                   3000, 'Envío gestionado por el comercio', $18, $19, $20, true, true, $21::jsonb)`,
          [
            store.id,
            store.owner,
            store.name,
            store.slug,
            store.logo,
            store.cover,
            store.description,
            categoryId(store.category),
            store.phone,
            store.whatsapp,
            store.address,
            store.locality,
            zoneId('san-carlos-bolivar'),
            store.featured,
            store.prep,
            store.platform,
            store.merchant,
            store.cash,
            store.transfer,
            store.cod,
            JSON.stringify({
              lunes: '09:00 - 21:00',
              martes: '09:00 - 21:00',
              miercoles: '09:00 - 21:00',
              jueves: '09:00 - 21:00',
              viernes: '09:00 - 23:00',
              sabado: '09:00 - 23:00',
              domingo: 'Cerrado',
            }),
          ],
        );
      }
      // Suscripción de bienvenida (plan gratuito)
      const freePlan = await tx.query<{ id: string }>(`select id from public.plans where code = 'free'`);
      const sub = await tx.query(
        `select 1 from public.subscriptions where store_id = $1 and status = 'active' limit 1`,
        [store.id],
      );
      if (!sub.rows.length && freePlan.rows.length) {
        await tx.query(
          `insert into public.subscriptions (store_id, plan_id, status, starts_at, ends_at, notes)
           values ($1,$2,'active', now(), now() + interval '1 month', 'Plan gratuito de bienvenida')`,
          [store.id, freePlan.rows[0].id],
        );
      }
    }

    // --- Productos de demostración --------------------------------------
    for (const [index, product] of PRODUCTS.entries()) {
      const store = STORES[product.store];
      const slug = `${product.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')}-${index}`;
      const exists = await tx.query('select id from public.products where store_id = $1 and slug = $2', [
        store.id,
        slug,
      ]);
      if (exists.rows.length) continue;
      await tx.query(
        `insert into public.products
           (store_id, name, slug, description, price, stock, category_id, image_url, is_available, featured, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8, true, $9, 'active')`,
        [
          store.id,
          product.name,
          slug,
          product.description,
          product.price,
          product.stock,
          categoryId(product.category),
          product.image,
          product.featured,
        ],
      );
    }

    // --- Promociones ----------------------------------------------------
    const promoExists = await tx.query(
      `select 1 from public.promotions where store_id = $1 and title = '10% off en tu primer pedido' limit 1`,
      [STORES[0].id],
    );
    if (!promoExists.rows.length) {
      await tx.query(
        `insert into public.promotions (store_id, title, description, discount_type, discount_value, min_subtotal, active)
         values ($1, '10% off en tu primer pedido', 'Descuento automático en el carrito', 'percent', 10, 5000, true)`,
        [STORES[0].id],
      );
    }

    // --- Campaña publicitaria de demostración ------------------------------
    const campaignExists = await tx.query(
      `select 1 from public.ad_campaigns where store_id = $1 and title = 'iltano 2x1 los martes' limit 1`,
      [STORES[0].id],
    );
    if (!campaignExists.rows.length) {
      await tx.query(
        `insert into public.ad_campaigns
           (store_id, placement, title, body, image_url, link_url, starts_at, ends_at, price, status, created_by)
         values ($1,'home_banner','iltano 2x1 los martes','Promoción patrocinada de ejemplo',
                 '/placeholders/cover-iltano.svg','/comercios/restaurante-iltano',
                 now() - interval '1 day', now() + interval '30 days', 240000, 'active', $2)`,
        [STORES[0].id, ADMIN_ID],
      );
    }

    // --- Banners ----------------------------------------------------------
    const bannerExists = await tx.query(`select 1 from public.banners where title = 'Bienvenido a acoYAradas!' limit 1`);
    if (!bannerExists.rows.length) {
      await tx.query(
        `insert into public.banners (title, subtitle, image_url, link_url, placement, sort_order, active)
         values ('Bienvenido a acoYAradas!','Comercios de tu zona, a un click','/placeholders/cover-iltano.svg','/','home_banner', 0, true)`,
      );
    }

    // --- Configuración de la plataforma ------------------------------------
    const settings: Record<string, unknown> = {
      contact: {
        email: config.platform.contactEmail,
        phone: config.platform.contactPhone,
        whatsapp: config.platform.contactPhone,
      },
      coverage: {
        text: config.platform.coverageText,
        zones: zones.map((z) => ({ name: z.name, description: z.description })),
      },
      hours: { text: config.platform.hoursText },
      social: { instagram: '', facebook: '', tiktok: '' },
      features: {
        guest_checkout: true,
        platform_delivery: true,
        merchant_delivery: false,
        subscriptions: false,
        advertising: true,
        commissions: true,
      },
      payment_methods: [
        { key: 'cash', label: 'Efectivo', enabled: true },
        { key: 'transfer', label: 'Transferencia bancaria', enabled: true },
      ],
      legal_note:
        'Los textos legales son de demostración y deben ser revisados por un profesional legal antes de operar comercialmente en Argentina.',
      transfer_cvu: '0000003100000758197056',
    };
    for (const [key, value] of Object.entries(settings)) {
      await tx.query(
        `insert into public.settings (key, value) values ($1,$2::jsonb)
         on conflict (key) do update set value = excluded.value`,
        [key, JSON.stringify(value)],
      );
    }

    // --- Páginas legales ---------------------------------------------------
    for (const page of LEGAL_PAGES) {
      await tx.query(
        `insert into public.legal_pages (slug, title, body) values ($1,$2,$3)
         on conflict (slug) do update set title = excluded.title, body = excluded.body`,
        [page.slug, page.title, page.body],
      );
    }

    // --- Registro de auditoría del seed -------------------------------------
    await tx.query(
      `insert into public.audit_log (actor_id, actor_role, actor_name, action, entity_type, entity_id, metadata)
       values ($1,'admin','Seed de demostración','seed_executed','system','seed', $2::jsonb)`,
      [ADMIN_ID, JSON.stringify({ demo: true })],
    );
  }

async function main() {
  const db = await createDatabase();
  console.log('[seed] motor:', db.kind);
  await seedDemoData(db);
  await db.close();

  console.log('\n[seed] datos de demostración cargados.');
  console.log('  Cuentas (contraseña para todas: Demo1234!)');
  console.log('   · Administrador : ndahoodrap@gmail.com (Albus Bro)');
  console.log('   · Comercio      : iltano@acoyaradas.app (Restaurante iltano)');
  console.log('   · Cliente       : albema@acoyaradas.app (Albema)');
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  main().catch((err) => {
    console.error('[seed] error:', err);
    process.exit(1);
  });
}
