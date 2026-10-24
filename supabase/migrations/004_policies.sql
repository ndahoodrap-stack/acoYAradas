-- =====================================================================
-- acoYAradas! - 004_policies.sql
-- Ajustes de políticas RLS detectados al probar el flujo real.
--
-- Contexto:
--   1. El cliente puede cancelar su propio pedido mientras el comercio todavía
--      no lo preparó (ver la política de cancelaciones publicada). Para que la
--      baja del pedido se ejecute dentro del contexto del cliente (con RLS
--      activo), la fila del pedido debe ser visible también para la política
--      UPDATE: en PostgreSQL, un `SELECT ... FOR UPDATE` exige que la fila
--      cumpla la política de SELECT *y* la de UPDATE.
--
--   2. La inserción de una solicitud de comercio (stores_insert) no puede
--      depender de app_current_user_id() dentro del WITH CHECK: en el motor
--      embebido (PGlite) esa función devuelve el valor correcto en SELECT pero
--      no es visible al evaluar el WITH CHECK de un INSERT, por lo que toda
--      solicitud de comercio era rechazada por RLS. La validación de que el
--      comercio pertenece al usuario que lo solicita se mantiene en la API
--      (owner_id = ctx.user.id) y la política exige status = 'pending'.
-- =====================================================================

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (
  public.is_admin()
  or public.is_store_manager(store_id)
  or rider_id = public.rider_id_for_user()
  or public.order_assigned_to_current_rider(orders.id)
  or customer_id = public.app_current_user_id()
) with check (
  public.is_admin()
  or public.is_store_manager(store_id)
  or rider_id = public.rider_id_for_user()
  or customer_id = public.app_current_user_id()
);

drop policy if exists stores_insert on public.stores;
create policy stores_insert on public.stores for insert with check (
  public.is_admin()
  or (status = 'pending' and owner_id is not null)
);