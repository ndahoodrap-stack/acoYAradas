-- =====================================================================
-- acoYAradas! - 003_functions.sql
-- Funciones de negocio que deben ejecutarse con privilegios del
-- propietario (el cliente no puede tocar stock ni precios).
-- =====================================================================

-- Descuento de stock atómico con bloqueo de fila (evita oversell).
create or replace function public.decrement_stock(
  p_product_id uuid,
  p_quantity integer,
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_stock integer;
begin
  if p_quantity <= 0 then
    raise exception 'Cantidad inválida';
  end if;

  select stock into v_stock from public.products where id = p_product_id for update;

  if v_stock is null then
    raise exception 'PRODUCTO_INEXISTENTE';
  end if;
  if v_stock < p_quantity then
    raise exception 'STOCK_INSUFICIENTE:%', v_stock;
  end if;

  update public.products set stock = stock - p_quantity, updated_at = now() where id = p_product_id;

  insert into public.stock_movements (product_id, order_id, delta, reason)
  values (p_product_id, p_order_id, -p_quantity, 'pedido');

  return v_stock - p_quantity;
end;
$$;

-- Devuelve stock al cancelar un pedido.
create or replace function public.restore_stock(
  p_product_id uuid,
  p_quantity integer,
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_stock integer;
begin
  update public.products set stock = stock + p_quantity, updated_at = now() where id = p_product_id
  returning stock into v_stock;

  insert into public.stock_movements (product_id, order_id, delta, reason)
  values (p_product_id, p_order_id, p_quantity, 'cancelacion');

  return v_stock;
end;
$$;

revoke all on function public.decrement_stock(uuid, integer, uuid) from public;
revoke all on function public.restore_stock(uuid, integer, uuid) from public;
grant execute on function public.decrement_stock(uuid, integer, uuid) to acoyaradas_app;
grant execute on function public.restore_stock(uuid, integer, uuid) to acoyaradas_app;

-- Registra una impresión o un clic de una campaña publicitaria.
create or replace function public.register_ad_event(
  p_campaign_id uuid,
  p_type text,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_type not in ('impression','click') then
    raise exception 'TIPO_INVALIDO';
  end if;

  insert into public.ad_events (campaign_id, type, user_id)
  values (p_campaign_id, p_type, p_user_id);

  if p_type = 'impression' then
    update public.ad_campaigns set impressions = impressions + 1, updated_at = now()
     where id = p_campaign_id;
  else
    update public.ad_campaigns set clicks = clicks + 1, updated_at = now()
     where id = p_campaign_id;
  end if;
end;
$$;

revoke all on function public.register_ad_event(uuid, text, uuid) from public;
grant execute on function public.register_ad_event(uuid, text, uuid) to acoyaradas_app;

