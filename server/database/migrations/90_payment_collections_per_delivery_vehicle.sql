ALTER TABLE public.payment_collections
  ADD COLUMN IF NOT EXISTS delivery_vehicle_id UUID REFERENCES public.delivery_vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pc_delivery_vehicle_id
  ON public.payment_collections(delivery_vehicle_id);

DROP INDEX IF EXISTS public.unique_active_collection;

CREATE UNIQUE INDEX unique_active_collection
  ON public.payment_collections(delivery_vehicle_id)
  WHERE status IN ('submitted', 'confirmed', 'self_confirmed')
    AND delivery_vehicle_id IS NOT NULL;
