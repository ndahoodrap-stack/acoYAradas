import express from 'express';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth } from 'whatsapp-web.js';

const PORT = Number(process.env.BRIDGE_PORT ?? 3010);
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const CLIENT_ID = process.env.WHATSAPP_CLIENT_ID ?? 'acoyaradas';

const client = new Client({
  authStrategy: new LocalAuth({ clientId: CLIENT_ID }),
  puppeteer: { headless: true, args: ['--no-sandbox'] },
});

let ready = false;

client.on('qr', (qr) => {
  console.log('\nEscaneá este código QR con WhatsApp (Teléfono vinculado):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  ready = true;
  console.log('✅ WhatsApp Web conectado. Puente listo.');
});

client.on('disconnected', (reason) => {
  ready = false;
  console.warn('⚠️ WhatsApp Web desconectado:', reason);
  // Reintento simple.
  setTimeout(() => client.initialize().catch(() => {}), 5000);
});

client.initialize().catch((error) => {
  console.error('No se pudo inicializar WhatsApp Web:', error?.message ?? error);
});

const app = express();
app.use(express.json({ limit: '1mb' }));

function auth(req, res, next) {
  if (!TOKEN) return next();
  const header = String(req.headers.authorization ?? '');
  const expected = `Bearer ${TOKEN}`;
  if (header !== expected) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, ready });
});

app.post('/send', auth, async (req, res) => {
  if (!ready) {
    return res.status(503).json({ ok: false, error: 'WhatsApp Web no está conectado todavía' });
  }
  const phone = String(req.body?.phone ?? '').replace(/\D/g, '');
  const message = String(req.body?.message ?? '');
  if (!phone || !message) {
    return res.status(400).json({ ok: false, error: 'Faltan phone o message' });
  }
  try {
    const chatId = `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message ?? error) });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Puente de WhatsApp escuchando en http://127.0.0.1:${PORT}/send`);
});
