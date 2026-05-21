-- 83_geocode_cache.sql
-- Cache OSM/Nominatim geocoding results so addresses are resolved once and reused.

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  address_key TEXT PRIMARY KEY,
  query_address TEXT NOT NULL,
  display_name TEXT,
  latitude NUMERIC(10,8),
  longitude NUMERIC(11,8),
  provider TEXT NOT NULL DEFAULT 'nominatim',
  raw_result JSONB,
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_last_used_at
  ON public.geocode_cache (last_used_at DESC);
