import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createClient,
  DEMO_ACCOUNTS,
  login,
  startTestServer,
  type RequestOptions,
  type TestServer,
} from './helpers.js';

/**
 * Etapa 6 — escenarios 2 y 8:
 *   2. Un comercio puede administrar sus productos sin acceder a los de otros.
 *   8. Las campañas publicitarias respetan sus fechas y estados.
 */
describe('Panel del comercio', () => {
  let server: TestServer;
  let client!: ReturnType<typeof createClient>;
  const api = (path: string, options?: RequestOptions) => client(path, options);

  let napoliToken = '';
  let palomarToken = '';
  let kioscoToken = '';
  let adminToken = '';
  let customerToken = '';

  let napoliId = '';
  let palomarId = '';
  let kioscoId = '';
  let napoliProducts = 0;
  let palomarProducts = 0;
  let palomarProductId = '';
  let kioscoProductId = '';

  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

  const clearCart = async () => {
    const cart = await api('/cart/', { token: customerToken });
    for (const item of cart.body.items ?? []) {
      await api(`/cart/items/${item.id}`, { method: 'DELETE', token: customerToken });
    }
  };

  const addToCart = async (productId: string, quantity = 1) =>
    api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: productId, quantity },
    });

  const checkout = (extra: Record<string, unknown> = {}) =>
    api('/orders/', {
      method: 'POST',
      token: customerToken,
      body: {
        customer_name: 'Cliente Demo',
        phone: '+5491100000004',
        address: 'Av. Corrientes 1234',
        locality: 'San Carlos de Bolívar',
        fulfillment_type: 'delivery',
        delivery_mode: 'platform',
        payment_method: 'cash',
        ...extra,
      },
    });

  beforeAll(async () => {
    server = await startTestServer();
    client = createClient(server.baseUrl);

    napoliToken = (await login(api, DEMO_ACCOUNTS.store)).access_token;
    palomarToken = (await login(api, DEMO_ACCOUNTS.store2)).access_token;
    kioscoToken = (await login(api, DEMO_ACCOUNTS.store3)).access_token;
    adminToken = (await login(api, DEMO_ACCOUNTS.admin)).access_token;
    customerToken = (await login(api, DEMO_ACCOUNTS.customer)).access_token;

    const napoli = await api('/store/profile', { token: napoliToken });
    const palomar = await api('/store/profile', { token: palomarToken });
    const kiosco = await api('/store/profile', { token: kioscoToken });
    napoliId = napoli.body.store.id;
    palomarId = palomar.body.store.id;
    kioscoId = kiosco.body.store.id;

    const napoliList = await api('/store/products', { token: napoliToken });
    const palomarList = await api('/store/products', { token: palomarToken });
    const kioscoList = await api('/store/products', { token: kioscoToken });
    napoliProducts = napoliList.body.items.length;
    palomarProducts = palomarList.body.items.length;
    palomarProductId = palomarList.body.items[0].id;
    kioscoProductId = kioscoList.body.items[0].id;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCart();
  });

  /* ---------------------------------------------------------------- */
  /* Escenario 2 — aislamiento de productos entre comercios           */
  /* ---------------------------------------------------------------- */
  it('El panel devuelve únicamente los productos del propio comercio', async () => {
    const napoli = await api('/store/products', { token: napoliToken });
    expect(napoli.status).toBe(200);
    expect(napoli.body.items.length).toBe(napoliProducts);
    expect(napoli.body.items.every((p: any) => p.store_id === napoliId)).toBe(true);
    expect(napoli.body.items.some((p: any) => p.id === palomarProductId)).toBe(false);
    expect(napoli.body.items.some((p: any) => p.id === kioscoProductId)).toBe(false);

    const palomar = await api('/store/products', { token: palomarToken });
    expect(palomar.body.items.length).toBe(palomarProducts);
    expect(palomar.body.items.every((p: any) => p.store_id === palomarId)).toBe(true);
    expect(palomar.body.items.some((p: any) => p.id === kioscoProductId)).toBe(false);
  });

  it('Un comercio no puede modificar ni borrar productos de otro', async () => {
    const patch = await api(`/store/products/${palomarProductId}`, {
      method: 'PATCH',
      token: napoliToken,
      body: { price: 1 },
    });
    expect(patch.status).toBe(404);

    const del = await api(`/store/products/${palomarProductId}`, {
      method: 'DELETE',
      token: napoliToken,
    });
    expect(del.status).toBe(404);

    // El producto del otro comercio sigue intacto
    const palomar = await api('/store/products', { token: palomarToken });
    expect(palomar.body.items.some((p: any) => p.id === palomarProductId)).toBe(true);
  });

  it('El comercio crea, edita y desactiva sus propios productos', async () => {
    const created = await api('/store/products', {
      method: 'POST',
      token: napoliToken,
      body: {
        name: 'Flan casero x1',
        description: 'Flan con dulce de leche casero',
        price: 4200,
        stock: 12,
        is_available: true,
      },
    });
    expect(created.status).toBe(200);
    expect(created.body.store_id).toBe(napoliId);
    expect(Number(created.body.price)).toBe(4200);

    const updated = await api(`/store/products/${created.body.id}`, {
      method: 'PATCH',
      token: napoliToken,
      body: { price: 4500, stock: 8 },
    });
    expect(updated.status).toBe(200);
    expect(Number(updated.body.price)).toBe(4500);
    expect(Number(updated.body.stock)).toBe(8);

    // Aparece en la página pública del comercio
    const publicStore = await api('/stores/pizzeria-napoli');
    expect(publicStore.body.products.some((p: any) => p.id === created.body.id)).toBe(true);

    // Desactivar = baja lógica: desaparece del panel y del catálogo público
    const removed = await api(`/store/products/${created.body.id}`, {
      method: 'DELETE',
      token: napoliToken,
    });
    expect(removed.status).toBe(200);

    const afterDelete = await api('/store/products', { token: napoliToken });
    expect(afterDelete.body.items.length).toBe(napoliProducts);

    const publicAfter = await api('/stores/pizzeria-napoli');
    expect(publicAfter.body.products.some((p: any) => p.id === created.body.id)).toBe(false);
  });

  it('El panel de pedidos sólo muestra los pedidos del propio comercio', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    const napoliProduct = napoliCatalog.body.products[0].id;
    await addToCart(napoliProduct, 1);
    const napoliOrder = await checkout();
    expect(napoliOrder.status).toBe(200);

    await clearCart();
    await addToCart(palomarProductId, 1);
    const palomarOrder = await checkout({ delivery_mode: 'merchant' });
    expect(palomarOrder.status).toBe(200);

    const napoliOrders = await api('/store/orders', { token: napoliToken });
    expect(napoliOrders.body.items.some((o: any) => o.code === napoliOrder.body.code)).toBe(true);
    expect(napoliOrders.body.items.some((o: any) => o.code === palomarOrder.body.code)).toBe(false);

    const palomarOrders = await api('/store/orders', { token: palomarToken });
    expect(palomarOrders.body.items.some((o: any) => o.code === palomarOrder.body.code)).toBe(true);
    expect(palomarOrders.body.items.some((o: any) => o.code === napoliOrder.body.code)).toBe(false);
  });

  it('Un comercio no puede tocar los pedidos de otro', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    await addToCart(napoliCatalog.body.products[0].id, 1);
    const order = await checkout();

    const attempt = await api(`/store/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: palomarToken,
      body: { status: 'confirmed' },
    });
    expect(attempt.status).toBe(404);

    // El pedido sigue pendiente: nadie lo confirmó por error
    const track = await api(`/orders/track/${order.body.code}?token=${order.body.public_token}`);
    expect(track.body.status).toBe('pending_confirmation');
  });

  it('Cada comercio administra únicamente sus promociones', async () => {
    const napoliPromos = await api('/store/promotions', { token: napoliToken });
    expect(napoliPromos.body.items.length).toBeGreaterThan(0);
    expect(napoliPromos.body.items.every((p: any) => p.store_id === napoliId)).toBe(true);

    const palomarPromos = await api('/store/promotions', { token: palomarToken });
    expect(palomarPromos.body.items.every((p: any) => p.store_id === palomarId)).toBe(true);
    expect(palomarPromos.body.items.some((p: any) => p.store_id === napoliId)).toBe(false);

    const created = await api('/store/promotions', {
      method: 'POST',
      token: palomarToken,
      body: {
        title: '15% off en El Palomar',
        discount_type: 'percent',
        discount_value: 15,
        min_subtotal: 3000,
        active: true,
      },
    });
    expect(created.status).toBe(200);
    expect(created.body.store_id).toBe(palomarId);

    // No puede editar la promoción de otro comercio
    const foreign = napoliPromos.body.items[0];
    const attempt = await api(`/store/promotions/${foreign.id}`, {
      method: 'PATCH',
      token: palomarToken,
      body: { title: 'secuestrada' },
    });
    expect(attempt.status).toBe(404);

    // Y sí puede dar de baja la propia
    const removed = await api(`/store/promotions/${created.body.id}`, {
      method: 'DELETE',
      token: palomarToken,
    });
    expect(removed.status).toBe(200);
    const after = await api('/store/promotions', { token: palomarToken });
    expect(after.body.items.some((p: any) => p.id === created.body.id && p.active)).toBe(false);
  });

  it('Las estadísticas y las finanzas del comercio sólo incluyen sus datos', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    await addToCart(napoliCatalog.body.products[0].id, 1);
    await checkout();

    const stats = await api('/store/stats', { token: napoliToken });
    expect(stats.status).toBe(200);
    expect(Number(stats.body.sales.orders)).toBeGreaterThan(0);
    expect(Number(stats.body.sales.total)).toBeGreaterThan(0);

    const finance = await api('/store/finance', { token: napoliToken });
    expect(finance.status).toBe(200);
    expect(finance.body.subscriptions.length).toBeGreaterThan(0);
    expect(finance.body.subscriptions.every((s: any) => s.plan_name)).toBe(true);

    const palomarFinance = await api('/store/finance', { token: palomarToken });
    expect(palomarFinance.body.subscriptions.every((s: any) => s.plan_name)).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /* Escenario 8 — campañas publicitarias: fechas y estados           */
  /* ---------------------------------------------------------------- */
  /** Pausa todas las campañas activas del kiosco (para partir de un estado conocido). */
  const pauseKioscoCampaigns = async () => {
    const campaigns = await api('/store/campaigns', { token: kioscoToken });
    for (const campaign of campaigns.body.items ?? []) {
      if (campaign.status === 'active') {
        await api(`/admin/campaigns/${campaign.id}`, {
          method: 'PATCH',
          token: adminToken,
          body: { status: 'paused' },
        });
      }
    }
  };

  it('Una campaña creada por el comercio queda en estado pendiente hasta que la aprueba la administración', async () => {
    await pauseKioscoCampaigns();
    const created = await api('/store/campaigns', {
      method: 'POST',
      token: kioscoToken,
      body: {
        store_id: kioscoId,
        placement: 'home_banner',
        title: 'Kiosco 24 - combos',
        body: 'Promoción patrocinada de ejemplo',
        starts_at: iso(-1),
        ends_at: iso(30),
        price: 60000,
      },
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe('pending');
    expect(created.body.store_id).toBe(kioscoId);

    // El comercio ve su campaña, pero nadie más que el propio comercio y la administración
    const mine = await api('/store/campaigns', { token: kioscoToken });
    expect(mine.body.items.some((c: any) => c.id === created.body.id)).toBe(true);

    const napoliCampaigns = await api('/store/campaigns', { token: napoliToken });
    expect(napoliCampaigns.body.items.some((c: any) => c.id === created.body.id)).toBe(false);

    // Mientras está pendiente no se publica
    const home = await api('/home');
    const kiosco = home.body.stores.find((s: any) => s.id === kioscoId);
    expect(kiosco.is_sponsored).toBe(false);

    // La administración la aprueba
    const approved = await api(`/admin/campaigns/${created.body.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'active' },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('active');

    // Recién ahora el comercio aparece como patrocinado
    const homeAfter = await api('/home');
    const kioscoAfter = homeAfter.body.stores.find((s: any) => s.id === kioscoId);
    expect(kioscoAfter.is_sponsored).toBe(true);

    // Y la campaña queda visible para el administrador con su estado
    const adminCampaigns = await api('/admin/campaigns', { token: adminToken });
    const found = adminCampaigns.body.items.find((c: any) => c.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('active');
    expect(found.store_name).toBe('Kiosco 24');
  });

  it('Una campaña pausada deja de mostrarse como publicidad', async () => {
    await pauseKioscoCampaigns();
    const created = await api('/store/campaigns', {
      method: 'POST',
      token: kioscoToken,
      body: {
        store_id: kioscoId,
        placement: 'category_featured',
        title: 'Kiosco 24 - pausa',
        starts_at: iso(-1),
        ends_at: iso(30),
        price: 30000,
      },
    });
    await api(`/admin/campaigns/${created.body.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'active' },
    });
    let home = await api('/home');
    expect(home.body.stores.find((s: any) => s.id === kioscoId).is_sponsored).toBe(true);

    const paused = await api(`/admin/campaigns/${created.body.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'paused' },
    });
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe('paused');

    home = await api('/home');
    expect(home.body.stores.find((s: any) => s.id === kioscoId).is_sponsored).toBe(false);
  });

  it('Una campaña fuera de su período de fechas no se publica', async () => {
    await pauseKioscoCampaigns();
    // Comienza en el futuro
    const future = await api('/store/campaigns', {
      method: 'POST',
      token: kioscoToken,
      body: {
        store_id: kioscoId,
        placement: 'home_banner',
        title: 'Kiosco 24 - futura',
        starts_at: iso(10),
        ends_at: iso(40),
        price: 20000,
      },
    });
    await api(`/admin/campaigns/${future.body.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'active' },
    });

    // Ya terminó
    const past = await api('/store/campaigns', {
      method: 'POST',
      token: kioscoToken,
      body: {
        store_id: kioscoId,
        placement: 'home_banner',
        title: 'Kiosco 24 - vencida',
        starts_at: iso(-30),
        ends_at: iso(-10),
        price: 20000,
      },
    });
    await api(`/admin/campaigns/${past.body.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'active' },
    });

    const home = await api('/home');
    expect(home.body.stores.find((s: any) => s.id === kioscoId).is_sponsored).toBe(false);
  });

  it('El comercio no puede crear campañas para otro ni approving su propia campaña', async () => {
    const attempt = await api('/store/campaigns', {
      method: 'POST',
      token: kioscoToken,
      body: {
        store_id: napoliId,
        placement: 'home_banner',
        title: 'Campaña ajena',
        starts_at: iso(-1),
        ends_at: iso(10),
        price: 1000,
      },
    });
    expect(attempt.status).toBe(403);

    const own = await api('/store/campaigns', {
      method: 'POST',
      token: kioscoToken,
      body: {
        store_id: kioscoId,
        placement: 'home_banner',
        title: 'Kiosco 24 - auto-aprobada',
        starts_at: iso(-1),
        ends_at: iso(10),
        price: 1000,
      },
    });
    expect(own.body.status).toBe('pending');
    // El comercio no tiene endpoint para aprobar: sólo la administración.
    const selfApprove = await api(`/admin/campaigns/${own.body.id}`, {
      method: 'PATCH',
      token: kioscoToken,
      body: { status: 'active' },
    });
    expect(selfApprove.status).toBe(403);
  });

  it('Las impresiones y los clics quedan registrados por campaña', async () => {
    const campaigns = await api('/store/campaigns', { token: kioscoToken });
    const active = campaigns.body.items.find((c: any) => c.status === 'active');
    expect(active).toBeDefined();

    const impression = await api('/admin/ad-events', {
      method: 'POST',
      token: adminToken,
      body: { campaign_id: active.id, type: 'impression' },
    });
    expect(impression.status).toBe(200);
    expect(Number(impression.body.impressions)).toBeGreaterThan(0);

    const click = await api('/admin/ad-events', {
      method: 'POST',
      token: adminToken,
      body: { campaign_id: active.id, type: 'click' },
    });
    expect(click.status).toBe(200);
    expect(Number(click.body.clicks)).toBeGreaterThan(0);

    const events = await api('/admin/ad-events', { token: adminToken });
    expect(events.body.items.some((e: any) => e.campaign_id === active.id)).toBe(true);
  });
});
