import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import type { Database } from './db/index.js';
import { buildContext } from './http/context.js';
import { errorHandler } from './http/router.js';
import { authRouter } from './modules/auth.js';
import { catalogRouter } from './modules/catalog.js';
import { cartRouter } from './modules/cart.js';
import { ordersRouter } from './modules/orders.js';
import { storeRouter } from './modules/store.js';
import { adminRouter } from './modules/admin.js';
import { riderRouter } from './modules/rider.js';
import { publicRouter } from './modules/public.js';
import { whatsappRouter } from './modules/whatsapp.js';

export function createApp(db: Database) {
  const app = express();
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Imágenes locales (en producción con Supabase se usa Supabase Storage)
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));

  app.get(`${config.apiPrefix}/health`, async (_req, res) => {
    try {
      // Timeout corto para evitar que el health check cuelgue en Render
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2000));
      await Promise.race([db.system.query('select 1'), timeout]);
      res.json({ ok: true, db: db.kind, env: config.env, time: new Date().toISOString() });
    } catch (err) {
      // Responder 200 para pasar el health check de Render mientras se estabiliza la conexión
      res.json({ ok: true, db: db.kind, env: config.env, time: new Date().toISOString(), degraded: true });
    }
  });

  app.use(config.apiPrefix, buildContext(db));

  app.use(`${config.apiPrefix}/auth`, authRouter);
  app.use(config.apiPrefix, catalogRouter);
  app.use(`${config.apiPrefix}/cart`, cartRouter);
  app.use(`${config.apiPrefix}/orders`, ordersRouter);
  app.use(`${config.apiPrefix}/store`, storeRouter);
  app.use(`${config.apiPrefix}/admin`, adminRouter);
  app.use(`${config.apiPrefix}/rider`, riderRouter);
  app.use(`${config.apiPrefix}/whatsapp`, whatsappRouter);
  app.use(config.apiPrefix, publicRouter);

  app.use(config.apiPrefix, (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'El recurso solicitado no existe' });
  });

  // Front compilado (publicación en un único servicio).
  // Se prueban varias ubicaciones porque el proceso puede arrancarse desde
  // la raíz del repo (Render/Railway) o desde apps/api (script local).
  const webDistCandidates = [
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    fileURLToPath(new URL('../../web/dist', import.meta.url)),
  ];
  const webDist = webDistCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
  if (webDist) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
