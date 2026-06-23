-- Create the RPC used by POST /delivery/delete.
-- PostgREST matches RPC calls by argument names, so keep these exact names:
--   p_delivery_order_ids, p_cancelled_by

ALTER TABLE public.payment_collections
  DROP CONSTRAINT IF EXISTS payment_collections_status_check;

ALTER TABLE public.payment_collections
  ADD CONSTRAINT payment_collections_status_check
  CHECK (status IN ('draft','submitted','confirmed','self_confirmed','cancelled'));

ALTER TABLE public.payment_collections
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.payment_collections
  ALTER COLUMN delivery_order_id DROP NOT NULL;

ALTER TABLE public.payment_collections
  DROP CONSTRAINT IF EXISTS payment_collections_delivery_order_id_fkey;

ALTER TABLE public.payment_collections
  ADD CONSTRAINT payment_collections_delivery_order_id_fkey
  FOREIGN KEY (delivery_order_id)
  REFERENCES public.delivery_orders(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.cancel_invoice_cascade_by_delivery_ids(
  p_delivery_order_ids UUID[],
  p_cancelled_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled_deliveries INTEGER := 0;
  v_cancelled_payments INTEGER := 0;
  v_reversed_entries INTEGER := 0;
  v_deleted_exports INTEGER := 0;
BEGIN
  IF p_delivery_order_ids IS NULL OR cardinality(p_delivery_order_ids) = 0 THEN
    RETURN jsonb_build_object(
      'cancelled_deliveries', 0,
      'cancelled_payments', 0,
      'reversed_entries', 0,
      'deleted_exports', 0
    );
  END IF;

  UPDATE public.payment_collections
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancelled_by = p_cancelled_by,
    cancellation_reason = COALESCE(cancellation_reason, 'Delivery order deleted'),
    delivery_order_id = NULL,
    updated_at = NOW()
  WHERE delivery_order_id = ANY(p_delivery_order_ids)
    AND status <> 'cancelled';
  GET DIAGNOSTICS v_cancelled_payments = ROW_COUNT;

  WITH deleted_exports AS (
    DELETE FROM public.export_orders
    WHERE product_id::TEXT = ANY(p_delivery_order_ids::TEXT[])
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_exports FROM deleted_exports;

  -- Deleting export_orders fires trg_export_order_to_ledger, which writes the
  -- compensating customer_debt_ledger adjustment. Count those deleted exports as
  -- reversed entries because each deleted export reverses its order debt.
  v_reversed_entries := v_deleted_exports;

  WITH deleted_deliveries AS (
    DELETE FROM public.delivery_orders
    WHERE id = ANY(p_delivery_order_ids)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cancelled_deliveries FROM deleted_deliveries;

  RETURN jsonb_build_object(
    'cancelled_deliveries', v_cancelled_deliveries,
    'cancelled_payments', v_cancelled_payments,
    'reversed_entries', v_reversed_entries,
    'deleted_exports', v_deleted_exports
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_invoice_cascade_by_delivery_ids(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_cascade_by_delivery_ids(UUID[], UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
