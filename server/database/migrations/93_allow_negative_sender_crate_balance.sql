-- Allow crate senders to borrow warehouse crates.
-- Negative sender_balance means the sender owes crates back to the warehouse.

ALTER TABLE public.crate_accounts
  DROP CONSTRAINT IF EXISTS crate_accounts_sender_balance_check;

ALTER TABLE public.crate_intakes
  DROP CONSTRAINT IF EXISTS crate_intakes_sender_balance_after_check;

ALTER TABLE public.crate_allocations
  DROP CONSTRAINT IF EXISTS crate_allocations_sender_balance_after_check;

CREATE OR REPLACE FUNCTION public.crate_record_allocation(
  p_sender_customer_id UUID,
  p_receiver_customer_id UUID,
  p_quantity INTEGER,
  p_notes TEXT,
  p_created_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender public.crate_accounts%ROWTYPE;
  v_receiver public.crate_accounts%ROWTYPE;
  v_allocation public.crate_allocations%ROWTYPE;
  v_debt_applied INTEGER;
  v_pending_added INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số két chia phải lớn hơn 0';
  END IF;

  IF p_sender_customer_id = p_receiver_customer_id THEN
    RAISE EXCEPTION 'Khách gửi và khách nhận két phải khác nhau';
  END IF;

  INSERT INTO public.crate_accounts(customer_id, is_sender, sender_balance, updated_at)
  VALUES (p_sender_customer_id, TRUE, 0, NOW())
  ON CONFLICT (customer_id) DO UPDATE SET is_sender = TRUE, updated_at = NOW();

  INSERT INTO public.crate_accounts(customer_id, is_receiver, updated_at)
  VALUES (p_receiver_customer_id, TRUE, NOW())
  ON CONFLICT (customer_id) DO UPDATE SET is_receiver = TRUE, updated_at = NOW();

  SELECT * INTO v_sender FROM public.crate_accounts WHERE customer_id = p_sender_customer_id FOR UPDATE;
  SELECT * INTO v_receiver FROM public.crate_accounts WHERE customer_id = p_receiver_customer_id FOR UPDATE;

  v_debt_applied := LEAST(v_receiver.receiver_debt, p_quantity);
  v_pending_added := p_quantity - v_debt_applied;

  UPDATE public.crate_accounts
  SET sender_balance = sender_balance - p_quantity,
      updated_at = NOW()
  WHERE customer_id = p_sender_customer_id
  RETURNING * INTO v_sender;

  UPDATE public.crate_accounts
  SET receiver_debt = receiver_debt - v_debt_applied,
      receiver_pending = receiver_pending + v_pending_added,
      is_receiver = TRUE,
      updated_at = NOW()
  WHERE customer_id = p_receiver_customer_id
  RETURNING * INTO v_receiver;

  INSERT INTO public.crate_allocations(
    sender_customer_id, receiver_customer_id, quantity, debt_applied, pending_added,
    sender_balance_after, receiver_pending_after, receiver_debt_after, notes, created_by
  ) VALUES (
    p_sender_customer_id, p_receiver_customer_id, p_quantity, v_debt_applied, v_pending_added,
    v_sender.sender_balance, v_receiver.receiver_pending, v_receiver.receiver_debt, p_notes, p_created_by
  ) RETURNING * INTO v_allocation;

  RETURN jsonb_build_object(
    'sender_account', to_jsonb(v_sender),
    'receiver_account', to_jsonb(v_receiver),
    'allocation', to_jsonb(v_allocation)
  );
END;
$$;