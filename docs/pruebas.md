# Informe de pruebas — acoYAradas!

## Suite automatizada (vitest)

Comando: `npm test`. Resultado: **85 tests, 7 archivos, todos verdes**.

| Archivo | Tests | Escenarios cubiertos |
|---|---|---|
| catalog.test.ts | 16 | Catálogo público, categorías, comercios, productos, búsqueda, settings, planes, legales |
| auth.test.ts | 13 | Login, registro, refresh, roles, permisos de sesión |
| checkout.test.ts | 15 | Carrito, mixed stores, stock, checkout, precios, envío, comisión, tracking, cancelación, pagos pendientes |
| store-panel.test.ts | 12 | Aislamiento de productos/pedidos/promociones, campañas (fechas/estados), stats/finanzas |
| admin.test.ts | 15 | Permisos 401/403, pedidos globales, aprobación/suspensión de comercios, usuarios/roles, auditoría, settings, legales, CSV, comisiones, zonas/tarifas/categorías/planes, banners, repartidores/asignación, dashboard, suscripciones |
| rider.test.ts | 8 | Vista propia, asignación, transiciones, no asignado, estados inválidos, entrega propia del comercio, permisos, disponibilidad |
| subscriptions.test.ts | 6 | Suscripciones activas, vencimiento → expired + pago pendiente, idempotencia, pagos no auto-confirmados, permisos |

## Escenarios de la Etapa 6

1. ✅ Cliente compra y el pedido aparece en el panel correcto (checkout.test.ts).
2. ✅ Comercio administra sus productos sin acceder a los de otros (store-panel.test.ts).
3. ✅ Administrador aprueba negocios y controla todos los pedidos (admin.test.ts).
4. ✅ Compra con productos de dos comercios no se mezcla (checkout.test.ts).
5. ✅ Pedido asignable a repartidor de la plataforma (rider.test.ts).
6. ✅ Pedido gestionable por entrega propia del comercio (rider.test.ts).
7. ✅ Costos de envío y comisiones calculados correctamente (checkout.test.ts).
8. ✅ Campañas publicitarias respetan fechas y estados (store-panel.test.ts).
9. ✅ Suscripciones vencidas procesadas según reglas (subscriptions.test.ts).
10. ✅ Pagos no se marcan confirmados sin verificación (checkout.test.ts + subscriptions.test.ts).
11. ✅ Permisos impiden acceso a datos ajenos (admin.test.ts + rider.test.ts + store-panel.test.ts).
12. ⚠️ Responsive UI verificado manualmente en el frontend (no automatizado; revisar en navegador).

## Verificación manual adicional

- `npm run typecheck` → sin errores (API + Web).
- `npm run build` → build exitoso (API esbuild + Web vite).
- `npm run db:reset && npm run db:seed` → migraciones + seed OK.
- Smoke test de la app con `start.bat` → login, compra, seguimiento, paneles.

## Correcciones realizadas durante las pruebas

- `004_policies.sql`: política `stores_insert` ajustada (RLS de PGlite no exponía `app_current_user_id()` en WITH CHECK de INSERT).
- `admin.ts`: corrección de `now() + ($3 || ' interval')::interval` → `now() + $3::interval` (creación de suscripciones).
- `rider.ts`: cast de parámetro `$2` para evitar "inconsistent types" en el UPDATE de asignaciones.
- `Layout.tsx`: slugs de páginas legales alineados con el seed.
- `Checkout.tsx`: `onChange` recibía un objeto en lugar de función.
- DTO `CartItemDto.available` agregado; `CartState.cart` no-null.