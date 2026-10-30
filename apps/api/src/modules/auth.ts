import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema } from '@acoyaradas/shared';
import { route, validate } from '../http/router.js';
import { applyClaims } from '../db/index.js';
import { loginUser, registerUser, refreshSession, revokeSession } from '../auth/service.js';
import { badRequest } from '../lib/errors.js';

export const authRouter = Router();

// Rate limiting para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 intentos por ventana
  message: { error: 'too_many_requests', message: 'Demasiados intentos, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.use(authLimiter);

authRouter.post(
  '/register',
  route(async (ctx, req) => {
    const input = validate(registerSchema, req.body);
    return registerUser(ctx.db, {
      email: input.email,
      password: input.password,
      full_name: input.full_name,
      phone: input.phone || undefined,
    });
  }),
);

authRouter.post(
  '/login',
  route(async (ctx, req) => {
    const input = validate(loginSchema, req.body);
    return loginUser(ctx.db, { email: input.email, password: input.password });
  }),
);

authRouter.post(
  '/refresh',
  route(async (ctx, req) => {
    const refresh_token = String(req.body?.refresh_token ?? '');
    return refreshSession(ctx.db, refresh_token);
  }),
);

authRouter.post(
  '/logout',
  route(async (ctx, req) => {
    const refresh_token = String(req.body?.refresh_token ?? '');
    await revokeSession(ctx.db, refresh_token);
    return { ok: true };
  }),
);

authRouter.get(
  '/me',
  route(async (ctx) => {
    if (!ctx.user) return { user: null };
    await ctx.db.exec('alter table public.profiles add column if not exists address text');
    const profile = await ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);
      const { rows } = await tx.query(
        'select id, email, full_name, phone, address, role, avatar_url from public.profiles where id = $1 and deleted_at is null',
        [ctx.user!.id],
      );
      return rows[0] ?? null;
    });
    return { user: ctx.user, profile };
  }),
);

authRouter.patch(
  '/me',
  route(async (ctx, req) => {
    if (!ctx.user) throw badRequest('Necesitás iniciar sesión');
    await ctx.db.exec('alter table public.profiles add column if not exists address text');
    return ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);

      const updates: string[] = ['updated_at = now()'];
      const params: unknown[] = [ctx.user!.id];
      let paramIndex = 2;

      // Solo actualizar campos que se envían explícitamente
      if (req.body?.full_name !== undefined) {
        const full_name = String(req.body.full_name).trim() || null;
        updates.push(`full_name = $${paramIndex++}`);
        params.push(full_name);
      }
      if (req.body?.phone !== undefined) {
        const phone = String(req.body.phone).trim() || null;
        updates.push(`phone = $${paramIndex++}`);
        params.push(phone);
      }
      if (req.body?.address !== undefined) {
        const address = String(req.body.address).trim() || null;
        updates.push(`address = $${paramIndex++}`);
        params.push(address);
      }
      if (req.body?.avatar_url !== undefined) {
        const avatar_url = String(req.body.avatar_url ?? '').trim() || null;
        updates.push(`avatar_url = $${paramIndex++}`);
        params.push(avatar_url);
      }

      // Si no hay nada que actualizar (solo updated_at), devolver perfil actual
      if (updates.length === 1) {
        const { rows } = await tx.query(
          'select id, email, full_name, phone, address, role, avatar_url from public.profiles where id = $1',
          [ctx.user!.id],
        );
        return rows[0];
      }

      await tx.query(`update public.profiles set ${updates.join(', ')} where id = $1`, params);
      const { rows } = await tx.query(
        'select id, email, full_name, phone, address, role, avatar_url from public.profiles where id = $1',
        [ctx.user!.id],
      );
      return rows[0];
    });
  }),
);

authRouter.delete(
  '/me',
  route(async (ctx) => {
    if (!ctx.user) throw badRequest('Necesitás iniciar sesión');
    await ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);
      await tx.query('update public.profiles set deleted_at = now(), updated_at = now() where id = $1', [ctx.user!.id]);
    });
    return { ok: true };
  }),
);
