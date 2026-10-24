import type { NextFunction, Request, Response } from 'express';
import type { Claims, Database } from '../db/index.js';
import { loadUserById, type AuthUser } from '../auth/service.js';
import { verifyAccessToken } from '../auth/jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface Ctx {
  db: Database;
  claims: Claims;
  user: AuthUser | null;
  guestToken: string | null;
  /** IP del cliente (puede ser null si el proxy no la expone). */
  ip: string | null;
  /** Request original (params, query y body). */
  req: Request;
  /** Response original (para streaming SSE y descargas CSV). */
  res: Response;
}

/** Middleware que arma el contexto (usuario, claims, token de invitado). */
export function buildContext(db: Database) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guestToken =
        req.header('x-guest-token') ||
        (typeof req.query.guest_token === 'string' ? req.query.guest_token : null);

      let claims: Claims = { guest_token: guestToken };
      let user: AuthUser | null = null;

      const header = req.header('authorization');
      if (header?.toLowerCase().startsWith('bearer ')) {
        const payload = verifyAccessToken(header.slice(7).trim());
        if (payload) {
          const loaded = await loadUserById(db, payload.sub);
          if (loaded) {
            user = loaded;
            claims = {
              sub: loaded.id,
              role: loaded.role,
              email: loaded.email,
              guest_token: guestToken,
            };
          }
        }
      }

      res.locals.ctx = {
        db,
        claims,
        user,
        guestToken,
        ip: req.ip ?? req.socket.remoteAddress ?? null,
        req,
        res,
      } satisfies Ctx;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(ctx: Ctx): AuthUser {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

export function requireAdmin(ctx: Ctx): AuthUser {
  const user = requireAuth(ctx);
  if (user.role !== 'admin') throw forbidden('Zona exclusiva de la administración de acoYAradas!');
  return user;
}

export function requireStoreManager(ctx: Ctx): { user: AuthUser; storeId: string } {
  const user = requireAuth(ctx);
  if (!user.store_id) throw forbidden('Necesitás un comercio asociado a tu cuenta');
  return { user, storeId: user.store_id };
}

export function requireRider(ctx: Ctx): { user: AuthUser; riderId: string } {
  const user = requireAuth(ctx);
  if (!user.rider_id) throw forbidden('Necesitás un perfil de repartidor');
  return { user, riderId: user.rider_id };
}
