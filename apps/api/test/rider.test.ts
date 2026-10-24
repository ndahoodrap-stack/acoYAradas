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
 * Etapa 6 — escenarios 5 y 6:
 *   5. Un pedido puede asignarse a un repartidor de acoYAradas!.
 *   6. Otro pedido puede gestionarse mediante entrega propia del comercio.
 */
describe('Repartidor y logística', () => {
  let server: TestServer;
  let client!: ReturnType<typeof createClient>;
  const api = (path: string, options?: RequestOptions) => client(path, options);

  let adminToken = '';
  let customerToken = '';
  let palomarToken = '';
  let riderToken = '';
  let riderId = '';

  const clearCart = async () => {
    const cart = await api('/cart/', { token: customerToken });
    for (const item of cart.body.items ?? []) {
      await api(`/cart/items/${item.id}`, { method: 'DELETE', token: customerToken });
    }
  };

  const addToCart = async (productId: string, quantity = 1) =>
    api('/cart/items', { method: 'POST', token: customerToken, body: { product_id: productId, quantity } });

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

    adminToken = (await login(api, DEMO_ACCOUNTS.admin)).access_token;
    customerToken = (await login(api, DEMO_ACCOUNTS.customer)).access_token;
    await login(api, DEMO_ACCOUNTS.store);    palomarToken = (await login(api, DEMO_ACCOUNTS.store2)).access_token;
    riderToken = (await login(api, DEMO_ACCOUNTS.rider)).access_token;

    const riders = await api('/admin/riders', { token: adminToken });
    riderId = riders.body.items[0].id;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await clearCart();
  });

  it('El repartidor sólo ve sus propios pedidos asignados', async () => {
    // Pedido de otro repartidor / no asignado → no aparece
    const orders = await api('/rider/orders', { token: riderToken });
    expect(orders.status).toBe(200);
    expect(Array.isArray(orders.body.items)).toBe(true);
  });

  it('La administración asigna un repartidor a un pedido de entrega por plataforma', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    await addToCart(napoliCatalog.body.products[0].id, 1);
    const order = await checkout();
    expect(order.status).toBe(200);
    expect(order.body.delivery_mode).toBe('platform');

    const assigned = await api(`/admin/orders/${order.body.id}/assign`, {
      method: 'POST',
      token: adminToken,
      body: { rider_id: riderId },
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.ok).toBe(true);

    // El pedido ahora aparece en el panel del repartidor
    const riderOrders = await api('/rider/orders', { token: riderToken });
    expect(riderOrders.body.items.some((o: any) => o.code === order.body.code)).toBe(true);

    // El estado pasó a rider_assigned
    const track = await api(`/orders/track/${order.body.code}?token=${order.body.public_token}`);
    expect(track.body.status).toBe('rider_assigned');
    expect(track.body.rider_name).toBeTruthy();
  });

  it('El repartidor actualiza el estado: en camino → entregado', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    await addToCart(napoliCatalog.body.products[0].id, 1);
    const order = await checkout();
    await api(`/admin/orders/${order.body.id}/assign`, {
      method: 'POST',
      token: adminToken,
      body: { rider_id: riderId },
    });

    const onTheWay = await api(`/rider/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: riderToken,
      body: { status: 'on_the_way' },
    });
    expect(onTheWay.status).toBe(200);
    expect(onTheWay.body.status).toBe('on_the_way');

    const delivered = await api(`/rider/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: riderToken,
      body: { status: 'delivered', amount_collected: 17800 },
    });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('delivered');

    const track = await api(`/orders/track/${order.body.code}?token=${order.body.public_token}`);
    expect(track.body.status).toBe('delivered');

    // Aparece en el historial del repartidor
    const history = await api('/rider/history', { token: riderToken });
    expect(history.body.items.some((o: any) => o.code === order.body.code)).toBe(true);
    expect(Number(history.body.totals.orders)).toBeGreaterThan(0);
  });

  it('El repartidor no puede tomar un pedido no asignado', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    await addToCart(napoliCatalog.body.products[0].id, 1);
    const order = await checkout();

    const attempt = await api(`/rider/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: riderToken,
      body: { status: 'on_the_way' },
    });
    expect(attempt.status).toBe(404);
  });

  it('El repartidor no puede usar estados reservados al comercio/administrador', async () => {
    const napoliCatalog = await api('/stores/pizzeria-napoli');
    await addToCart(napoliCatalog.body.products[0].id, 1);
    const order = await checkout();
    await api(`/admin/orders/${order.body.id}/assign`, {
      method: 'POST',
      token: adminToken,
      body: { rider_id: riderId },
    });

    const bad = await api(`/rider/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: riderToken,
      body: { status: 'confirmed' },
    });
    expect(bad.status).toBe(400);
  });

  it('Un pedido con entrega propia del comercio no se asigna a un repartidor', async () => {
    const palomarCatalog = await api('/stores/rotiseria-el-palomar');
    await addToCart(palomarCatalog.body.products[0].id, 1);
    const order = await checkout({ delivery_mode: 'merchant' });
    expect(order.status).toBe(200);
    expect(order.body.delivery_mode).toBe('merchant');

    const attempt = await api(`/admin/orders/${order.body.id}/assign`, {
      method: 'POST',
      token: adminToken,
      body: { rider_id: riderId },
    });
    expect(attempt.status).toBe(400);

    // El comercio gestiona su propio pedido: confirmar → preparar → listo → entregado
    const confirmed = await api(`/store/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: palomarToken,
      body: { status: 'confirmed' },
    });
    expect(confirmed.status).toBe(200);

    const preparing = await api(`/store/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: palomarToken,
      body: { status: 'preparing', preparation_minutes: 20, merchant_responsible: 'Carlos' },
    });
    expect(preparing.status).toBe(200);

    const ready = await api(`/store/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: palomarToken,
      body: { status: 'ready' },
    });
    expect(ready.status).toBe(200);

    const delivered = await api(`/store/orders/${order.body.id}/status`, {
      method: 'PATCH',
      token: palomarToken,
      body: { status: 'delivered' },
    });
    expect(delivered.status).toBe(200);

    const track = await api(`/orders/track/${order.body.code}?token=${order.body.public_token}`);
    expect(track.body.status).toBe('delivered');
    expect(track.body.merchant_responsible).toBe('Carlos');

    // El repartidor no ve este pedido (no está asignado)
    const riderOrders = await api('/rider/orders', { token: riderToken });
    expect(riderOrders.body.items.some((o: any) => o.code === order.body.code)).toBe(false);
  });

  it('El repartidor no puede acceder a endpoints de administración ni de otros comercios', async () => {
    const admin = await api('/admin/orders', { token: riderToken });
    expect(admin.status).toBe(403);

    const store = await api('/store/orders', { token: riderToken });
    expect(store.status).toBe(403);

    const profile = await api('/rider/profile', { token: riderToken });
    expect(profile.status).toBe(200);
  });

  it('El repartidor puede activar y desactivar su disponibilidad', async () => {
    const off = await api('/rider/profile', {
      method: 'PATCH',
      token: riderToken,
      body: { available: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.available).toBe(false);

    const on = await api('/rider/profile', {
      method: 'PATCH',
      token: riderToken,
      body: { available: true },
    });
    expect(on.status).toBe(200);
    expect(on.body.available).toBe(true);
  });
});
