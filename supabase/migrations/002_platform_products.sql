-- Productos no afiliados (gestionados por admin)
create table if not exists public.platform_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric(12,2) not null default 0,
  stock       integer not null default 0,
  image_url   text,
  category_id uuid references public.categories(id) on delete set null,
  is_available boolean not null default true,
  featured    boolean not null default false,
  status      text not null default 'active',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists platform_products_status_idx on public.platform_products (status);
create index if not exists platform_products_deleted_idx on public.platform_products (deleted_at);

drop trigger if exists platform_products_touch on public.platform_products;
create trigger platform_products_touch before update on public.platform_products
  for each row execute function public.touch_updated_at();
