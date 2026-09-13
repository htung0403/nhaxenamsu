-- Crate / plastic basket management between vegetable senders and receivers.

CREATE TABLE IF NOT EXISTS public.crate_accounts (
  customer_id UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  is_sender BOOLEAN NOT NULL DEFAULT FALSE,
  is_receiver BOOLEAN NOT NULL DEFAULT FALSE,
  sender_balance INTEGER NOT NULL DEFAULT 0 CHECK (sender_balance >= 0),
  receiver_pending INTEGER NOT NULL DEFAULT 0 CHECK (receiver_pending >= 0),
  receiver_debt INTEGER NOT NULL DEFAULT 0 CHECK (receiver_debt >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crate_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_customer_id UUID NOT NULL REFERENCES public.customers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sender_balance_after INTEGER NOT NULL CHECK (sender_balance_after >= 0),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crate_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_customer_id UUID NOT NULL REFERENCES public.customers(id),
  receiver_customer_id UUID NOT NULL REFERENCES public.customers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  debt_applied INTEGER NOT NULL DEFAULT 0 CHECK (debt_applied >= 0),
  pending_added INTEGER NOT NULL DEFAULT 0 CHECK (pending_added >= 0),
  sender_balance_after INTEGER NOT NULL CHECK (sender_balance_after >= 0),
  receiver_pending_after INTEGER NOT NULL CHECK (receiver_pending_after >= 0),
  receiver_debt_after INTEGER NOT NULL CHECK (receiver_debt_after >= 0),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crate_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_customer_id UUID NOT NULL REFERENCES public.customers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  pending_before INTEGER NOT NULL CHECK (pending_before >= 0),
  debt_created INTEGER NOT NULL DEFAULT 0 CHECK (debt_created >= 0),
  receiver_pending_after INTEGER NOT NULL CHECK (receiver_pending_after >= 0),
  receiver_debt_after INTEGER NOT NULL CHECK (receiver_debt_after >= 0),
  notes TEXT,
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crate_deliveries
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.crate_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('intake', 'allocation', 'delivery')),
  transaction_id UUID NOT NULL,
  target_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  target_name TEXT,
  target_phone TEXT,
  public_link TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  message_id TEXT,
  triggered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crate_accounts_sender ON public.crate_accounts(is_sender) WHERE is_sender = TRUE;
CREATE INDEX IF NOT EXISTS idx_crate_accounts_receiver ON public.crate_accounts(is_receiver) WHERE is_receiver = TRUE;
CREATE INDEX IF NOT EXISTS idx_crate_intakes_sender_created ON public.crate_intakes(sender_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_allocations_sender_created ON public.crate_allocations(sender_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_allocations_receiver_created ON public.crate_allocations(receiver_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_deliveries_receiver_created ON public.crate_deliveries(receiver_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_notification_logs_tx ON public.crate_notification_logs(transaction_type, transaction_id);

CREATE OR REPLACE FUNCTION public.crate_record_intake(
  p_sender_customer_id UUID,
  p_quantity INTEGER,
  p_notes TEXT,
  p_created_by UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account public.crate_accounts%ROWTYPE;
  v_intake public.crate_intakes%ROWTYPE;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số két nhập phải lớn hơn 0';
  END IF;

  INSERT INTO public.crate_accounts(customer_id, is_sender, sender_balance, updated_at)
  VALUES (p_sender_customer_id, TRUE, 0, NOW())
  ON CONFLICT (customer_id) DO UPDATE SET is_sender = TRUE, updated_at = NOW();

  SELECT * INTO v_account FROM public.crate_accounts WHERE customer_id = p_sender_customer_id FOR UPDATE;

  UPDATE public.crate_accounts
  SET sender_balance = sender_balance + p_quantity,
      is_sender = TRUE,
      updated_at = NOW()
  WHERE customer_id = p_sender_customer_id
  RETURNING * INTO v_account;

  INSERT INTO public.crate_intakes(sender_customer_id, quantity, sender_balance_after, notes, created_by)
  VALUES (p_sender_customer_id, p_quantity, v_account.sender_balance, p_notes, p_created_by)
  RETURNING * INTO v_intake;

  RETURN jsonb_build_object('account', to_jsonb(v_account), 'intake', to_jsonb(v_intake));
END;
$$;

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

  IF v_sender.sender_balance < p_quantity THEN
    RAISE EXCEPTION 'Số két của khách gửi không đủ để chia';
  END IF;

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

CREATE OR REPLACE FUNCTION public.crate_record_delivery(
  p_receiver_customer_id UUID,
  p_quantity INTEGER,
  p_notes TEXT,
  p_image_urls TEXT[],
  p_driver_id UUID,
  p_vehicle_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receiver public.crate_accounts%ROWTYPE;
  v_delivery public.crate_deliveries%ROWTYPE;
  v_pending_before INTEGER;
  v_debt_created INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số két giao phải lớn hơn 0';
  END IF;

  INSERT INTO public.crate_accounts(customer_id, is_receiver, updated_at)
  VALUES (p_receiver_customer_id, TRUE, NOW())
  ON CONFLICT (customer_id) DO UPDATE SET is_receiver = TRUE, updated_at = NOW();

  SELECT * INTO v_receiver FROM public.crate_accounts WHERE customer_id = p_receiver_customer_id FOR UPDATE;
  v_pending_before := v_receiver.receiver_pending;
  v_debt_created := GREATEST(p_quantity - v_pending_before, 0);

  UPDATE public.crate_accounts
  SET receiver_pending = GREATEST(receiver_pending - p_quantity, 0),
      receiver_debt = receiver_debt + v_debt_created,
      is_receiver = TRUE,
      updated_at = NOW()
  WHERE customer_id = p_receiver_customer_id
  RETURNING * INTO v_receiver;

  INSERT INTO public.crate_deliveries(
    receiver_customer_id, quantity, pending_before, debt_created,
    receiver_pending_after, receiver_debt_after, notes, image_urls, driver_id, vehicle_id
  ) VALUES (
    p_receiver_customer_id, p_quantity, v_pending_before, v_debt_created,
    v_receiver.receiver_pending, v_receiver.receiver_debt, p_notes, COALESCE(p_image_urls, ARRAY[]::TEXT[]), p_driver_id, p_vehicle_id
  ) RETURNING * INTO v_delivery;

  RETURN jsonb_build_object('receiver_account', to_jsonb(v_receiver), 'delivery', to_jsonb(v_delivery));
END;
$$;

GRANT EXECUTE ON FUNCTION public.crate_record_intake(UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crate_record_allocation(UUID, UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crate_record_delivery(UUID, INTEGER, TEXT, TEXT[], UUID, UUID) TO authenticated, service_role;
