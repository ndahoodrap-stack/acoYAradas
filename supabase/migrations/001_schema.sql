-- =====================================================================
-- acoYAradas! - 001_schema.sql
-- Esquema relacional completo (PostgreSQL 13+). Compatible con
-- Supabase (Postgres cloud) y con el Postgres embebido de desarrollo.
--
-- Convenciones:
--   * Importes: numeric(12,2) (se manipulan como number en el servidor,
--     con redondeo explícito a 2 decimales).
--   * Fechas: timestamptz.
--   * Borrado lógico donde corresponde (deleted_at) para no perder trazabilidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------
-- Nota: no se requiere ninguna extensión. gen_random_uuid() viene en el
-- núcleo de PostgreSQL 13+ y el hash de contraseñas se calcula en la API
-- (node:crypto scrypt), por lo que no se depende de pgcrypto.

-- ---------------------------------------------------------------------
-- Enums (idempotentes)
-- ---------------------------------------------------------------------
do $$ begin create type public.user_role as enum ('admin','store_owner','store_staff','courier','customer');
exception when duplicate_object then null; end $$;
do $$ begin create type public.store_status as enum ('pending','active','suspended','rejected');
exception when duplicate_object then null; end $$;
do $$ begin create type public.product_status as enum ('draft','pending_review','active','inactive');
exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('pending_confirmation','confirmed','preparing','ready','rider_assigned','on_the_way','delivered','cancelled','incident');
exception when duplicate_object then null; end $$;
do $$ begin create type public.delivery_mode as enum ('platform','merchant');
exception when duplicate_object then null; end $$;
do $$ begin create type public.fulfillment_type as enum ('delivery','pickup');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_method as enum ('cash','transfer','cash_on_delivery');
exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('pending','confirmed','failed','refunded');
exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_status as enum ('active','past_due','cancelled','expired');
exception when duplicate_object then null; end $$;
do $$ begin create type public.campaign_status as enum ('draft','pending','active','paused','finished','rejected');
exception when duplicate_object then null; end $$;
do $$ begin create type public.ad_placement as enum ('home_banner','category_featured','product_sponsored');
exception when duplicate_object then null; end $$;
do $$ begin create type public.rider_assignment_status as enum ('assigned','picked_up','delivered','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_channel as enum ('in_app','whatsapp','email');
exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_status as enum ('queued','sent','failed','skipped');
exception when duplicate_object then null; end $$;
do $$ begin create type public.commission_status as enum ('pending','settled','waived');
exception when duplicate_object then null; end $$;
do $$ begin create type public.finance_kind as enum ('subscription','advertising','commission','order','refund');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Funciones de apoyo
-- ---------------------------------------------------------------------

-- Devuelve el id del usuario autenticado según los claims de la request.
-- Funciona igual en Supabase (PostgREST setea request.jwt.claims) y en el
-- servidor de la API (setea los claims antes de cada consulta).
create or replace function public.app_current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;

create or replace function public.app_current_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

create or replace function public.app_current_email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.app_current_role() = 'admin', false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfiles y usuarios
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  full_name    text,
  phone        text,
  role         public.user_role not null default 'customer',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Usuarios de autenticación local (modo standalone).
-- En modo Supabase la autenticación vive en Supabase Auth y esta tabla
-- no se usa (ver supabase/migrations/003_supabase_auth.sql).
create table if not exists public.local_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  role          public.user_role not null default 'customer',
  created_at    timestamptz not null default now()
);
create unique index if not exists local_users_email_key on public.local_users (lower(email));

-- Refresh tokens (modo local). Se guardan hasheados.
create table if not exists public.refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.local_users(id) on delete cascade,
  token_hash   text not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists refresh_tokens_hash_key on public.refresh_tokens (token_hash);
create index if not exists refresh_tokens_user_idx on public.refresh_tokens (user_id);

-- ---------------------------------------------------------------------
-- Zonas de cobertura y tarifas
-- ---------------------------------------------------------------------
create table if not exists public.coverage_zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.shipping_tariffs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  zone_id      uuid references public.coverage_zones(id) on delete set null,
  store_id     uuid,  -- FK agregada luego (stores depende de profiles)
  mode         text not null default 'fixed' check (mode in ('fixed','distance','zone')),
  base_price   numeric(12,2) not null default 0,
  price_per_km numeric(12,2) not null default 0,
  min_price    numeric(12,2),
  max_price    numeric(12,2),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists shipping_tariffs_zone_idx on public.shipping_tariffs (zone_id);
create index if not exists shipping_tariffs_store_idx on public.shipping_tariffs (store_id);

drop trigger if exists shipping_tariffs_touch on public.shipping_tariffs;
create trigger shipping_tariffs_touch before update on public.shipping_tariffs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  icon_url   text,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Comercios
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null references public.profiles(id) on delete restrict,
  name                      text not null,
  slug                      text not null unique,
  logo_url                  text,
  cover_url                 text,
  description               text,
  category_id               uuid references public.categories(id) on delete set null,
  phone                     text,
  whatsapp                  text,
  email                     text,
  address                   text,
  locality                  text,
  zone_id                   uuid references public.coverage_zones(id) on delete set null,
  status                    public.store_status not null default 'pending',
  is_open                   boolean not null default true,
  featured                  boolean not null default false,
  open_hours                jsonb not null default '{}'::jsonb,
  preparation_time_minutes  integer,
  allows_platform_delivery  boolean not null default false,
  allows_merchant_delivery  boolean not null default false,
  allows_pickup             boolean not null default true,
  merchant_delivery_fee     numeric(12,2) not null default 0,
  merchant_delivery_notes   text,
  accepts_cash              boolean not null default true,
  accepts_transfer          boolean not null default false,
  accepts_cash_on_delivery  boolean not null default false,
  accepts_terms             boolean not null default false,
  verified                  boolean not null default false,
  rating                    numeric(3,2) not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz
);
create index if not exists stores_owner_idx on public.stores (owner_id);
create index if not exists stores_status_idx on public.stores (status);
create index if not exists stores_category_idx on public.stores (category_id);
create index if not exists stores_slug_idx on public.stores (slug);
create index if not exists stores_deleted_idx on public.stores (deleted_at);

drop trigger if exists stores_touch on public.stores;
create trigger stores_touch before update on public.stores
  for each row execute function public.touch_updated_at();

-- Miembros del comercio (vendedores, cajeros)
create table if not exists public.store_members (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.user_role not null default 'store_staff',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name        text not null,
  slug        text not null,
  description text,
  price       numeric(12,2) not null check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  image_url   text,
  is_available boolean not null default true,
  featured    boolean not null default false,
  status      public.product_status not null default 'active',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (store_id, slug)
);
create index if not exists products_store_idx on public.products (store_id);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_featured_idx on public.products (featured) where featured = true;
create index if not exists products_status_idx on public.products (status);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table if not exists public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id);

-- Movimientos de stock (trazabilidad y control de oversell)
create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  order_id   uuid,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id);

-- ---------------------------------------------------------------------
-- Carritos
-- ---------------------------------------------------------------------
create table if not exists public.carts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  guest_token text,
  store_id    uuid references public.stores(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists carts_user_key on public.carts (user_id) where user_id is not null;
create unique index if not exists carts_guest_key on public.carts (guest_token) where guest_token is not null;

drop trigger if exists carts_touch on public.carts;
create trigger carts_touch before update on public.carts
  for each row execute function public.touch_updated_at();

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  public_token         text not null unique,
  store_id             uuid not null references public.stores(id) on delete restrict,
  customer_id          uuid references public.profiles(id) on delete set null,
  customer_name        text not null,
  phone                text not null,
  address              text,
  locality             text,
  reference_notes      text,
  notes                text,
  fulfillment_type     public.fulfillment_type not null default 'delivery',
  delivery_mode        public.delivery_mode not null default 'merchant',
  status               public.order_status not null default 'pending_confirmation',
  subtotal             numeric(12,2) not null default 0,
  discount             numeric(12,2) not null default 0,
  shipping_cost        numeric(12,2) not null default 0,
  total                numeric(12,2) not null default 0,
  payment_method       public.payment_method not null,
  payment_status       public.payment_status not null default 'pending',
  estimated_preparation_minutes integer,
  shipping_notes       text,
  merchant_responsible text,
  promotion_id         uuid,
  rider_id             uuid,
  commission_status    public.commission_status not null default 'pending',
  idempotency_key      text unique,
  placed_at            timestamptz not null default now(),
  confirmed_at         timestamptz,
  ready_at             timestamptz,
  delivered_at         timestamptz,
  cancelled_at         timestamptz,
  cancel_reason        text,
  incident_notes       text,
  updated_at           timestamptz not null default now()
);
create index if not exists orders_store_idx on public.orders (store_id);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_placed_idx on public.orders (placed_at desc);
create index if not exists orders_rider_idx on public.orders (rider_id);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  store_id       uuid not null references public.stores(id) on delete restrict,
  name_snapshot  text not null,
  price_snapshot numeric(12,2) not null,
  quantity       integer not null check (quantity > 0),
  notes          text,
  line_total     numeric(12,2) not null
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     public.order_status not null,
  note       text,
  actor_id   uuid,
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_idx on public.order_status_history (order_id);

-- ---------------------------------------------------------------------
-- Repartidores
-- ---------------------------------------------------------------------
create table if not exists public.riders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  full_name    text not null,
  phone        text not null,
  vehicle_type text,
  zones        text[] not null default '{}',
  active       boolean not null default true,
  available    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists riders_active_idx on public.riders (active, available);

drop trigger if exists riders_touch on public.riders;
create trigger riders_touch before update on public.riders
  for each row execute function public.touch_updated_at();

create table if not exists public.rider_assignments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  rider_id         uuid not null references public.riders(id) on delete cascade,
  assigned_by      uuid references public.profiles(id) on delete set null,
  status           public.rider_assignment_status not null default 'assigned',
  amount_collected numeric(12,2) not null default 0,
  amount_due       numeric(12,2) not null default 0,
  notes            text,
  assigned_at      timestamptz not null default now(),
  picked_up_at     timestamptz,
  delivered_at     timestamptz
);
create index if not exists rider_assignments_order_idx on public.rider_assignments (order_id);
create index if not exists rider_assignments_rider_idx on public.rider_assignments (rider_id);

-- ---------------------------------------------------------------------
-- Planes, suscripciones y finanzas
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text not null unique,
  price          numeric(12,2) not null default 0,
  billing_period text not null default 'monthly' check (billing_period in ('monthly','yearly')),
  product_limit  integer not null default 10,
  promo_limit    integer not null default 1,
  features       text[] not null default '{}',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

create table if not exists public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  plan_id      uuid not null references public.plans(id) on delete restrict,
  status       public.subscription_status not null default 'active',
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null,
  auto_renew   boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists subscriptions_store_idx on public.subscriptions (store_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid references public.stores(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  campaign_id     uuid,
  kind            public.finance_kind not null,
  amount          numeric(12,2) not null check (amount >= 0),
  method          public.payment_method,
  status          public.payment_status not null default 'pending',
  due_at          timestamptz,
  paid_at         timestamptz,
  confirmed_at    timestamptz,
  confirmed_by    uuid references public.profiles(id) on delete set null,
  external_ref    text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists payments_external_ref_key on public.payments (external_ref) where external_ref is not null;
create index if not exists payments_store_idx on public.payments (store_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_kind_idx on public.payments (kind);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Comisiones: una por pedido, con base de cálculo explícita.
create table if not exists public.commissions (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders(id) on delete cascade,
  store_id         uuid not null references public.stores(id) on delete cascade,
  gross_amount     numeric(12,2) not null default 0,
  discount_amount  numeric(12,2) not null default 0,
  shipping_amount  numeric(12,2) not null default 0,
  commission_base  numeric(12,2) not null default 0,
  rate_type        text not null default 'percent' check (rate_type in ('percent','fixed')),
  rate_value       numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  net_amount       numeric(12,2) not null default 0,
  status           public.commission_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists commissions_store_idx on public.commissions (store_id);
create index if not exists commissions_status_idx on public.commissions (status);

drop trigger if exists commissions_touch on public.commissions;
create trigger commissions_touch before update on public.commissions
  for each row execute function public.touch_updated_at();

create table if not exists public.commission_rules (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid references public.stores(id) on delete cascade,
  type       text not null check (type in ('percent','fixed')),
  value      numeric(12,2) not null default 0,
  basis      text not null default 'product_total' check (basis in ('product_total','order_total')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commission_rules_store_idx on public.commission_rules (store_id);

-- ---------------------------------------------------------------------
-- Publicidad
-- ---------------------------------------------------------------------
create table if not exists public.ad_placements (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  description  text,
  price_per_day numeric(12,2) not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists ad_placements_touch on public.ad_placements;
create trigger ad_placements_touch before update on public.ad_placements
  for each row execute function public.touch_updated_at();

create table if not exists public.banners (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  subtitle   text,
  image_url  text,
  link_url   text,
  placement  public.ad_placement not null default 'home_banner',
  sort_order integer not null default 0,
  active     boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists banners_placement_idx on public.banners (placement);

drop trigger if exists banners_touch on public.banners;
create trigger banners_touch before update on public.banners
  for each row execute function public.touch_updated_at();

create table if not exists public.ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  placement      public.ad_placement not null,
  banner_id      uuid references public.banners(id) on delete set null,
  product_id     uuid references public.products(id) on delete set null,
  title          text not null,
  body           text,
  image_url      text,
  link_url       text,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  price          numeric(12,2) not null default 0,
  status         public.campaign_status not null default 'pending',
  impressions    integer not null default 0,
  clicks         integer not null default 0,
  review_note    text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ad_campaigns_dates check (ends_at > starts_at)
);
create index if not exists ad_campaigns_store_idx on public.ad_campaigns (store_id);
create index if not exists ad_campaigns_status_idx on public.ad_campaigns (status);
create index if not exists ad_campaigns_dates_idx on public.ad_campaigns (starts_at, ends_at);

drop trigger if exists ad_campaigns_touch on public.ad_campaigns;
create trigger ad_campaigns_touch before update on public.ad_campaigns
  for each row execute function public.touch_updated_at();

create table if not exists public.ad_events (
  id         uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  type       text not null check (type in ('impression','click')),
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index if not exists ad_events_campaign_idx on public.ad_events (campaign_id);

-- ---------------------------------------------------------------------
-- Promociones
-- ---------------------------------------------------------------------
create table if not exists public.promotions (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid references public.stores(id) on delete cascade,
  title         text not null,
  description   text,
  discount_type text not null default 'percent' check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null default 0,
  code          text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  min_subtotal  numeric(12,2) not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists promotions_store_idx on public.promotions (store_id);
create index if not exists promotions_active_idx on public.promotions (active);

drop trigger if exists promotions_touch on public.promotions;
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade,
  store_id   uuid references public.stores(id) on delete cascade,
  rider_id   uuid references public.riders(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete cascade,
  channel    public.notification_channel not null default 'in_app',
  template   text not null,
  payload    jsonb not null default '{}'::jsonb,
  status     public.notification_status not null default 'queued',
  attempts   integer not null default 0,
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists notifications_order_idx on public.notifications (order_id);
create index if not exists notifications_status_idx on public.notifications (status);

-- ---------------------------------------------------------------------
-- Auditoría y configuración
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_role  text,
  actor_name  text,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

create table if not exists public.legal_pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists legal_pages_touch on public.legal_pages;
create trigger legal_pages_touch before update on public.legal_pages
  for each row execute function public.touch_updated_at();

-- Tabla de idempotencia para evitar cobros/pedidos duplicados
create table if not exists public.idempotency_keys (
  key        text primary key,
  scope      text not null,
  result     jsonb,
  created_at timestamptz not null default now()
);

-- Tabla de compatibilidad con la zona horaria: se usa para el filtro
-- de fechas de los reportes (UTC).
create table if not exists public.app_meta (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_meta (key, value) values ('schema_version', '1')
  on conflict (key) do update set value = excluded.value;
