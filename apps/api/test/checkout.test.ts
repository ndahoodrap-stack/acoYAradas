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
 * Etapa 6 — escenarios 1, 4, 7 y 10:
 *   1. Un cliente realiza una compra y el pedido aparece en el panel correcto.
 *   4. Una compra con productos de dos comercios no se mezcla accidentalmente.
 *   7. Los costos de envío y las comisiones se calculan correctamente.
 *  10. Los pagos no se marcan como confirmados sin una verificación válida.
 */
describe('Carrito, checkout y precios', () => {
  let server: TestServer;
  let client!: ReturnType<typeof createClient>;
  const api = (path: string, options?: RequestOptions) => client(path, options);

  let customerToken = '';
  let storeToken = '';
  let adminToken = '';
  let pizzaId = '';
  let pizzaStock = 0;
  let gaseosaId = '';

  const checkout = (token: string, extra: Record<string, unknown> = {}) =>
    api('/orders/', {
      method: 'POST',
      token,
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
    customerToken = (await login(api, DEMO_ACCOUNTS.customer)).access_token;
    storeToken = (await login(api, DEMO_ACCOUNTS.store)).access_token;
    adminToken = (await login(api, DEMO_ACCOUNTS.admin)).access_token;

    const napoli = await api('/stores/pizzeria-napoli');
    const pizza = napoli.body.products.find((p: any) => p.name === 'Pizza Muzzarella');
    pizzaId = pizza.id;
    pizzaStock = pizza.stock;

    const kiosco = await api('/stores/kiosco-24');
    gaseosaId = kiosco.body.products.find((p: any) => p.name === 'Gaseosa 1.5L').id;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Cada prueba arranca con el carrito vacío.
    const cart = await api('/cart/', { token: customerToken });
    for (const item of cart.body.items ?? []) {
      await api(`/cart/items/${item.id}`, { method: 'DELETE', token: customerToken });
    }
  });

  it('Agrega productos al carrito y calcula el subtotal', async () => {
    const add = await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 2 },
    });
    expect(add.status).toBe(200);
    expect(add.body.items.length).toBe(1);
    expect(add.body.items[0].quantity).toBe(2);
    expect(add.body.subtotal).toBe(17000);

    const cart = await api('/cart/', { token: customerToken });
    expect(cart.body.subtotal).toBe(17000);
    expect(cart.body.store_name).toBe('Pizzería Napoli');
    expect(cart.body.items[0].store_slug).toBe('pizzeria-napoli');
  });

  it('Un carrito con productos de dos comercios se rechaza con 409 mixed_stores', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const res = await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: gaseosaId, quantity: 1 },
    });
    expect(res.status).toBe(409);
    expect(res.body.details?.reason).toBe('mixed_stores');
  });

  it('Con replace=true el cliente puede cambiar de comercio de forma explícita', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const res = await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: gaseosaId, quantity: 1, replace: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].product_id).toBe(gaseosaId);
  });

  it('No se puede agregar más unidades que el stock disponible', async () => {
    const res = await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 100 },
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/stock/i);
  });

  it('El checkout crea el pedido, descuenta el stock y deja el carrito vacío', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 2 },
    });

    const res = await checkout(customerToken, { references: 'Timbre 3B' });

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^AC-[0-9A-Z]+$/);
    expect(res.body.public_token).toBeTruthy();
    expect(res.body.status).toBe('pending_confirmation');
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.references).toBe('Timbre 3B');

    // El stock se descuenta en el servidor
    const napoli = await api('/stores/pizzeria-napoli');
    const pizza = napoli.body.products.find((p: any) => p.id === pizzaId);
    expect(pizza.stock).toBe(pizzaStock - 2);

    // El carrito queda vacío
    const cart = await api('/cart/', { token: customerToken });
    expect(cart.body.items.length).toBe(0);
  });

  it('Calcula envío, descuento y total en el servidor', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 2 },
    });
    const res = await checkout(customerToken);

    expect(res.body.subtotal).toBe(17000);
    expect(res.body.discount).toBe(1700); // promoción global del 10 %
    expect(res.body.shipping_cost).toBe(2500); // tarifa de la zona CABA Centro
    expect(res.body.total).toBe(17800);
    expect(res.body.total).toBe(res.body.subtotal - res.body.discount + res.body.shipping_cost);
  });

  it('El retiro en el local no cobra envío', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const res = await checkout(customerToken, {
      fulfillment_type: 'pickup',
      delivery_mode: 'merchant',
    });
    expect(res.status).toBe(200);
    expect(res.body.shipping_cost).toBe(0);
    expect(res.body.delivery_mode).toBe('merchant');
  });

  it('La entrega propia del comercio usa la tarifa del comercio', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const res = await checkout(customerToken, { delivery_mode: 'merchant' });
    expect(res.status).toBe(200);
    expect(res.body.shipping_cost).toBe(3000);
    expect(res.body.shipping_notes).toContain('comercio');
  });

  it('La comisión de la plataforma se calcula sobre la base configurada', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 2 },
    });
    const res = await checkout(customerToken);
    const orderId = res.body.id;

    const commissions = await api(`/admin/commissions?store_id=${res.body.store_id}`, {
      token: adminToken,
    });
    expect(commissions.status).toBe(200);
    const commission = commissions.body.items.find((c: any) => c.order_id === orderId);
    expect(commission).toBeDefined();
    // 8 % sobre (subtotal - descuento) = 8 % de 15300
    expect(Number(commission.commission_base)).toBe(15300);
    expect(Number(commission.commission_amount)).toBe(1224);
    expect(Number(commission.net_amount)).toBe(14076);
    expect(commission.status).toBe('pending');
  });

  it('El pedido aparece en el panel del cliente, del comercio y del administrador', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const created = await checkout(customerToken);
    const code = created.body.code;

    const mine = await api('/orders/mine', { token: customerToken });
    expect(mine.body.items.some((o: any) => o.code === code)).toBe(true);

    const storeOrders = await api('/store/orders', { token: storeToken });
    expect(storeOrders.body.items.some((o: any) => o.code === code)).toBe(true);

    const adminOrders = await api('/admin/orders', { token: adminToken });
    expect(adminOrders.body.items.some((o: any) => o.code === code)).toBe(true);
  });

  it('El enlace de seguimiento funciona con el token público y falla con otro', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const created = await checkout(customerToken);

    const track = await api(
      `/orders/track/${created.body.code}?token=${created.body.public_token}`,
    );
    expect(track.status).toBe(200);
    expect(track.body.code).toBe(created.body.code);
    expect(track.body.items.length).toBe(1);

    const bad = await api(`/orders/track/${created.body.code}?token=token-invalido`);
    expect(bad.status).toBe(404);

    const noToken = await api(`/orders/track/${created.body.code}`);
    expect(noToken.status).toBe(400);
  });

  it('El checkout sin carrito devuelve 400', async () => {
    const res = await checkout(customerToken);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/carrito/i);
  });

  it('La misma idempotency_key no duplica el pedido', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const key = `clave-idempotencia-${Date.now()}`;
    const first = await checkout(customerToken, { idempotency_key: key });
    expect(first.status).toBe(200);

    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const second = await checkout(customerToken, { idempotency_key: key });
    expect(second.status).toBe(200);
    expect(second.body.code).toBe(first.body.code);
  });

  it('El pago del pedido queda pendiente: nunca se afirma un cobro no verificado', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const created = await checkout(customerToken, { payment_method: 'transfer' });
    expect(created.body.payment_status).toBe('pending');
    expect(created.body.payment_method).toBe('transfer');

    const track = await api(
      `/orders/track/${created.body.code}?token=${created.body.public_token}`,
    );
    expect(track.body.payment_status).toBe('pending');
  });

  it('El cliente puede cancelar su pedido y se devuelve el stock', async () => {
    await api('/cart/items', {
      method: 'POST',
      token: customerToken,
      body: { product_id: pizzaId, quantity: 1 },
    });
    const created = await checkout(customerToken);
    const before = (await api('/stores/pizzeria-napoli')).body.products.find(
      (p: any) => p.id === pizzaId,
    ).stock;

    const cancel = await api(`/orders/${created.body.id}/cancel`, {
      method: 'POST',
      token: customerToken,
      body: { reason: 'Me arrepentí' },
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');

    const after = (await api('/stores/pizzeria-napoli')).body.products.find(
      (p: any) => p.id === pizzaId,
    ).stock;
    expect(after).toBe(before + 1);
  });
});
