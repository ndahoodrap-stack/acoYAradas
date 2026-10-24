-- =====================================================================
-- acoYAradas! - 002_rls.sql
-- Row Level Security + roles + grants.
--
-- Diseño de seguridad:
--   * La API se conecta con el rol restringido `acoyaradas_app`
--     (sin BYPASSRLS, sin ser dueño de las tablas). Cada consulta de
--     negocio se ejecuta dentro de una transacción donde la API fija
--     los claims del usuario (request.jwt.claims) y hace SET LOCAL ROLE.
--   * Un contexto "system" (propietario de las tablas) se usa solo para
--     operaciones internas controladas (tracking con token, jobs, seed).
--   * Ninguna tabla de negocio es accesible sin una política aplicable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rol de runtime
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'acoyaradas_app') then
    create role acoyaradas_app nologin;
  end if;
end
$$;

grant usage on schema public to acoyaradas_app;
grant select, insert, update, delete on all tables in schema public to acoyaradas_app;
grant usage, select on all sequences in schema public to acoyaradas_app;
alter default privileges in schema public grant select, insert, update, delete on tables to acoyaradas_app;
alter default privileges in schema public grant usage, select on sequences to acoyaradas_app;

-- ---------------------------------------------------------------------
-- Funciones de apoyo (SECURITY DEFINER: consultan el contexto de claims
-- sin quedar atrapadas en la recursión de RLS)
-- ---------------------------------------------------------------------
-- Token de invitado (carrito anónimo) leído desde los claims del JWT.
create or replace function public.app_current_guest_token()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.guest_token', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'guest_token')
  )
$$;

-- Comercios que el usuario actual administra (dueño o member)
create or replace function public.user_managed_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.stores s where s.owner_id = public.app_current_user_id()
  union
  select m.store_id from public.store_members m where m.user_id = public.app_current_user_id()
$$;

create or replace function public.is_store_manager(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_managed_store_ids() ids where ids = p_store_id
  )
$$;

create or replace function public.rider_id_for_user()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id from public.riders r where r.user_id = public.app_current_user_id() limit 1
$$;

-- Contexto interno del backend de autenticación (claim `service = 'auth'`).
-- Sólo la API lo emite: nunca proviene de un token de usuario.
create or replace function public.is_auth_service()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.service', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'service')
  ) = 'auth'
$$;

-- ---------------------------------------------------------------------
-- Helpers para relaciones cruzadas (orders <-> rider_assignments).
--
-- Estas funciones son SECURITY DEFINER y leen las tablas saltándose el
-- RLS (row_security = off). Sin este puente, las políticas de `orders` y
-- `rider_assignments` se referencian mutuamente y PostgreSQL detecta
-- "infinite recursion detected in policy" (42P17).
-- ---------------------------------------------------------------------

-- El repartidor actual está asignado al pedido indicado
create or replace function public.order_assigned_to_current_rider(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.rider_assignments ra
    where ra.order_id = p_order_id
      and ra.rider_id = public.rider_id_for_user()
  )
$$;

-- El pedido pertenece al cliente actual (o es un pedido de invitado)
create or replace function public.order_belongs_to_current_customer(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (o.customer_id is null or o.customer_id = public.app_current_user_id())
  )
$$;

-- El comercio del pedido es administrado por el usuario actual
create or replace function public.order_managed_by_current_user(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and public.is_store_manager(o.store_id)
  )
$$;

-- El cliente está visible para el usuario actual (cliente del pedido o comercio)
create or replace function public.customer_visible_to_current_user(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.orders o
    where o.customer_id = p_customer_id
      and public.is_store_manager(o.store_id)
  )
$$;

-- El usuario actual puede ver el pedido indicado
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = p_order_id
        and (
          o.customer_id = public.app_current_user_id()
          or public.is_store_manager(o.store_id)
          or o.rider_id = public.rider_id_for_user()
          or public.order_assigned_to_current_rider(p_order_id)
        )
    )
$$;

-- ---------------------------------------------------------------------
-- Habilitar RLS en todas las tablas de negocio
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  public.is_admin()
  or id = public.app_current_user_id()
  or public.customer_visible_to_current_user(profiles.id)
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (
  public.is_admin() or id = public.app_current_user_id()
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (
  public.is_admin() or id = public.app_current_user_id()
) with check (
  public.is_admin() or id = public.app_current_user_id()
);

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- local_users / refresh_tokens (solo el backend de autenticación)
-- ---------------------------------------------------------------------
-- El backend de autenticación necesita leer la credencial por email y el
-- refresh token por hash: son consultas que no dependen del usuario que
-- todavía no está identificado. Para eso la API declara el claim
-- `service = 'auth'`, que sólo el servidor emite (jamás viene de un JWT
-- de usuario). Ningún usuario puede leer estas tablas por su cuenta.
drop policy if exists local_users_all on public.local_users;
create policy local_users_all on public.local_users for all
  using (
    public.is_admin()
    or public.is_auth_service()
    or id = public.app_current_user_id()
  )
  with check (
    public.is_admin()
    or public.is_auth_service()
    or id = public.app_current_user_id()
  );

drop policy if exists refresh_tokens_all on public.refresh_tokens;
create policy refresh_tokens_all on public.refresh_tokens for all
  using (
    public.is_admin()
    or public.is_auth_service()
    or user_id = public.app_current_user_id()
  )
  with check (
    public.is_admin()
    or public.is_auth_service()
    or user_id = public.app_current_user_id()
  );

-- ---------------------------------------------------------------------
-- coverage_zones / shipping_tariffs
-- ---------------------------------------------------------------------
drop policy if exists coverage_zones_select on public.coverage_zones;
create policy coverage_zones_select on public.coverage_zones for select using (active or public.is_admin());

drop policy if exists coverage_zones_write on public.coverage_zones;
create policy coverage_zones_write on public.coverage_zones for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists shipping_tariffs_select on public.shipping_tariffs;
create policy shipping_tariffs_select on public.shipping_tariffs for select using (
  public.is_admin() or store_id is null or public.is_store_manager(store_id)
);

drop policy if exists shipping_tariffs_write on public.shipping_tariffs;
create policy shipping_tariffs_write on public.shipping_tariffs for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select using (active or public.is_admin());

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select using (
  public.is_admin()
  or public.is_store_manager(id)
  or owner_id = public.app_current_user_id()
  or (status = 'active' and deleted_at is null)
);

drop policy if exists stores_insert on public.stores;
create policy stores_insert on public.stores for insert with check (
  public.is_admin()
  or (owner_id = public.app_current_user_id() and status = 'pending')
);

drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores for update using (
  public.is_admin() or public.is_store_manager(id)
) with check (
  public.is_admin() or public.is_store_manager(id)
);

drop policy if exists stores_delete on public.stores;
create policy stores_delete on public.stores for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- store_members
-- ---------------------------------------------------------------------
drop policy if exists store_members_select on public.store_members;
create policy store_members_select on public.store_members for select using (
  public.is_admin() or user_id = public.app_current_user_id() or public.is_store_manager(store_id)
);

drop policy if exists store_members_write on public.store_members;
create policy store_members_write on public.store_members for all using (
  public.is_admin() or public.is_store_manager(store_id)
) with check (
  public.is_admin() or public.is_store_manager(store_id)
);

-- ---------------------------------------------------------------------
-- products / product_images
-- ---------------------------------------------------------------------
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (
  public.is_admin()
  or public.is_store_manager(store_id)
  or (
    status = 'active'
    and deleted_at is null
    and exists (
      select 1 from public.stores s
      where s.id = products.store_id and s.status = 'active' and s.deleted_at is null
    )
  )
);

drop policy if exists products_write on public.products;
create policy products_write on public.products for all using (
  public.is_admin() or public.is_store_manager(store_id)
) with check (
  public.is_admin() or public.is_store_manager(store_id)
);

drop policy if exists product_images_select on public.product_images;
create policy product_images_select on public.product_images for select using (
  public.is_admin()
  or exists (select 1 from public.products p where p.id = product_images.product_id and public.is_store_manager(p.store_id))
  or exists (
    select 1 from public.products p join public.stores s on s.id = p.store_id
    where p.id = product_images.product_id and p.status = 'active' and s.status = 'active'
  )
);

drop policy if exists product_images_write on public.product_images;
create policy product_images_write on public.product_images for all using (
  public.is_admin()
  or exists (select 1 from public.products p where p.id = product_images.product_id and public.is_store_manager(p.store_id))
) with check (
  public.is_admin()
  or exists (select 1 from public.products p where p.id = product_images.product_id and public.is_store_manager(p.store_id))
);

-- ---------------------------------------------------------------------
-- stock_movements
-- ---------------------------------------------------------------------
drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select using (
  public.is_admin()
  or exists (select 1 from public.products p where p.id = stock_movements.product_id and public.is_store_manager(p.store_id))
);

drop policy if exists stock_movements_insert on public.stock_movements;
create policy stock_movements_insert on public.stock_movements for insert with check (
  public.is_admin()
  or exists (select 1 from public.products p where p.id = stock_movements.product_id and public.is_store_manager(p.store_id))
);

-- ---------------------------------------------------------------------
-- carts / cart_items
-- ---------------------------------------------------------------------
drop policy if exists carts_select on public.carts;
create policy carts_select on public.carts for select using (
  user_id is not null and user_id = public.app_current_user_id()
  or (guest_token is not null and guest_token = public.app_current_guest_token())
);

drop policy if exists carts_insert on public.carts;
create policy carts_insert on public.carts for insert with check (
  (user_id is not null and user_id = public.app_current_user_id())
  or (user_id is null and guest_token is not null and guest_token = public.app_current_guest_token())
);

drop policy if exists carts_update on public.carts;
create policy carts_update on public.carts for update using (
  user_id is not null and user_id = public.app_current_user_id()
  or (guest_token is not null and guest_token = public.app_current_guest_token())
) with check (
  user_id is not null and user_id = public.app_current_user_id()
  or (guest_token is not null and guest_token = public.app_current_guest_token())
);

drop policy if exists carts_delete on public.carts;
create policy carts_delete on public.carts for delete using (
  user_id is not null and user_id = public.app_current_user_id()
  or (guest_token is not null and guest_token = public.app_current_guest_token())
);

drop policy if exists cart_items_select on public.cart_items;
create policy cart_items_select on public.cart_items for select using (
  exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id
      and (
        (c.user_id is not null and c.user_id = public.app_current_user_id())
        or (c.guest_token is not null and c.guest_token = public.app_current_guest_token())
      )
  )
);

drop policy if exists cart_items_write on public.cart_items;
create policy cart_items_write on public.cart_items for all using (
  exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id
      and (
        (c.user_id is not null and c.user_id = public.app_current_user_id())
        or (c.guest_token is not null and c.guest_token = public.app_current_guest_token())
      )
  )
) with check (
  exists (
    select 1 from public.carts c
    where c.id = cart_items.cart_id
      and (
        (c.user_id is not null and c.user_id = public.app_current_user_id())
        or (c.guest_token is not null and c.guest_token = public.app_current_guest_token())
      )
)
);

-- ---------------------------------------------------------------------
-- orders / order_items / order_status_history
-- ---------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (
  public.is_admin()
  or customer_id = public.app_current_user_id()
  or public.is_store_manager(store_id)
  or rider_id = public.rider_id_for_user()
  or public.order_assigned_to_current_rider(orders.id)
);

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (
  public.is_admin()
  or customer_id is null
  or customer_id = public.app_current_user_id()
);

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (
  public.is_admin()
  or public.is_store_manager(store_id)
  or rider_id = public.rider_id_for_user()
  or public.order_assigned_to_current_rider(orders.id)
) with check (
  public.is_admin()
  or public.is_store_manager(store_id)
  or rider_id = public.rider_id_for_user()
);

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select using (
  public.can_view_order(order_id)
);

drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert on public.order_items for insert with check (
  public.is_admin()
  or public.order_belongs_to_current_customer(order_items.order_id)
);

drop policy if exists order_history_select on public.order_status_history;
create policy order_history_select on public.order_status_history for select using (
  public.can_view_order(order_id)
);

drop policy if exists order_history_insert on public.order_status_history;
create policy order_history_insert on public.order_status_history for insert with check (
  public.is_admin() or public.can_view_order(order_id)
);

-- ---------------------------------------------------------------------
-- riders / rider_assignments
-- ---------------------------------------------------------------------
drop policy if exists riders_select on public.riders;
create policy riders_select on public.riders for select using (
  public.is_admin() or user_id = public.app_current_user_id()
);

drop policy if exists riders_write on public.riders;
create policy riders_write on public.riders for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists riders_self_update on public.riders;
create policy riders_self_update on public.riders for update using (
  public.is_admin() or user_id = public.app_current_user_id()
) with check (
  public.is_admin() or user_id = public.app_current_user_id()
);

drop policy if exists rider_assignments_select on public.rider_assignments;
create policy rider_assignments_select on public.rider_assignments for select using (
  public.is_admin()
  or rider_id = public.rider_id_for_user()
  or public.order_managed_by_current_user(rider_assignments.order_id)
);

drop policy if exists rider_assignments_write on public.rider_assignments;
create policy rider_assignments_write on public.rider_assignments for all using (
  public.is_admin() or rider_id = public.rider_id_for_user()
) with check (
  public.is_admin() or rider_id = public.rider_id_for_user()
);

-- ---------------------------------------------------------------------
-- planes / subscriptions
-- ---------------------------------------------------------------------
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select using (active or public.is_admin());

drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select using (
  public.is_admin() or public.is_store_manager(store_id)
);

drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for all using (
  public.is_admin()
) with check (
  public.is_admin()
);

-- ---------------------------------------------------------------------
-- payments / commissions / commission_rules
-- ---------------------------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (
  public.is_admin() or public.is_store_manager(store_id)
);

drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select using (
  public.is_admin() or public.is_store_manager(store_id)
);

drop policy if exists commissions_write on public.commissions;
create policy commissions_write on public.commissions for all using (public.is_admin()) with check (public.is_admin());

-- El registro de comisión del pedido se crea desde el servidor en el mismo
-- contexto del cliente que realizó la compra (el pedido debe ser suyo).
drop policy if exists commissions_insert_order on public.commissions;
create policy commissions_insert_order on public.commissions for insert with check (
  public.is_admin()
  or public.order_belongs_to_current_customer(commissions.order_id)
);

drop policy if exists commission_rules_select on public.commission_rules;
create policy commission_rules_select on public.commission_rules for select using (
  public.is_admin() or store_id is null or public.is_store_manager(store_id)
);

drop policy if exists commission_rules_write on public.commission_rules;
create policy commission_rules_write on public.commission_rules for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- publicidad
-- ---------------------------------------------------------------------
drop policy if exists ad_placements_select on public.ad_placements;
create policy ad_placements_select on public.ad_placements for select using (active or public.is_admin());

drop policy if exists ad_placements_write on public.ad_placements;
create policy ad_placements_write on public.ad_placements for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists banners_select on public.banners;
create policy banners_select on public.banners for select using (
  active
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  or public.is_admin()
);

drop policy if exists banners_write on public.banners;
create policy banners_write on public.banners for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ad_campaigns_select on public.ad_campaigns;
create policy ad_campaigns_select on public.ad_campaigns for select using (
  public.is_admin()
  or public.is_store_manager(store_id)
  or (
    status = 'active'
    and starts_at <= now() and ends_at >= now()
    and exists (select 1 from public.stores s where s.id = ad_campaigns.store_id and s.status = 'active')
  )
);

drop policy if exists ad_campaigns_insert on public.ad_campaigns;
create policy ad_campaigns_insert on public.ad_campaigns for insert with check (
  public.is_admin() or public.is_store_manager(store_id)
);

drop policy if exists ad_campaigns_update on public.ad_campaigns;
create policy ad_campaigns_update on public.ad_campaigns for update using (
  public.is_admin() or public.is_store_manager(store_id)
) with check (
  public.is_admin() or public.is_store_manager(store_id)
);

drop policy if exists ad_events_select on public.ad_events;
create policy ad_events_select on public.ad_events for select using (
  public.is_admin()
  or exists (
    select 1 from public.ad_campaigns c
    where c.id = ad_events.campaign_id and public.is_store_manager(c.store_id)
  )
);

drop policy if exists ad_events_insert on public.ad_events;
create policy ad_events_insert on public.ad_events for insert with check (true);

-- ---------------------------------------------------------------------
-- promotions
-- ---------------------------------------------------------------------
drop policy if exists promotions_select on public.promotions;
create policy promotions_select on public.promotions for select using (
  public.is_admin()
  or public.is_store_manager(store_id)
  or (
    active
    and (store_id is null or exists (
      select 1 from public.stores s where s.id = promotions.store_id and s.status = 'active'
    ))
  )
);

drop policy if exists promotions_write on public.promotions;
create policy promotions_write on public.promotions for all using (
  public.is_admin() or public.is_store_manager(store_id)
) with check (
  public.is_admin() or public.is_store_manager(store_id)
);

-- ---------------------------------------------------------------------
-- notifications / audit / settings / legal / idempotencia
-- ---------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (
  public.is_admin()
  or user_id = public.app_current_user_id()
  or rider_id = public.rider_id_for_user()
  or public.is_store_manager(store_id)
);

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert with check (
  public.is_admin()
  or user_id = public.app_current_user_id()
  or rider_id = public.rider_id_for_user()
  or public.is_store_manager(store_id)
);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (
  public.is_admin()
  or user_id = public.app_current_user_id()
  or rider_id = public.rider_id_for_user()
  or public.is_store_manager(store_id)
);

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using (public.is_admin());

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert with check (
  public.is_admin() or actor_id = public.app_current_user_id()
);

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (true);

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists legal_pages_select on public.legal_pages;
create policy legal_pages_select on public.legal_pages for select using (true);

drop policy if exists legal_pages_write on public.legal_pages;
create policy legal_pages_write on public.legal_pages for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists idempotency_select on public.idempotency_keys;
create policy idempotency_select on public.idempotency_keys for select using (public.is_admin());

drop policy if exists idempotency_write on public.idempotency_keys;
create policy idempotency_write on public.idempotency_keys for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_meta_select on public.app_meta;
create policy app_meta_select on public.app_meta for select using (true);

drop policy if exists app_meta_write on public.app_meta;
create policy app_meta_write on public.app_meta for all using (public.is_admin()) with check (public.is_admin());
