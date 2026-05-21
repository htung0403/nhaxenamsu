-- 81_driver_tracking.sql
-- Lightweight driver tracking tables for realtime map and bounded route history.

CREATE TABLE IF NOT EXISTS public.driver_locations_latest (
  driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  current_delivery_vehicle_id UUID REFERENCES public.delivery_vehicles(id) ON DELETE SET NULL,
  latitude NUMERIC(10,8) NOT NULL,
  longitude NUMERIC(11,8) NOT NULL,
  accuracy_m NUMERIC(10,2),
  speed_mps NUMERIC(10,2),
  heading NUMERIC(6,2),
  battery_level INTEGER CHECK (battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)),
  status VARCHAR(20) NOT NULL DEFAULT 'online' CHECK (status IN ('online','offline','dang_giao')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  delivery_vehicle_id UUID REFERENCES public.delivery_vehicles(id) ON DELETE SET NULL,
  latitude NUMERIC(10,8) NOT NULL,
  longitude NUMERIC(11,8) NOT NULL,
  accuracy_m NUMERIC(10,2),
  speed_mps NUMERIC(10,2),
  heading NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_latest_updated_at
  ON public.driver_locations_latest (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_location_history_driver_recorded
  ON public.driver_location_history (driver_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_location_history_delivery_vehicle
  ON public.driver_location_history (delivery_vehicle_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_driver_location_history_created_at
  ON public.driver_location_history (created_at);

ALTER TABLE public.driver_locations_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_location_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_locations_latest_read_admin_manager ON public.driver_locations_latest;
CREATE POLICY driver_locations_latest_read_admin_manager
  ON public.driver_locations_latest
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','manager')
    )
    OR driver_id = auth.uid()
  );

DROP POLICY IF EXISTS driver_location_history_read_admin_manager ON public.driver_location_history;
CREATE POLICY driver_location_history_read_admin_manager
  ON public.driver_location_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','manager')
    )
    OR driver_id = auth.uid()
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations_latest;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_driver_location_history(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.driver_location_history
  WHERE created_at < NOW() - make_interval(days => retention_days);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
