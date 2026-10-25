-- Permitir productos de plataforma en carrito y pedidos
alter table public.cart_items drop constraint if exists cart_items_product_id_fkey;
-- product_id ya no referencia solo products (validación en app)
alter table public.order_items alter column store_id drop not null;
alter table public.order_items drop constraint if exists order_items_product_id_fkey;
alter table public.orders alter column store_id drop not null;
-- permitir NULL en product_id? ya es nullable
