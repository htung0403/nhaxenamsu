ALTER TABLE public.payment_collections
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pc_confirmed_by ON public.payment_collections(confirmed_by);

NOTIFY pgrst, 'reload schema';
