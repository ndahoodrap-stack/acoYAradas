-- ---------------------------------------------------------------------
-- Zonas de cobertura de Bolívar con geometría (GeoJSON)
-- ---------------------------------------------------------------------

-- Añadir columna para almacenar geometría como GeoJSON
alter table public.coverage_zones
  add column if not exists geometry jsonb;

-- Añadir zone_id a orders para rastrear qué zona se usó para el cálculo de envío
alter table public.orders
  add column if not exists zone_id uuid references public.coverage_zones(id) on delete set null;

create index if not exists orders_zone_idx on public.orders (zone_id);

-- Índice para consultas espaciales (si se usa PostGIS en el futuro)
-- create index if not exists coverage_zones_geometry_idx on public.coverage_zones using gist (geometry::geometry);

-- Insertar/actualizar las tres zonas de Bolívar con sus polígonos
-- Planta Urbana (casco urbano)
insert into public.coverage_zones (name, code, description, geometry, active)
values (
  'Planta Urbana',
  'planta_urbana',
  'Casco urbano de San Carlos de Bolívar',
  '{"type":"Polygon","coordinates":[[[-61.129916,-36.230041],[-61.114462,-36.241843],[-61.099771,-36.2294],[-61.115089,-36.217481],[-61.129916,-36.230041]]]}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  geometry = excluded.geometry,
  active = excluded.active;

-- Zona Barrial (barrios periféricos)
insert into public.coverage_zones (name, code, description, geometry, active)
values (
  'Zona Barrial',
  'zona_barrial',
  'Barrios periféricos de San Carlos de Bolívar',
  '{"type":"Polygon","coordinates":[[[-61.152535,-36.236374],[-61.135313,-36.249641],[-61.120881,-36.260113],[-61.07742,-36.223304],[-61.108331,-36.198925],[-61.152535,-36.236374]]]}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  geometry = excluded.geometry,
  active = excluded.active;

-- Zona Rural (área rural)
insert into public.coverage_zones (name, code, description, geometry, active)
values (
  'Zona Rural',
  'zona_rural',
  'Área rural de San Carlos de Bolívar',
  '{"type":"Polygon","coordinates":[[[-61.184035,-36.237076],[-61.121265,-36.284151],[-61.054364,-36.2275],[-61.115774,-36.179238],[-61.184035,-36.237076]]]}'::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  geometry = excluded.geometry,
  active = excluded.active;

-- ---------------------------------------------------------------------
-- Tarifas de envío por zona (precios base - el admin puede modificarlos desde el panel)
-- ---------------------------------------------------------------------

-- Obtener IDs de las zonas
do $$
declare
  v_planta_urbana_id uuid;
  v_zona_barrial_id uuid;
  v_zona_rural_id uuid;
begin
  select id into v_planta_urbana_id from public.coverage_zones where code = 'planta_urbana';
  select id into v_zona_barrial_id from public.coverage_zones where code = 'zona_barrial';
  select id into v_zona_rural_id from public.coverage_zones where code = 'zona_rural';

  -- Tarifa para Planta Urbana (casco urbano) - precio base más bajo
  insert into public.shipping_tariffs (name, zone_id, mode, base_price, price_per_km, min_price, max_price, active)
  values ('Envío Planta Urbana', v_planta_urbana_id, 'zone', 1500, 0, 1500, 3000, true)
  on conflict do nothing;

  -- Tarifa para Zona Barrial (barrios) - precio intermedio
  insert into public.shipping_tariffs (name, zone_id, mode, base_price, price_per_km, min_price, max_price, active)
  values ('Envío Zona Barrial', v_zona_barrial_id, 'zone', 2500, 0, 2500, 5000, true)
  on conflict do nothing;

  -- Tarifa para Zona Rural - precio más alto
  insert into public.shipping_tariffs (name, zone_id, mode, base_price, price_per_km, min_price, max_price, active)
  values ('Envío Zona Rural', v_zona_rural_id, 'zone', 4000, 0, 4000, 8000, true)
  on conflict do nothing;

  -- Tarifa general (fallback para zonas no cubiertas)
  insert into public.shipping_tariffs (name, mode, base_price, price_per_km, min_price, max_price, active)
  values ('Envío General', 'fixed', 3000, 0, 2500, 8000, true)
  on conflict do nothing;
end $$;