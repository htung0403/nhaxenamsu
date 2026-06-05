ALTER TABLE public.zalo_summary_dispatch_logs
  DROP CONSTRAINT IF EXISTS zalo_summary_dispatch_logs_summary_type_check;

ALTER TABLE public.zalo_summary_dispatch_logs
  ADD CONSTRAINT zalo_summary_dispatch_logs_summary_type_check
  CHECK (summary_type IN ('grocery', 'supplier', 'sender', 'vegetable_arrival'));
