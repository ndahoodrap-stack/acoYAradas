# Guía de configuración — acoYAradas!

## 1. Instalación

```bash
npm install
cp .env.example apps/api/.env
```

## 2. Base de datos

Modo local (PGlite, por defecto): no requiere configuración adicional. La base se crea en `apps/api/.data/pglite`.

Modo Supabase/PostgreSQL:
- Definir `DB_MODE=supabase`, `DATABASE_URL`.
- Ejecutar migraciones en `supabase/migrations` (001 a 004).

## 3. Autenticación

Modo local (por defecto): usuarios en `public.local_users`.

Modo Supabase: configurar `AUTH_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## 4. Ejecución

```bash
npm run dev
```

O `start.bat` en Windows.

## 5. Primer administrador (modo local)

El seed crea un usuario administrador de demostración. Revisar `apps/api/src/db/seed.ts` para credenciales de demo. Cambiar la contraseña en producción y definir `AUTH_SECRET` propio.