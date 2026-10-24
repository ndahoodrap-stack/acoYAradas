import { startTestServer, createClient, login, DEMO_ACCOUNTS } from './test/helpers.js';

const server = await startTestServer();
const api = createClient(server.baseUrl);
const riderToken = (await login(api, DEMO_ACCOUNTS.rider)).access_token;
console.log('patch off...');
const off = await api('/rider/profile', { method: 'PATCH', token: riderToken, body: { available: false } });
console.log('off', off.status, JSON.stringify(off.body));
await server.close();
console.log('done');
