-- =====================================================================
-- 004_delivery_coordinates.sql
-- Añadir columnas de coordenadas de entrega a la tabla orders
-- =====================================================================

-- Añadir columnas para coordenadas GPS del mapa de verificación
alter table if exists public.orders
  add column if not exists delivery_lng numeric(10, 7),
  add column if not exists delivery_lat numeric(10, 7);

-- Índice para consultas geoespaciales futuras
create index if not exists orders_delivery_coords_idx on public.orders (delivery_lng, delivery_lat)
  where delivery_lng is not null and delivery_lat is not null;

-- Comentario para documentación
comment on column public.orders.delivery_lng is 'Longitud GPS de la entrega (ajustada por el cliente en el mapa)';
comment on column public.orders.delivery_lat is 'Latitud GPS de la entrega (ajustada por el cliente en el mapa)';