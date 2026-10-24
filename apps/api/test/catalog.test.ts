import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, startTestServer, type TestServer } from './helpers.js';

/**
 * Etapa 1 — Tienda pública, comercios y catálogo.
 * Verifica que el catálogo real (PostgreSQL) responda con datos consistentes.
 */
describe('Catálogo público', () => {
  let server: TestServer;
  const api = () => createClient(server.baseUrl);

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /health responde ok y conecta con la base', async () => {
    const res = await api()('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe('pglite');
  });

  it('GET /home devuelve categorías, comercios, banners y promociones', async () => {
    const res = await api()('/home');
    expect(res.status).toBe(200);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.stores.length).toBe(3);
    expect(Array.isArray(res.body.banners)).toBe(true);
    expect(Array.isArray(res.body.promotions)).toBe(true);
    expect(res.body.popular.length).toBeGreaterThan(0);
  });

  it('GET /categories lista las categorías activas con conteos', async () => {
    const res = await api()('/categories');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(8);
    const rotiserias = res.body.items.find((c: any) => c.slug === 'rotiserias');
    expect(rotiserias).toBeDefined();
    expect(Number(rotiserias.stores_count)).toBe(2);
    const gastronomia = res.body.items.find((c: any) => c.slug === 'gastronomia');
    expect(Number(gastronomia.products_count)).toBe(2);
  });

  it('GET /stores lista los comercios activos con paginación', async () => {
    const res = await api()('/stores');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
  });

  it('GET /stores filtra por búsqueda y por categoría', async () => {
    const bySearch = await api()('/stores?search=napoli');
    expect(bySearch.body.items.length).toBe(1);
    expect(bySearch.body.items[0].slug).toBe('pizzeria-napoli');

    const cats = await api()('/categories');
    const kioscos = cats.body.items.find((c: any) => c.slug === 'kioscos');
    const byCategory = await api()(`/stores?category=${kioscos.id}`);
    expect(byCategory.body.items.length).toBe(1);
    expect(byCategory.body.items[0].slug).toBe('kiosco-24');
  });

  it('GET /stores/:slug devuelve el comercio con su catálogo', async () => {
    const res = await api()('/stores/pizzeria-napoli');
    expect(res.status).toBe(200);
    expect(res.body.store.slug).toBe('pizzeria-napoli');
    expect(res.body.store.name).toBe('Pizzería Napoli');
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.products.every((p: any) => p.store_slug === 'pizzeria-napoli')).toBe(true);
  });

  it('GET /stores/:slug inexistente devuelve 404', async () => {
    const res = await api()('/stores/no-existe');
    expect(res.status).toBe(404);
  });

  it('GET /products pagina el catálogo y filtra por comercio', async () => {
    const all = await api()('/products?pageSize=50');
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBe(9);
    expect(all.body.total).toBe(9);

    const store = await api()('/stores/kiosco-24');
    const kioskProducts = await api()(`/products?store=${store.body.store.id}&pageSize=50`);
    expect(kioskProducts.body.items.length).toBe(3);
    expect(kioskProducts.body.items.every((p: any) => p.store_slug === 'kiosco-24')).toBe(true);
  });

  it('GET /products?soloNoDisponibles oculta los productos agotados', async () => {
    const res = await api()('/products?pageSize=50');
    expect(res.body.items.every((p: any) => p.is_available === true)).toBe(true);
  });

  it('GET /products/:id devuelve el detalle del producto', async () => {
    const list = await api()('/products?search=Muzzarella');
    const id = list.body.items[0].id;
    const res = await api()(`/products/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Pizza Muzzarella');
    expect(res.body.price).toBe(8500);
    expect(res.body.store_slug).toBe('pizzeria-napoli');
  });

  it('GET /search?q= encuentra comercios y productos', async () => {
    const res = await api()('/search?q=pizza');
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.stores.length).toBeGreaterThan(0);
  });

  it('GET /search sin consulta suficiente devuelve listas vacías', async () => {
    const res = await api()('/search?q=a');
    expect(res.body.products).toEqual([]);
    expect(res.body.stores).toEqual([]);
  });

  it('GET /settings expone la configuración pública de la plataforma', async () => {
    const res = await api()('/settings');
    expect(res.status).toBe(200);
    expect(res.body.platform.name).toBe('acoYAradas!');
    expect(res.body.settings.contact.email).toBeTruthy();
    expect(res.body.settings.coverage.text).toBeTruthy();
  });

  it('GET /plans expone los planes comerciales (público)', async () => {
    const res = await api()('/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans.length).toBe(3);
    expect(res.body.placements.length).toBe(3);
  });

  it('GET /legal/:slug devuelve los textos legales con aviso de revisión', async () => {
    const res = await api()('/legal/terminos');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Términos y condiciones');
    expect(res.body.body).toContain('revisado por un profesional legal');
  });

  it('GET /legal/:slug inexistente devuelve 404', async () => {
    const res = await api()('/legal/no-existe');
    expect(res.status).toBe(404);
  });
});
