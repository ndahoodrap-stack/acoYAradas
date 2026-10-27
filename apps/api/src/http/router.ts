import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { Ctx } from './context.js';
import { AppError, badRequest } from '../lib/errors.js';

export type Handler = (ctx: Ctx, req: Request, res: Response) => Promise<unknown>;

/** Envoltura de handlers: propaga errores al middleware central. */
export const route =
  (handler: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = res.locals.ctx as Ctx;
      const result = await handler(ctx, req, res);
      if (!res.headersSent && result !== undefined) res.json(result);
    } catch (err) {
      next(err);
    }
  };

/** Valida y normaliza datos de entrada. */
export function validate<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw badRequest('Revisá los datos del formulario', details);
  }
  return result.data;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  const e = err as { code?: string; message?: string; detail?: string; stack?: string };
  // Errores de PostgreSQL que no son AppError
  if (e?.code === '23505') {
    res.status(409).json({ error: 'conflict', message: 'El registro ya existe' });
    return;
  }
  if (e?.code === '23503') {
    res.status(422).json({ error: 'foreign_key', message: 'Referencia inválida a otro registro' });
    return;
  }
  if (e?.code === '23514' || e?.code === '22P02') {
    res.status(422).json({ error: 'check_violation', message: e.message ?? 'Dato inválido' });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[api] error no controlado:', (err as any)?.message, (err as any)?.query, (err as any)?.code, (err as any)?.stack);
  res.status(500).json({
    error: 'internal_error',
    message: e?.message || 'Ocurrió un error inesperado. Intentá de nuevo.',
    detail: e?.code || undefined,
  });
}

/** Convierte query params a número con default. */
export function intParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
