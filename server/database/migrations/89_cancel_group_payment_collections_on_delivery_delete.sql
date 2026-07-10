-- Make delivery deletion cancel every payment collection that references any deleted
-- delivery order directly or through grouped source_order_ids. Confirmed payments
-- are reversed in customer_debt_ledger before the payment collection is cancelled.

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

  WITH matched_payments AS (
    SELECT
      id,
      customer_id,
      collected_amount,
      status
    FROM public.payment_collections
    WHERE status <> 'cancelled'
      AND (
        delivery_order_id = ANY(p_delivery_order_ids)
        OR COALESCE(source_order_ids, ARRAY[]::UUID[]) && p_delivery_order_ids
      )
    FOR UPDATE
  ), reversed_payments AS (
    INSERT INTO public.customer_debt_ledger (
      customer_id,
      amount,
      transaction_type,
      reference_id,
      created_by,
      notes
    )
    SELECT
      customer_id,
      collected_amount,
      'adjustment',
      id,
      p_cancelled_by,
      'Xóa đơn giao hàng - hoàn tác xác nhận thu tiền'
    FROM matched_payments
    WHERE status IN ('confirmed', 'self_confirmed')
      AND customer_id IS NOT NULL
      AND collected_amount > 0
    RETURNING id
  ), cancelled_payments AS (
    UPDATE public.payment_collections pc
    SET
      status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by = p_cancelled_by,
      cancellation_reason = COALESCE(pc.cancellation_reason, 'Delivery order deleted'),
      delivery_order_id = NULL,
      updated_at = NOW()
    FROM matched_payments mp
    WHERE pc.id = mp.id
    RETURNING pc.id
  )
  SELECT
    (SELECT COUNT(*) FROM cancelled_payments),
    (SELECT COUNT(*) FROM reversed_payments)
  INTO v_cancelled_payments, v_reversed_entries;

  WITH deleted_exports AS (
    DELETE FROM public.export_orders
    WHERE product_id::TEXT = ANY(p_delivery_order_ids::TEXT[])
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_exports FROM deleted_exports;

  v_reversed_entries := v_reversed_entries + v_deleted_exports;

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
