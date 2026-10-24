import { Router } from 'express';
import { loginSchema, registerSchema } from '@acoyaradas/shared';
import { route, validate } from '../http/router.js';
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
    return { user: ctx.user };
  }),
);
