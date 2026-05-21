-- 82_customer_location_coordinates.sql
-- Optional customer coordinates used to render delivery destination pins on driver map.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11,8);

CREATE INDEX IF NOT EXISTS idx_customers_location
  ON public.customers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
