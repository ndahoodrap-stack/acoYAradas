import { randomBytes, randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código corto y legible para el cliente (ej: AC-7F3K2). */
export function orderCode(prefix = 'AC'): string {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}

/** Token opaco para el enlace seguro de seguimiento. */
export function publicToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}

/** Token de carrito invitado. */
export function guestToken(): string {
  return `g_${randomBytes(32).toString('hex')}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Slug único dentro del alcance indicado (agrega sufijo numérico si hace falta). */
export async function uniqueSlug(
  exists: (candidate: string) => Promise<boolean>,
  base: string,
): Promise<string> {
  const root = slugify(base) || 'item';
  if (!(await exists(root))) return root;
  for (let i = 2; i < 200; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}
