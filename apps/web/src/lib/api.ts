/**
 * Cliente HTTP de acoYAradas!.
 *
 * - Guarda el token de acceso, el refresh token y el token de invitado
 *   (carrito sin cuenta) en localStorage.
 * - Refresca la sesión automáticamente ante un 401 y reintenta la petición.
 * - Expone `ApiError` con el código y el detalle que devuelve la API.
 */

export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const STORAGE = {
  access: 'aco.access_token',
  refresh: 'aco.refresh_token',
  guest: 'aco.guest_token',
};

export const tokens = {
  get access(): string | null {
    return localStorage.getItem(STORAGE.access);
  },
  get refresh(): string | null {
    return localStorage.getItem(STORAGE.refresh);
  },
  get guest(): string | null {
    return localStorage.getItem(STORAGE.guest);
  },
  setAccess(value: string | null) {
    if (value) localStorage.setItem(STORAGE.access, value);
    else localStorage.removeItem(STORAGE.access);
  },
  setRefresh(value: string | null) {
    if (value) localStorage.setItem(STORAGE.refresh, value);
    else localStorage.removeItem(STORAGE.refresh);
  },
  setGuest(value: string | null) {
    if (value) localStorage.setItem(STORAGE.guest, value);
    else localStorage.removeItem(STORAGE.guest);
  },
  clear() {
    localStorage.removeItem(STORAGE.access);
    localStorage.removeItem(STORAGE.refresh);
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Motivo del conflicto de carrito con dos comercios (mixed_stores). */
  get reason(): string | undefined {
    const d = this.details as { reason?: string } | undefined;
    return d?.reason;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Enviar el token de acceso (por defecto: si hay sesión). */
  auth?: boolean;
  /** Enviar además el token de invitado (carrito). */
  guest?: boolean;
  /** Devolver la respuesta cruda (CSV, SSE). */
  raw?: boolean;
  signal?: AbortSignal;
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshSession(): Promise<string | null> {
  const refresh = tokens.refresh;
  if (!refresh) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) {
          tokens.clear();
          return null;
        }
        const data = (await res.json()) as RefreshResponse;
        tokens.setAccess(data.access_token);
        tokens.setRefresh(data.refresh_token);
        return data.access_token;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) headers['content-type'] = 'application/json';
  if (options.auth !== false && tokens.access) headers.authorization = `Bearer ${tokens.access}`;
  if (options.guest !== false && tokens.guest) headers['x-guest-token'] = tokens.guest;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
    signal: options.signal,
  });

  // El backend emite el token de invitado en la respuesta del carrito.
  const mintedGuest = res.headers.get('x-guest-token');
  if (mintedGuest) tokens.setGuest(mintedGuest);

  if (res.status === 401 && retry && tokens.refresh) {
    const fresh = await refreshSession();
    if (fresh) return request<T>(path, options, false);
  }

  if (options.raw) {
    if (!res.ok) {
      throw new ApiError(res.status, 'error', `Error ${res.status}`);
    }
    return (await res.text()) as unknown as T;
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error ?? 'error',
      data?.message ?? 'Ocurrió un error inesperado. Intentá de nuevo.',
      data?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  raw: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, raw: true }),
};

/** Descarga un archivo CSV autenticado. */
export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: tokens.access ? { authorization: `Bearer ${tokens.access}` } : {},
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'error', 'No se pudo generar el reporte.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
