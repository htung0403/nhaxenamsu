DROP INDEX IF EXISTS public.unique_active_collection;

CREATE UNIQUE INDEX unique_active_collection
  ON public.payment_collections(delivery_order_id, vehicle_id)
  WHERE status IN ('submitted', 'confirmed', 'self_confirmed')
    AND delivery_order_id IS NOT NULL;

    
