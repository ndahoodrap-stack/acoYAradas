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

```json
{ "phone": "+54 9 2284 55-5555", "message": "Texto del mensaje" }
```

Cabecera: `Authorization: Bearer <BRIDGE_TOKEN>`.

Respuesta exitosa: `{ "ok": true }`.

## Notas

- El puente debe correr en la misma máquina que la API (o accesible por red).
- Si WhatsApp Web se desconecta, el programa intenta reconectar automáticamente.
- No uses este puente para spam: está pensado para los avisos de cada pedido.
```
