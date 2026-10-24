# Guía de publicación — acoYAradas!

## Frontend

- Build: `npm run build -w @acoyaradas/web`
- Publicar en Vercel/Netlify. Configurar variable `VITE_API_URL` apuntando a la API.

## Backend

- Build: `npm run build -w @acoyaradas/api`
- Ejecutar `node dist/server.js` en un servicio compatible (Render, Railway, Fly, etc.).
- Configurar variables de entorno de producción, incluyendo `AUTH_SECRET` propio y `TRUST_PROXY=true` detrás de proxy.

## Base de datos

- Usar PostgreSQL administrado (Supabase recomendado).
- Ejecutar migraciones de `supabase/migrations`.

## Dominio

- Configurar dominio personalizado en el proveedor de hosting y actualizar `CORS_ORIGINS` y `PUBLIC_BASE_URL`.