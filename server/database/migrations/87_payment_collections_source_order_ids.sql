ALTER TABLE public.payment_collections
  ADD COLUMN IF NOT EXISTS source_order_ids UUID[];

CREATE INDEX IF NOT EXISTS idx_pc_source_order_ids
  ON public.payment_collections USING GIN (source_order_ids);
