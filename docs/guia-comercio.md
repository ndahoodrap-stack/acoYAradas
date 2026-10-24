# Guía de uso — Comercio

## Acceso

Iniciar sesión con una cuenta de rol `store_owner` o `store_staff`. El panel está en `/comercio` (o `/store`).

## Incorporación

1. Registrarse como usuario.
2. Completar la solicitud de registro comercial (`/store/applications`).
3. Esperar la aprobación del administrador.
4. Al aprobarse, se asigna el plan gratuito.

## Panel

- **Perfil**: editar datos públicos, horarios, cobertura, métodos de pago, modalidades de entrega.
- **Productos**: crear, editar, desactivar (baja lógica). Administrar precio, stock, categoría, imagen, disponibilidad, destacado. Límites según el plan.
- **Pedidos**: ver los propios, aceptar/rechazar, marcar preparando/listo/entregado, informar tiempo de preparación y responsable de entrega.
- **Promociones**: crear descuentos (porcentaje o monto fijo) con fechas y mínimo de compra.
- **Publicidad**: contratar campañas (fechas, ubicación, precio). Consultar estado e impresiones/clics.
- **Finanzas**: suscripciones, pagos pendientes, comisiones, campañas.
- **Estadísticas**: ventas, pedidos por estado, productos más vendidos.

## Reglas

- Un comercio nunca accede a datos de otro.
- Los pedidos de entrega propia del comercio (modalidad B) los gestiona el propio comercio (no se asignan repartidores de la plataforma).
- Los registros de pago internos son `pending` hasta confirmación verificable.