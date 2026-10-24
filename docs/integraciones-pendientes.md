# Integraciones pendientes

## 1. Mercado Pago (pagos online)

- **Estado**: no implementado.
- **Requisitos**: cuenta Mercado Pago, credenciales (access token), configuración de webhooks, validación de firmas en servidor, manejo de reintentos/idempotencia.
- **Impacto**: los pedidos, abonos y publicidad se pagan actualmente por efectivo/transferencia/pago al recibir. Los registros internos quedan `pending`.
- **No afirmar que los cobros online funcionan** hasta configurar y probar la integración.

## 2. WhatsApp automático

- **Estado**: proveedor `none` por defecto. Las notificaciones se registran en la BD (tabla `notifications`) pero no se envían.
- **Requisitos**: proveedor oficial (Meta Cloud API u otro), plantillas aprobadas, credenciales, webhook de entrega.
- **Configuración**: `WHATSAPP_PROVIDER=webhook` + `WHATSAPP_WEBHOOK_URL` + `WHATSAPP_WEBHOOK_TOKEN`.

## 3. Supabase Storage (imágenes)

- **Estado**: fallback a almacenamiento local (`uploads/`) si no hay credenciales de Supabase. En producción con Supabase se usa Supabase Storage.
- **Requisitos**: bucket público, service role key, CORS configurado.

## 4. Supabase Realtime (opcional)

- **Estado**: el seguimiento usa SSE propio. Supabase Realtime no está cableado.
- **Requisitos**: suscripción a canales si se desea escalar horizontalmente.

## 5. Geocodificación / distancia para envío

- **Estado**: la tarifa por distancia aplica la tarifa base (sin cálculo de distancia real).
- **Requisitos**: proveedor de geocodificación (Google Maps, Nominatim) y ajuste manual desde el panel.

## 6. Notificaciones push / email

- **Estado**: solo in-app. Email/push no implementados.
- **Requisitos**: proveedor de email (Resend/SendGrid) y/o push (FCM).

## 7. Cumplimiento legal/fiscal argentino

- **Estado**: las páginas legales son de demostración y deben revisarse por un profesional legal.
- **Requisitos**: revisión legal, facturación electrónica (AFIP), términos adaptados. No se afirma cumplimiento automático.