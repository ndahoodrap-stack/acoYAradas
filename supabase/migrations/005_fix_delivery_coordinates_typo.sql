-- =====================================================================
-- 005_fix_delivery_coordinates_typo.sql
-- Fix typo in delivery coordinates column name (delivery_Ing -> delivery_lng)
-- =====================================================================

-- Check if the typo column exists and rename it
DO $$
BEGIN
    -- If delivery_Ing (typo) exists, rename it to delivery_lng
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'delivery_Ing'
    ) THEN
        ALTER TABLE public.orders RENAME COLUMN "delivery_Ing" TO delivery_lng;
        RAISE NOTICE 'Renamed delivery_Ing to delivery_lng';
    END IF;

    -- If delivery_lat typo exists (delivery_Lat), fix it too
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'delivery_Lat'
    ) THEN
        ALTER TABLE public.orders RENAME COLUMN "delivery_Lat" TO delivery_lat;
        RAISE NOTICE 'Renamed delivery_Lat to delivery_lat';
    END IF;
END $$;

-- Ensure delivery_lng exists with correct name
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS delivery_lng numeric(10, 7);

-- Ensure delivery_lat exists with correct name
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat numeric(10, 7);

-- Recreate index with correct column names
DROP INDEX IF EXISTS orders_delivery_coords_idx;
CREATE INDEX IF NOT EXISTS orders_delivery_coords_idx ON public.orders (delivery_lng, delivery_lat)
  WHERE delivery_lng IS NOT NULL AND delivery_lat IS NOT NULL;

-- Update comments
COMMENT ON COLUMN public.orders.delivery_lng IS 'Longitud GPS de la entrega (ajustada por el cliente en el mapa)';
COMMENT ON COLUMN public.orders.delivery_lat IS 'Latitud GPS de la entrega (ajustada por el cliente en el mapa)';