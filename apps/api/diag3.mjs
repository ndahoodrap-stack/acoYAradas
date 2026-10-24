import { startTestServer, createClient, login, DEMO_ACCOUNTS } from './test/helpers.js';
import path from 'node:path';

const server = await startTestServer();
const api = createClient(server.baseUrl);
const adminToken = (await login(api, DEMO_ACCOUNTS.admin)).access_token;
const customerToken = (await login(api, DEMO_ACCOUNTS.customer)).access_token;

// get product
const catalog = await api('/stores/pizzeria-napoli');
const productId = catalog.body.products[0].id;
// clear cart
const cart = await api('/cart/', { token: customerToken });
for (const item of cart.body.items ?? []) await api(`/cart/items/${item.id}`, { method: 'DELETE', token: customerToken });
await api('/cart/items', { method: 'POST', token: customerToken, body: { product_id: productId, quantity: 1 } });
const order = await api('/orders/', { method: 'POST', token: customerToken, body: {
  customer_name: 'Cliente Demo', phone: '+5491100000004', address: 'Av. Corrientes 1234', locality: 'CABA',
  fulfillment_type: 'delivery', delivery_mode: 'platform', payment_method: 'cash'
}});
console.log('order', order.status, order.body.code, order.body.delivery_mode);

const riders = await api('/admin/riders', { token: adminToken });
console.log('riders', riders.body.items.map(r=>({id:r.id,active:r.active,available:r.available})));
const riderId = riders.body.items[0].id;

const assigned = await api(`/admin/orders/${order.body.id}/assign`, { method: 'POST', token: adminToken, body: { rider_id: riderId }});
console.log('assigned', assigned.status, JSON.stringify(assigned.body));

await server.close();
console.log('done');
