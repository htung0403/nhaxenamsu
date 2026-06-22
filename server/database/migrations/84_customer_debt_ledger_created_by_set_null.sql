ALTER TABLE public.customer_debt_ledger
  DROP CONSTRAINT IF EXISTS customer_debt_ledger_created_by_fkey;

ALTER TABLE public.customer_debt_ledger
  ADD CONSTRAINT customer_debt_ledger_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
