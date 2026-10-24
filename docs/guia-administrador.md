# Guía de uso — Administrador

## Acceso

Iniciar sesión con una cuenta de rol `admin`. El panel está en `/admin`.

## Dashboard

Métricas del período: ventas y pedidos, pedidos pendientes de aceptación, en preparación, entregas pendientes, comercios activos/pendientes, publicidades activas/próximas a vencer, suscripciones vigentes/vencidas, comisiones, ingresos por abonos/publicidad/comisiones, gastos de logística, incidencias y cancelaciones.

Las ventas de los comercios se distinguen de los ingresos propios de la plataforma.

## Gestión de comercios

- Listar, filtrar por estado/búsqueda.
- Aprobar (activa + asigna plan gratuito), suspender, rechazar, eliminar lógicamente.
- Editar datos del comercio.

## Pedidos

- Ver todos los pedidos con filtros (estado, comercio, repartidor, modalidad, fechas).
- Cambiar estado de cualquier pedido.
- Asignar repartidor a pedidos de entrega por plataforma (no a entrega propia del comercio).

## Repartidores

- Crear, editar, activar/desactivar.
- Ver asignaciones e historial.

## Configuración

- Categorías, zonas de cobertura, tarifas de envío.
- Planes comerciales, reglas de comisión.
- Espacios publicitarios (placements), banners.
- Campañas: aprobar/pausar/rechazar, registrar eventos.
- Settings (contacto, cobertura, horarios, redes, métodos de pago, features).
- Páginas legales (editable).

## Finanzas

- Suscripciones y pagos (confirmar manualmente).
- Comisiones (liquidar/condonar).
- Reportes CSV (pedidos/ventas, comisiones, publicidad) con separador `;` y BOM UTF-8.

## Auditoría

- Registro de acciones administrativas en `/admin/audit`.