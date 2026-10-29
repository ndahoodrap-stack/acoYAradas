# Puente de WhatsApp para acoYAradas!

Este programa opcional mantiene una sesión de WhatsApp Web y expone un endpoint
HTTP `POST /send` que la API de acoYAradas! usa para enviar mensajes
automáticos desde el número del encargado.

## Requisitos

- Node.js 20 o superior.
- Un navegador Chromium (lo instala `whatsapp-web.js`).
- El mismo número que querés usar para el encargado (por ejemplo, el WhatsApp
  del dueño).

## Instalación

```bash
cd tools/whatsapp-bridge
npm install
```

## Configuración

Variables de entorno (o un archivo `.env`):

- `BRIDGE_PORT` — puerto del puente (por defecto `3010`).
- `BRIDGE_TOKEN` — token compartido con la API (`WHATSAPP_WEBHOOK_TOKEN`).
- `WHATSAPP_CLIENT_ID` — identificador de la sesión (por defecto `acoyaradas`).

## Uso

```bash
npm start
```

La primera vez se muestra un código QR en la terminal. Escanealo con WhatsApp
(Teléfono vinculado → Vincular un dispositivo). La sesión queda guardada en
`.wwebjs_auth` y no vuelve a pedir el QR.

Después, en el panel de administración → **WhatsApp**, configurá:

- Modo: **Puente automático**.
- URL del puente: `http://127.0.0.1:3010/send`.
- Token: el mismo que `BRIDGE_TOKEN`.

## Endpoint

`POST /send`

**Solo texto:**
```json
{ "phone": "+54 9 2284 55-5555", "message": "Texto del mensaje" }
```

**Con imagen (media attachment):**
```json
{ "phone": "+54 9 2284 55-5555", "message": "Texto opcional (caption)", "mediaUrl": "https://tudominio.com/acoYAradasLLEGOUNPEDIDO.jpg" }
```

- `message` es opcional si se envía `mediaUrl` (sirve como caption).
- `mediaUrl` debe ser una URL pública accesible (la API usa `PUBLIC_BASE_URL` + nombre de archivo).

Cabecera: `Authorization: Bearer <BRIDGE_TOKEN>`.

Respuesta exitosa: `{ "ok": true }`.

## Imágenes soportadas

La API mapea cada tipo de notificación a su imagen en `@acoyaradas/shared`:

| Tipo de mensaje | Archivo | Destinatario |
|----------------|---------|--------------|
| `store_new_order` | `acoYAradasLLEGOUNPEDIDO.jpg` | Comercio |
| `store_pickup_request` | `acoYAradasLLEGOUNPEDIDO.jpg` | Comercio |
| `customer_created` | `acoYAradasTUPEDIDOENCAMINO.jpg` | Cliente |
| `customer_status` | `acoYAradasTUPEDIDOENCAMINO.jpg` | Cliente |
| `owner_new_order` | *(sin imagen)* | Dueño |
| `rider_assignment` | *(sin imagen)* | Repartidor |

Las imágenes deben estar en `apps/web/public/` (servidas por `PUBLIC_BASE_URL`).

## Notas

- El puente debe correr en la misma máquina que la API (o accesible por red).
- Si WhatsApp Web se desconecta, el programa intenta reconectar automáticamente.
- No uses este puente para spam: está pensado para los avisos de cada pedido.
```
