import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, DEMO_ACCOUNTS, login, startTestServer, type TestServer } from './helpers.js';

/**
 * Etapa 2 — Autenticación, permisos y sesiones.
 */
describe('Autenticación y sesiones', () => {
  let server: TestServer;
  const api = () => createClient(server.baseUrl);

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('POST /auth/login devuelve token, refresh y perfil', async () => {
    const res = await api()('/auth/login', {
      method: 'POST',
      body: { email: DEMO_ACCOUNTS.customer, password: 'Demo1234!' },
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.user.email).toBe(DEMO_ACCOUNTS.customer);
    expect(res.body.user.role).toBe('customer');
  });

  it('POST /auth/login con contraseña incorrecta devuelve 401', async () => {
    const res = await api()('/auth/login', {
      method: 'POST',
      body: { email: DEMO_ACCOUNTS.customer, password: 'incorrecta' },
    });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login con email inexistente devuelve 401', async () => {
    const res = await api()('/auth/login', {
      method: 'POST',
      body: { email: 'nadie@acoyaradas.app', password: 'Demo1234!' },
    });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login con datos inválidos devuelve 400', async () => {
    const res = await api()('/auth/login', {
      method: 'POST',
      body: { email: 'no-es-un-email', password: '' },
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
  });

  it('GET /auth/me con token devuelve el perfil con su rol', async () => {
    const session = await login(api(), DEMO_ACCOUNTS.admin);
    const res = await api()('/auth/me', { token: session.access_token });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('GET /auth/me sin token devuelve user null (no 401)', async () => {
    const res = await api()('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('GET /auth/me con token inválido no autentica', async () => {
    const res = await api()('/auth/me', { token: 'token.invalido.firma' });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('POST /auth/register crea la cuenta y permite iniciar sesión', async () => {
    const email = `nuevo-${Date.now()}@acoyaradas.app`;
    const res = await api()('/auth/register', {
      method: 'POST',
      body: { email, password: 'ClaveSegura123', full_name: 'Cliente Nuevo', phone: '+5491100000099' },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('customer');

    const loginRes = await api()('/auth/login', {
      method: 'POST',
      body: { email, password: 'ClaveSegura123' },
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.access_token).toBeTruthy();
  });

  it('POST /auth/register con email duplicado devuelve 409', async () => {
    const res = await api()('/auth/register', {
      method: 'POST',
      body: { email: DEMO_ACCOUNTS.customer, password: 'ClaveSegura123', full_name: 'Otro' },
    });
    expect(res.status).toBe(409);
  });

  it('POST /auth/register con contraseña corta devuelve 400', async () => {
    const res = await api()('/auth/register', {
      method: 'POST',
      body: { email: `corto-${Date.now()}@acoyaradas.app`, password: '123', full_name: 'Corto' },
    });
    expect(res.status).toBe(400);
  });

  it('POST /auth/refresh rota el token de sesión', async () => {
    const session = await login(api(), DEMO_ACCOUNTS.customer);
    const res = await api()('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).not.toBe(session.refresh_token);
  });

  it('POST /auth/refresh con un token revocado falla', async () => {
    const session = await login(api(), DEMO_ACCOUNTS.customer);
    const logout = await api()('/auth/logout', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    expect(logout.status).toBe(200);

    const res = await api()('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    expect(res.status).toBe(401);
  });

  it('El perfil del comercio incluye el store_id y el del repartidor el rider_id', async () => {
    const store = await login(api(), DEMO_ACCOUNTS.store);
    expect(store.user.store_id).toBeTruthy();
    expect(store.user.role).toBe('store_owner');

    const rider = await login(api(), DEMO_ACCOUNTS.rider);
    expect(rider.user.rider_id).toBeTruthy();
    expect(rider.user.role).toBe('courier');
  });
});
