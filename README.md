# acoYAradas!

Marketplace de comercios locales, publicidad, compras online y motomandados (Argentina).

Stack: React + TypeScript + Vite + Tailwind (frontend), Node/Express + TypeScript (API), PostgreSQL (PGlite en desarrollo, Supabase en producción), autenticación JWT/Supabase.

## Requisitos

- Node.js >= 20
- npm >= 10

## Instalación

```bash
npm install
```

## Configuración

Copiar `.env.example` a `.env` y ajustar los valores. Por defecto la aplicación corre en modo local (PGlite + auth local), sin necesidad de Supabase.

## Ejecutar en desarrollo

```bash
npm run dev
```

Esto levanta la API en `http://localhost:3001` y el frontend en `http://localhost:5173`.

También podés usar `start.bat` (Windows) para instalar, migrar, sembrar y levantar todo.

## Base de datos

```bash
npm run db:migrate   # aplica migraciones
npm run db:reset     # borra y recrea la BD (PGlite)
npm run db:seed      # carga datos de demostración
```

## Tests

```bash
npm test             # ejecuta la suite completa (vitest)
npm run test:watch   # modo watch
```

## Build de producción

```bash
npm run build        # compila API (esbuild) y Web (vite)
npm run start        # ejecuta la API compilada
```

## Documentación

Ver la carpeta `docs/`:
- `arquitectura.md` — arquitectura y esquema de datos
- `supabase.md` — configuración de Supabase
- `despliegue.md` — publicación
- `primer-admin.md` — creación del primer administrador
- `guia-administrador.md`, `guia-comercio.md`, `guia-repartidor.md` — guías por rol
- `pruebas.md` — informe de pruebas
- `integraciones-pendientes.md` — integraciones no implementadas

## Cuentas de demostración

Contraseña para todas: `Demo1234!`

- admin@acoyaradas.app (administrador)
- comercio@acoyaradas.app (Pizzería Napoli)
- rotiseria@acoyaradas.app (Rotisería El Palomar)
- kiosco@acoyaradas.app (Kiosco 24)
- repartidor@acoyaradas.app (repartidor)
- cliente@acoyaradas.app (cliente)

Los datos de demostración están claramente identificados (prefijos "Demo", slugs fijos, auditoría marcada como seed).