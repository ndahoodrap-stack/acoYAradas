import 'dotenv/config';
import path from 'node:path';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v: string | undefined, fallback: boolean) => {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

export type DbMode = 'local' | 'supabase';
export type AuthMode = 'local' | 'supabase';

const rootDir = path.resolve(process.cwd());

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  port: num(process.env.PORT, 3001),
  apiPrefix: '/api',

  dbMode: (process.env.DB_MODE ?? 'local') as DbMode,
  databaseUrl: process.env.DATABASE_URL ?? '',
  pgliteDataDir: process.env.PGLITE_DATA_DIR ?? path.join(rootDir, '.data', 'pglite'),

  authMode: (process.env.AUTH_MODE ?? 'local') as AuthMode,
  authSecret: process.env.AUTH_SECRET ?? 'acoyaradas-dev-secret-cambiar-en-produccion',
  accessTokenTtlSeconds: num(process.env.ACCESS_TOKEN_TTL, 60 * 60 * 2),
  refreshTokenTtlSeconds: num(process.env.REFRESH_TOKEN_TTL, 60 * 60 * 24 * 30),

  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Confiar en el proxy (Vercel/Netlify/Nginx) para obtener la IP real del cliente. */
  trustProxy: bool(process.env.TRUST_PROXY, false),

  uploadsDir: (() => {
    const dir = process.env.UPLOADS_DIR ?? path.join(rootDir, 'uploads');
    const resolved = path.resolve(dir);
    const projectRoot = path.resolve(rootDir);
    if (!resolved.startsWith(projectRoot)) {
      throw new Error('UPLOADS_DIR must be within project root');
    }
    return dir;
  })(),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${num(process.env.PORT, 3001)}`,

  /** Proveedor de WhatsApp.
   *  - 'links'  : genera enlaces wa.me (abre WhatsApp Desktop con el texto listo).
   *  - 'bridge' : envía automáticamente a través del puente local (whatsapp-web.js).
   */
  whatsappProvider: (process.env.WHATSAPP_PROVIDER ?? 'links') as 'links' | 'bridge' | 'none',
  whatsappWebhookUrl: process.env.WHATSAPP_WEBHOOK_URL ?? '',
  whatsappWebhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN ?? '',
  /** Número propio del encargado (recibe todos los pedidos). */
  whatsappOwnerPhone: process.env.WHATSAPP_OWNER_PHONE ?? '',
  /** Enviar automáticamente por el puente sin abrir el chat. */
  whatsappAutoSend: bool(process.env.WHATSAPP_AUTO_SEND, false),
  /** Abrir el chat de WhatsApp al confirmar/asignar un pedido. */
  whatsappAutoOpen: bool(process.env.WHATSAPP_AUTO_OPEN, true),

  /** Datos de la plataforma (sitio público). */
  platform: {
    name: 'acoYAradas!',
    tagline: 'Comercios de tu zona, a un click',
    contactEmail: process.env.CONTACT_EMAIL ?? 'hola@acoyaradas.app',
    contactPhone: process.env.CONTACT_PHONE ?? '+54 9 2284 55-5555',
    city: 'San Carlos de Bolívar',
    province: 'Provincia de Buenos Aires',
    locality: 'San Carlos de Bolívar, Provincia de Buenos Aires',
    coverageText:
      process.env.COVERAGE_TEXT ??
      'Cobertura exclusiva en San Carlos de Bolívar, Provincia de Buenos Aires. Llegamos a todo el casco urbano.',
    hoursText: process.env.HOURS_TEXT ?? 'Lunes a sábado de 9:00 a 21:00 h',
  },
} as const;

if (config.isProd && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.includes('dev-secret'))) {
  throw new Error('AUTH_SECRET must be set to a secure random value in production. Generate one with: openssl rand -hex 32');
}

export function assertConfig() {
  if (config.dbMode === 'supabase' && !config.databaseUrl) {
    throw new Error('DB_MODE=supabase requiere DATABASE_URL');
  }
  if (config.authMode === 'supabase' && (!config.supabaseUrl || !config.supabaseAnonKey)) {
    throw new Error('AUTH_MODE=supabase requiere SUPABASE_URL y SUPABASE_ANON_KEY');
  }
}
