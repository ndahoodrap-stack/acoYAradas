import { Router } from 'express';
import { z } from 'zod';
import {
  getWhatsAppConfig,
  buildOrderTargets,
  loadOrderMessageSource,
  sendThroughBridge,
  type OrderMessageSourceFull,
} from '../lib/whatsapp.js';
import { requireAdmin } from '../http/context.js';
import { route, validate } from '../http/router.js';
import { badRequest, notFound } from '../lib/errors.js';
import type { DbExecutor } from '../db/index.js';
import { applyClaims } from '../db/index.js';

export const whatsappRouter = Router();

async function run<T>(ctx: any, fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return ctx.db.transaction(async (tx: DbExecutor) => {
    await applyClaims(tx, ctx.claims);
    return fn(tx);
  });
}

whatsappRouter.get(
  '/orders/:id/messages',
  route(async (ctx, req) => {
    const user = ctx.user;
    if (!user) throw notFound('Necesitás iniciar sesión');
    const orderId = String(req.params.id);
    const source: OrderMessageSourceFull | null = await loadOrderMessageSource(ctx.db, orderId);
    if (!source) throw notFound('El pedido no existe');
    // Permisos: admin, dueño del comercio o repartidor asignado
    const allowed =
      user.role === 'admin' ||
      user.store_id === source.store_id ||
      (!!user.rider_id && user.rider_id === source.rider_id);
    if (!allowed) throw notFound('El pedido no existe');
    const settings = await getWhatsAppConfig(ctx.db);
    const targets = buildOrderTargets(source, {
      ownerPhone: settings.owner_phone,
      ownerName: 'acoYAradas!',
    });
    return {
      order_code: source.code,
      targets,
      auto_open: settings.auto_open,
    };
  }),
);

whatsappRouter.get(
  '/status',
  route(async (ctx) => {
    requireAdmin(ctx);
    const settings = await getWhatsAppConfig(ctx.db);
    return {
      enabled: settings.enabled,
      owner_phone: settings.owner_phone,
      mode: settings.mode,
      bridge_url: settings.bridge_url ? '***' : null,
      bridge_configured: Boolean(settings.bridge_url),
      auto_send: settings.auto_send,
      auto_open: settings.auto_open,
      events: settings.events,
    };
  }),
);

whatsappRouter.patch(
  '/settings',
  route(async (ctx, req) => {
    const admin = requireAdmin(ctx);
    const schema = z.object({
      enabled: z.boolean().optional(),
      owner_phone: z.string().nullable().optional(),
      mode: z.enum(['links', 'bridge']).optional(),
      bridge_url: z.string().nullable().optional(),
      bridge_token: z.string().nullable().optional(),
      auto_send: z.boolean().optional(),
      auto_open: z.boolean().optional(),
      events: z.record(z.string(), z.boolean()).optional(),
    });
    const body = validate(schema, req.body);
    return run(ctx, async (tx) => {
      const existing = await tx.query("select value from public.settings where key = 'whatsapp'");
      const current = (existing.rows[0]?.value as Record<string, unknown>) ?? {};
      const merged = { ...current, ...body };
      await tx.query(
        `insert into public.settings (key, value) values ('whatsapp', $1::jsonb)
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [JSON.stringify(merged)],
      );
      await (await import('../lib/audit.js')).audit(tx, {
        actorId: admin.id,
        actorRole: admin.role,
        actorName: admin.full_name ?? admin.email,
        action: 'whatsapp_settings_updated',
        entityType: 'settings',
        entityId: 'whatsapp',
        ip: ctx.ip,
      });
      return merged;
    });
  }),
);

whatsappRouter.get(
  '/outbox',
  route(async (ctx) => {
    requireAdmin(ctx);
    return run(ctx, async (tx) => {
      const { rows } = await tx.query(
        `select n.id, n.order_id, o.code as order_code, n.template, 
                (n.payload->>'phone') as phone, (n.payload->>'text') as text, (n.payload->>'link') as link,
                n.status, n.error, n.created_at
           from public.notifications n
           left join public.orders o on o.id = n.order_id
          where n.channel = 'whatsapp'
          order by n.created_at desc
          limit 200`,
      );
      return { items: rows };
    });
  }),
);

whatsappRouter.post(
  '/outbox/:id/sent',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const id = String(req.params.id);
    await ctx.db.system.query(
      `update public.notifications set status = 'sent', sent_at = now(), error = null where id = $1 and channel = 'whatsapp'`,
      [id],
    );
    return { ok: true };
  }),
);

whatsappRouter.post(
  '/outbox/:id/send',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const id = String(req.params.id);
    const settings = await getWhatsAppConfig(ctx.db);
    if (settings.mode !== 'bridge') throw badRequest('El modo puente no está habilitado');
    const res = await ctx.db.system.query<any>(
      `select payload from public.notifications where id = $1 and channel = 'whatsapp'`,
      [id],
    );
    if (!res.rows.length) throw notFound('Notificación no encontrada');
    const payload = res.rows[0].payload ?? {};
    const phone = payload.phone;
    const text = payload.text ?? '';
    if (!phone || !text) throw badRequest('Datos incompletos');
    const result = await sendThroughBridge(settings, phone, text);
    await ctx.db.system.query(
      `update public.notifications set status = $2, attempts = attempts + 1, error = $3, sent_at = case when $2 = 'sent' then now() else null end where id = $1`,
      [id, result.ok ? 'sent' : 'failed', result.ok ? null : result.error],
    );
    return { ok: result.ok, error: result.error };
  }),
);

whatsappRouter.post(
  '/test',
  route(async (ctx, req) => {
    requireAdmin(ctx);
    const schema = z.object({ phone: z.string().min(6), message: z.string().optional() });
    const body = validate(schema, req.body);
    const settings = await getWhatsAppConfig(ctx.db);
    const text = body.message ?? 'Prueba de WhatsApp desde acoYAradas! - ' + new Date().toISOString();
    if (settings.mode === 'bridge' && settings.bridge_url) {
      const result = await sendThroughBridge(settings, body.phone, text);
      return result;
    }
    return { ok: false, error: 'Modo enlaces. Usá los enlaces wa.me desde el panel.' };
  }),
);
