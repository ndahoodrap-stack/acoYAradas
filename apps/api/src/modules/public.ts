import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';
import { route, validate } from '../http/router.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { subscribe, channels } from '../lib/events.js';

export const publicRouter = Router();

/* ------------------------------------------------------------------ */
/* Configuración pública y páginas legales                             */
/* ------------------------------------------------------------------ */
publicRouter.get(
  '/settings',
  route(async (ctx) => {
    const { rows } = await ctx.db.system.query('select key, value from public.settings');
    const settings = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    const platform = { ...config.platform, ...(settings.platform ?? {}) };
    return {
      platform,
      settings,
    };
  }),
);

/* ------------------------------------------------------------------ */
/* Planes y espacios publicitarios (consulta pública)                   */
/* ------------------------------------------------------------------ */
publicRouter.get(
  '/plans',
  route(async (ctx) => {
    return ctx.db.transaction(async (tx) => {
      await applyClaims(tx, { guest_token: ctx.guestToken });
      const [plans, placements] = await Promise.all([
        tx.query(
          `select id, name, code, price, billing_period, product_limit, promo_limit, features
             from public.plans
            where active = true
            order by price`,
        ),
        tx.query(
          `select key, name, description, price_per_day
             from public.ad_placements
            where active = true
            order by name`,
        ),
      ]);
      return { plans: plans.rows, placements: placements.rows };
    });
  }),
);

publicRouter.get(
  '/legal/:slug',
  route(async (ctx) => {
    const slug = String(ctx.req.params.slug);
    const { rows } = await ctx.db.system.query(
      'select slug, title, body, updated_at from public.legal_pages where slug = $1',
      [slug],
    );
    if (!rows.length) throw notFound('La página solicitada no existe');
    return rows[0];
  }),
);

/* ------------------------------------------------------------------ */
/* Eventos de publicidad (impresiones y clics)                         */
/* ------------------------------------------------------------------ */
publicRouter.post(
  '/ads/events',
  route(async (ctx, req) => {
    const input = validate(z.object({ campaign_id: z.string().uuid(), type: z.enum(['impression', 'click']) }), req.body);
    await ctx.db.system.query('select public.register_ad_event($1,$2,$3)', [
      input.campaign_id,
      input.type,
      ctx.user?.id ?? null,
    ]);
    return { ok: true };
  }),
);

/* ------------------------------------------------------------------ */
/* Seguimiento en vivo (SSE)                                           */
/* ------------------------------------------------------------------ */
publicRouter.get(
  '/track/:code/events',
  route(async (ctx, req) => {
    const code = String(ctx.req.params.code).toUpperCase();
    const token = String(req.query.token ?? '');
    const { rows } = await ctx.db.system.query<{ id: string }>(
      'select id from public.orders where upper(code) = $1 and public_token = $2',
      [code, token],
    );
    if (!rows.length) throw notFound('No encontramos ese pedido con el enlace proporcionado');
    const orderId = rows[0].id;

    ctx.res.setHeader('content-type', 'text/event-stream');
    ctx.res.setHeader('cache-control', 'no-cache, no-transform');
    ctx.res.setHeader('connection', 'keep-alive');
    ctx.res.setHeader('x-accel-buffering', 'no');
    ctx.res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      ctx.res.write(`event: ${event}\n`);
      ctx.res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', { order_id: orderId });

    const unsubscribe = subscribe(channels.order(orderId), (payload) => {
      send('order', payload);
    });
    const keepAlive = setInterval(() => ctx.res.write(': ping\n\n'), 25_000);

    ctx.req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
      ctx.res.end();
    });
    return undefined;
  }),
);

/* ------------------------------------------------------------------ */
/* Notificaciones del usuario                                           */
/* ------------------------------------------------------------------ */
publicRouter.get(
  '/notifications',
  route(async (ctx) => {
    if (!ctx.user) return [];
    return ctx.db.transaction(async (tx: DbExecutor) => {
      await applyClaims(tx, ctx.claims);
      const { rows } = await tx.query(
        `select id, template, payload, status, created_at, order_id, channel
           from public.notifications
          where user_id = $1 or store_id in (select store_id from public.store_members where user_id = $1)
          order by created_at desc limit 50`,
        [ctx.user!.id],
      );
      return rows;
    });
  }),
);

publicRouter.post(
  '/notifications/:id/read',
  route(async (ctx) => {
    if (!ctx.user) throw unauthorized();
    return ctx.db.transaction(async (tx: DbExecutor) => {
      await applyClaims(tx, ctx.claims);
      const { rows } = await tx.query(
        `update public.notifications set status = 'sent'
          where id = $1 and (user_id = $2 or store_id in (select store_id from public.store_members where user_id = $2))
          returning id, status`,
        [String(ctx.req.params.id), ctx.user!.id],
      );
      if (!rows.length) throw notFound('La notificación no existe');
      return rows[0];
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Carga de imágenes                                                    */
/* ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function safeName(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
  return `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
}

async function uploadToSupabaseStorage(file: Express.Multer.File): Promise<string | null> {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'public';
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
  const res = await fetch(
    `${config.supabaseUrl}/storage/v1/object/${bucket}/${name}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.supabaseServiceKey}`,
        apikey: config.supabaseServiceKey,
        'content-type': file.mimetype,
        'x-upsert': 'true',
      },
      body: file.buffer,
    },
  );
  if (!res.ok) return null;
  return `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${name}`;
}

publicRouter.post(
  '/uploads',
  upload.single('file'),
  route(async (ctx, req) => {
    if (!ctx.user) throw unauthorized('Necesitás iniciar sesión para subir imágenes');
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw badRequest('No se recibió ningún archivo');
    if (!/^image\//.test(file.mimetype)) throw badRequest('Sólo se permiten imágenes');

    const remote = await uploadToSupabaseStorage(file);
    if (remote) return { url: remote, storage: 'supabase' };

    await fs.mkdir(config.uploadsDir, { recursive: true });
    const name = safeName(file.originalname);
    await fs.writeFile(path.join(config.uploadsDir, name), file.buffer);
    return { url: `${config.publicBaseUrl}/uploads/${name}`, storage: 'local' };
  }),
);
