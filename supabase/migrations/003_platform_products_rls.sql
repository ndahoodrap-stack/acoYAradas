alter table public.platform_products enable row level security;

drop policy if exists platform_products_select on public.platform_products;
create policy platform_products_select on public.platform_products for select using (
  public.is_admin()
  or (
    status = 'active'
    and deleted_at is null
    and is_available = true
  )
);

drop policy if exists platform_products_write on public.platform_products;
create policy platform_products_write on public.platform_products for all using (
  public.is_admin()
) with check (
  public.is_admin()
);
