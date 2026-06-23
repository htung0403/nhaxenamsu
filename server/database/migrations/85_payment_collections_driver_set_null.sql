ALTER TABLE public.payment_collections
  ALTER COLUMN driver_id DROP NOT NULL;

ALTER TABLE public.payment_collections
  DROP CONSTRAINT IF EXISTS payment_collections_driver_id_fkey;

ALTER TABLE public.payment_collections
  ADD CONSTRAINT payment_collections_driver_id_fkey
  FOREIGN KEY (driver_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
