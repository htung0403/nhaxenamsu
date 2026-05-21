import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export const getDriverMapSupabase = (url: string, anonKey: string): SupabaseClient | null => {
  if (!url || !anonKey) return null;

  const key = `${url}:${anonKey}`;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 5,
        },
      },
    });
    cachedKey = key;
  }

  return cachedClient;
};
