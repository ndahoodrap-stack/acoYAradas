-- =====================================================================
-- BORRAR PEDIDOS DE PRUEBA — Versión que FUNCIONA
-- Ejecutar en Supabase → SQL Editor
-- =====================================================================

-- =====================================================================
-- PASO 1: VERIFICAR qué se va a borrar (ejecutá SOLO esto primero)
-- =====================================================================
-- ✏️ Cambia 'iltano@acoyaradas.app' por el email real
SELECT o.id, o.code, o.customer_name, o.phone, o.placed_at, o.status, s.name as comercio
FROM public.orders o
JOIN public.stores s ON s.id = o.store_id
JOIN public.profiles p ON p.id = s.owner_id
WHERE lower(p.email) = lower('iltano@acoyaradas.app')
ORDER BY o.placed_at DESC;

-- Si el SELECT de arriba NO devuelve filas → el email no matchea.
-- Verificá en la tabla profiles: SELECT * FROM public.profiles WHERE email ILIKE '%iltano%';

-- =====================================================================
-- PASO 2: BORRAR — Opción A: Un solo bloque CTE encadenado (recomendado)
-- =====================================================================
-- ✏️ Cambia 'iltano@acoyaradas.app' por el email real
WITH target AS (
  SELECT o.id
  FROM public.orders o
  JOIN public.stores s ON s.id = o.store_id
  JOIN public.profiles p ON p.id = s.owner_id
  WHERE lower(p.email) = lower('iltano@acoyaradas.app')
),
del_items AS (DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_history AS (DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_assignments AS (DELETE FROM public.rider_assignments WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_commissions AS (DELETE FROM public.commissions WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_payments AS (DELETE FROM public.payments WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_notifications AS (DELETE FROM public.notifications WHERE order_id IN (SELECT id FROM target) RETURNING order_id)
DELETE FROM public.orders WHERE id IN (SELECT id FROM target);

-- =====================================================================
-- PASO 2 (alternativa): BORRAR — Opción B: Si querés pegar los IDs a mano
-- =====================================================================
-- 1. Ejecutá el PASO 1 y copiá los UUIDs de la columna 'id'
-- 2. Pegálos abajo reemplazando 'uuid-1', 'uuid-2', ...
/*
DELETE FROM public.order_items            WHERE order_id IN ('uuid-1', 'uuid-2', 'uuid-3');
DELETE FROM public.order_status_history   WHERE order_id IN ('uuid-1', 'uuid-2', 'uuid-3');
DELETE FROM public.rider_assignments      WHERE order_id IN ('uuid-1', 'uuid-2', 'uuid-3');
DELETE FROM public.commissions            WHERE order_id IN ('uuid-1', 'uuid-2', 'uuid-3');
DELETE FROM public.payments               WHERE order_id IN ('uuid-1', 'uuid-2', 'uuid-3');
DELETE FROM public.notifications          WHERE order_id IN ('uuid-1', 'uuid-2', 'uuid-3');
DELETE FROM public.orders                 WHERE id IN ('uuid-1', 'uuid-2', 'uuid-3');
*/

-- =====================================================================
-- PASO 3: TU PERFIL (admin/propio) — mismo esquema
-- =====================================================================
-- ✏️ Cambia 'tu@email.com' por tu email real
SELECT o.id, o.code, o.customer_name, o.phone, o.placed_at, o.status
FROM public.orders o
JOIN public.profiles p ON p.id = o.customer_id
WHERE lower(p.email) = lower('tu@email.com')
ORDER BY o.placed_at DESC;

-- Opción A: CTE encadenado
/*
WITH target AS (
  SELECT o.id
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.customer_id
  WHERE lower(p.email) = lower('tu@email.com')
),
del_items AS (DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_history AS (DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_assignments AS (DELETE FROM public.rider_assignments WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_commissions AS (DELETE FROM public.commissions WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_payments AS (DELETE FROM public.payments WHERE order_id IN (SELECT id FROM target) RETURNING order_id),
del_notifications AS (DELETE FROM public.notifications WHERE order_id IN (SELECT id FROM target) RETURNING order_id)
DELETE FROM public.orders WHERE id IN (SELECT id FROM target);
*/

-- =====================================================================
-- NOTAS IMPORTANTES
-- =====================================================================
-- * "Success. No rows returned" = el CTE target no encontró IDs → email no matchea
-- * Ejecutá SIEMPRE el SELECT de verificación ANTES del DELETE
-- * Si el SELECT devuelve filas pero el DELETE no borra → copiá los IDs y usá Opción B
-- * Las FKs tienen ON DELETE CASCADE, pero borramos en orden explícito por seguridad
-- * Para borrar también el perfil: DELETE FROM public.profiles WHERE lower(email) = lower('...');