# Arquitectura — acoYAradas!

## Visión general

Aplicación full-stack con arquitectura en capas:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Web (React)    │────▶│  API (Express)   │────▶│  PostgreSQL     │
│  Vite + TS      │     │  TypeScript      │     │  (PGlite/Supa)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

- **Frontend**: React 18 + TypeScript + Vite + Tailwind. Consume la API por `/api`.
- **Backend**: Express + TypeScript. Único cliente de la BD. Aplica RLS real.
- **Base de datos**: PostgreSQL. Migraciones en `supabase/migrations/`.
- **Auth**: JWT (modo local) o Supabase Auth (modo supabase), seleccionable por `AUTH_MODE`.

## Monorepo

```
apps/
  api/          # Backend Express
  web/          # Frontend React
packages/
  shared/       # Contratos, enums, schemas zod
supabase/
  migrations/   # SQL (schema, RLS, funciones, políticas)
docs/
```

## Modos de base de datos

- `DB_MODE=local`: PGlite (PostgreSQL embebido en WASM). Sin dependencias externas. Usado en desarrollo, demo y tests.
- `DB_MODE=supabase`: PostgreSQL de Supabase vía `DATABASE_URL`.

Ambos comparten las mismas migraciones y políticas RLS. El motor se selecciona en `apps/api/src/db/factory.ts`.

## Seguridad (RLS)

- La API se conecta con el rol restringido `acoyaradas_app` (sin BYPASSRLS).
- Cada consulta de negocio corre dentro de una transacción con `SET LOCAL ROLE acoyaradas_app` + `request.jwt.claims` (claims del usuario). Así la RLS se aplica de verdad.
- `db.system` (propietario) se reserva para operaciones internas controladas (tracking por token, jobs, seed).
- Las políticas están en `002_rls.sql` y los ajustes en `004_policies.sql`.

## Tiempo real

- SSE en `/api/track/:code/events` para el seguimiento del cliente.
- Eventos en memoria (`lib/events.ts`) para notificaciones entre módulos.

## Multi-tenant

- Cada producto pertenece a un único comercio (`store_id`).
- Las consultas del panel del comercio filtran por `store_id` y la RLS impide acceder a datos ajenos.
- Un pedido corresponde a un solo comercio (se rechaza mezclar con 409 `mixed_stores`).

## Módulos de la API

| Módulo | Ruta | Descripción |
|---|---|---|
| auth | `/api/auth/*` | login, register, refresh, logout, me |
| catalog | `/api/*` | home, categories, stores, products, search |
| cart | `/api/cart/*` | carrito (usuario o invitado) |
| orders | `/api/orders/*` | checkout, mine, track, cancel |
| store | `/api/store/*` | panel del comercio |
| admin | `/api/admin/*` | panel administrativo |
| rider | `/api/rider/*` | panel del repartidor |
| public | `/api/*` | settings, plans, legal, ads/events, uploads, track SSE, notifications |

## Esquema de datos (resumen)

Tablas principales: `profiles`, `local_users`, `refresh_tokens`, `stores`, `store_members`, `categories`, `products`, `product_images`, `stock_movements`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `riders`, `rider_assignments`, `coverage_zones`, `shipping_tariffs`, `plans`, `subscriptions`, `payments`, `commissions`, `commission_rules`, `ad_placements`, `ad_campaigns`, `banners`, `ad_events`, `promotions`, `notifications`, `audit_log`, `settings`, `legal_pages`, `idempotency_keys`.

Ver `supabase/migrations/001_schema.sql` para el detalle (FKs, índices, restricciones).

## Ingresos (3 fuentes combinables)

1. **Abonos mensuales**: planes free/pro/premium con límites configurables.
2. **Comisiones por pedido**: porcentaje o monto fijo, base configurable (productos o total).
3. **Publicidad paga**: campañas con fechas, tarifas por ubicación.

Los registros internos de pago quedan `pending` hasta confirmación explícita (nunca se afirman cobros no verificados).