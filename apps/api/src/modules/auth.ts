import { Router } from 'express';
import { loginSchema, registerSchema } from '@acoyaradas/shared';
import { route, validate } from '../http/router.js';
import { applyClaims } from '../db/index.js';
import { loginUser, registerUser, refreshSession, revokeSession } from '../auth/service.js';

export const authRouter = Router();

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
    const full_name = String(req.body?.full_name ?? '').trim() || null;
    const phone = String(req.body?.phone ?? '').trim() || null;
    const address = String(req.body?.address ?? '').trim() || null;
    const avatar_url = req.body?.avatar_url === undefined ? undefined : (String(req.body.avatar_url ?? '').trim() || null);
    await ctx.db.exec('alter table public.profiles add column if not exists address text');
    return ctx.db.transaction(async (tx) => {
      await applyClaims(tx, ctx.claims);
      const fields = ['full_name = $2', 'phone = $3', 'address = $4', 'updated_at = now()'];
      const params: unknown[] = [ctx.user!.id, full_name, phone, address];
      if (avatar_url !== undefined) {
        fields.push(`avatar_url = $${params.length + 1}`);
        params.push(avatar_url);
      }
      await tx.query(`update public.profiles set ${fields.join(', ')} where id = $1`, params);
      await ctx.db.exec('alter table public.profiles add column if not exists address text');
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
