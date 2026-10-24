-- Bajas lógicas y ajustes de operación local
-- La plataforma opera exclusivamente en San Carlos de Bolívar.

-- Repartidores: baja lógica para no perder el historial de asignaciones.
alter table public.riders
  add column if not exists deleted_at timestamptz;

create index if not exists riders_deleted_idx on public.riders (deleted_at);

-- Pedidos cancelados por el administrador: se guarda el motivo.
alter table public.orders
  add column if not exists cancel_reason text;

-- Zonas y tarifas: baja lógica para conservar referencias históricas.
alter table public.coverage_zones
  add column if not exists deleted_at timestamptz;

alter table public.shipping_tariffs
  add column if not exists deleted_at timestamptz;

alter table public.plans
  add column if not exists deleted_at timestamptz;

alter table public.ad_placements
  add column if not exists deleted_at timestamptz;

alter table public.commission_rules
  add column if not exists deleted_at timestamptz;

create index if not exists coverage_zones_deleted_idx on public.coverage_zones (deleted_at);
create index if not exists shipping_tariffs_deleted_idx on public.shipping_tariffs (deleted_at);
create index if not exists plans_deleted_idx on public.plans (deleted_at);
create index if not exists ad_placements_deleted_idx on public.ad_placements (deleted_at);
create index if not exists commission_rules_deleted_idx on public.commission_rules (deleted_at);

-- El dueño/encargado recibe todos los avisos de WhatsApp.
insert into public.settings (key, value)
values ('whatsapp', '{"enabled": true, "mode": "links", "auto_open": true, "auto_send": false}'::jsonb)
on conflict (key) do nothing;
