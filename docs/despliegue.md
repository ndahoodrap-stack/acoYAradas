# Guía de publicación

## Opción recomendada: Vercel (frontend) + Supabase (backend/BD)

### 1. Base de datos

Configurar Supabase según `docs/supabase.md` y aplicar migraciones.

### 2. API

La API se compila con esbuild:

```bash
npm run build -w @acoyaradas/api
# genera apps/api/dist/server.js
```

Desplegar `apps/api` en un servicio Node (Render, Railway, Fly.io, VPS) o como serverless. Variables de entorno: las de `.env.example` con `DB_MODE=supabase`, `AUTH_MODE=supabase` (o local), `NODE_ENV=production`.

Comando de arranque: `node dist/server.js`.

### 3. Frontend

```bash
npm run build -w @acoyaradas/web
# genera apps/web/dist
```

Publicar `apps/web/dist` en Vercel/Netlify. Configurar el proxy o la variable `VITE_API_PROXY` apuntando a la URL de la API, o usar un mismo dominio con rewrite `/api/*` → API.

### 4. Dominio personalizado

Configurar el dominio en el proveedor. Actualizar `CORS_ORIGINS` y `PUBLIC_BASE_URL` en la API.

### 5. Primer administrador

Ver `docs/primer-admin.md`.

### 6. Verificación post-deploy

- `GET /api/health` → `{ ok: true, db: "postgres" }`.
- Login con el admin creado.
- Compra de prueba end-to-end.
- Revisar logs de la API.

## Notas

- No afirmar que pagos online funcionan: la integración con Mercado Pago está pendiente (ver `integraciones-pendientes.md`).
- WhatsApp automático requiere credenciales y plantillas aprobadas. Por defecto `WHATSAPP_PROVIDER=none`.