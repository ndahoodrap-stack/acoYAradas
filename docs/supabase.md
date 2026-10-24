# Guía de configuración de Supabase

## 1. Crear proyecto

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Anotar: `Project URL`, `anon public key`, `service_role key`.
3. Obtener la connection string (Settings → Database → Connection string → URI, modo "Transaction" o "Session").

## 2. Variables de entorno

En `.env`:

```
DB_MODE=supabase
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
AUTH_MODE=supabase   # o local si preferís auth propia
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

## 3. Migraciones

Aplicar las migraciones en orden sobre la BD de Supabase:

```bash
# Opción A: con psql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# Opción B: con el script de la API (DB_MODE=supabase)
npm run db:migrate
```

Las migraciones crean el rol `acoyaradas_app`, las tablas, RLS, funciones y datos base (categorías, planes, zonas, tarifas, páginas legales, settings).

## 4. Storage

Crear un bucket público (por defecto `public`) para imágenes. Configurar `SUPABASE_STORAGE_BUCKET`. La API sube imágenes vía service role key.

## 5. Auth

- Si `AUTH_MODE=supabase`, la API delega login/registro en Supabase Auth y sincroniza perfiles en `public.profiles`.
- Si `AUTH_MODE=local`, la API usa `local_users` + JWT propio (no requiere Supabase Auth).

## 6. Realtime

El seguimiento de pedidos usa SSE propio (`/api/track/:code/events`). Supabase Realtime es opcional y no está cableado por defecto.

## 7. Verificación

```bash
curl http://localhost:3001/api/health
# db debe ser "postgres"
```

## Notas de seguridad

- No exponer `SUPABASE_SERVICE_ROLE_KEY` en el frontend.
- Las políticas RLS están en `002_rls.sql` + `004_policies.sql`. Revisar antes de operar.
- El rol `acoyaradas_app` no tiene BYPASSRLS.