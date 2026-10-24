import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processExpiredSubscriptions } from '../src/jobs.js';
import {
  createClient,
  DEMO_ACCOUNTS,
  login,
  startTestServer,
  type RequestOptions,
  type TestServer,
} from './helpers.js';

/**
 * Etapa 6 — escenarios 9 y 10:
 *   9. Las suscripciones vencidas se procesan según las reglas configuradas.
 *  10. Los pagos no se marcan como confirmados sin una verificación válida.
 */
describe('Suscripciones y pagos', () => {
  let server: TestServer;
  let client!: ReturnType<typeof createClient>;
  const api = (path: string, options?: RequestOptions) => client(path, options);

  let adminToken = '';
  let customerToken = '';

  beforeAll(async () => {
    server = await startTestServer();
    client = createClient(server.baseUrl);
    adminToken = (await login(api, DEMO_ACCOUNTS.admin)).access_token;
    customerToken = (await login(api, DEMO_ACCOUNTS.customer)).access_token;
  });

  afterAll(async () => {
    await server.close();
  });

  it('Las suscripciones de demostración están activas con plan gratuito', async () => {
    const subs = await api('/admin/subscriptions', { token: adminToken });
    expect(subs.status).toBe(200);
    expect(subs.body.items.length).toBeGreaterThan(0);
    const active = subs.body.items.filter((s: any) => s.status === 'active');
    expect(active.length).toBeGreaterThan(0);
  });

  it('Una suscripción vencida se marca como expired y genera un pago pendiente', async () => {
    // Creamos una suscripción paga para poder verificar el pago pendiente
    const stores = await api('/admin/stores', { token: adminToken });
    const store = stores.body.items[0];
    const plans = await api('/admin/plans', { token: adminToken });
    const pro = plans.body.items.find((p: any) => p.code === 'pro');

    const created = await api('/admin/subscriptions', {
      method: 'POST',
      token: adminToken,
      body: { store_id: store.id, plan_id: pro.id, months: 1 },
    });
    expect(created.status).toBe(200);
    const target = created.body.subscription;

    await server.db.system.query(
      `update public.subscriptions set ends_at = now() - interval '1 day', updated_at = now() where id = $1`,
      [target.id],
    );

    const processed = await processExpiredSubscriptions(server.db);
    expect(processed).toBeGreaterThanOrEqual(1);

    const after = await api('/admin/subscriptions', { token: adminToken });
    const updated = after.body.items.find((s: any) => s.id === target.id);
    expect(updated.status).toBe('expired');

    const payments = await api('/admin/payments', { token: adminToken });
    const pending = payments.body.items.filter(
      (p: any) => p.subscription_id === target.id && p.kind === 'subscription',
    );
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((p: any) => p.status === 'pending')).toBe(true);
    expect(pending.every((p: any) => !p.confirmed_at)).toBe(true);
  });

  it('processExpiredSubscriptions es idempotente: no duplica pagos pendientes', async () => {
    const before = await api('/admin/payments', { token: adminToken });
    const countBefore = before.body.items.length;

    const processed = await processExpiredSubscriptions(server.db);
    expect(processed).toBe(0);

    const after = await api('/admin/payments', { token: adminToken });
    expect(after.body.items.length).toBe(countBefore);
  });

  it('Los pagos nunca se confirman automáticamente al crear un abono', async () => {
    const stores = await api('/admin/stores', { token: adminToken });
    const store = stores.body.items[0];
    const plans = await api('/admin/plans', { token: adminToken });
    const pro = plans.body.items.find((p: any) => p.code === 'pro');

    const created = await api('/admin/subscriptions', {
      method: 'POST',
      token: adminToken,
      body: { store_id: store.id, plan_id: pro.id, months: 1 },
    });
    expect(created.status).toBe(200);
    expect(created.body.payment.status).toBe('pending');
    expect(created.body.payment.confirmed_at).toBeNull();
    expect(created.body.payment.confirmed_by).toBeNull();

    const payment = created.body.payment;
    const confirmed = await api(`/admin/payments/${payment.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'confirmed', method: 'transfer', external_ref: 'OP-123' },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.confirmed_at).toBeTruthy();
    expect(confirmed.body.confirmed_by).toBeTruthy();
  });

  it('Los pagos de pedidos quedan pendientes y no se afirman sin verificación', async () => {
    const payments = await api('/admin/payments', { token: adminToken });
    const orderPayments = payments.body.items.filter((p: any) => p.kind !== 'subscription');
    for (const p of orderPayments) {
      if (p.status === 'confirmed') {
        expect(p.confirmed_by).toBeTruthy();
      }
    }
  });

  it('Un cliente no puede confirmar pagos ni leer el listado de pagos', async () => {
    const list = await api('/admin/payments', { token: customerToken });
    expect(list.status).toBe(403);

    const stores = await api('/admin/stores', { token: adminToken });
    const store = stores.body.items[0];
    const plans = await api('/admin/plans', { token: adminToken });
    const pro = plans.body.items.find((p: any) => p.code === 'pro');
    const created = await api('/admin/subscriptions', {
      method: 'POST',
      token: adminToken,
      body: { store_id: store.id, plan_id: pro.id, months: 1 },
    });
    const confirmAttempt = await api(`/admin/payments/${created.body.payment.id}`, {
      method: 'PATCH',
      token: customerToken,
      body: { status: 'confirmed' },
    });
    expect(confirmAttempt.status).toBe(403);
  });
});
