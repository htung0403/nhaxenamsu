import { createHash } from 'crypto';
import { env } from '../../config/env';
import { supabaseService } from '../../config/supabase';

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
  type?: string;
  class?: string;
};

type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
  provider: 'nominatim';
  cached: boolean;
};

let lastNominatimRequestAt = 0;

const normalizeAddress = (address: string) =>
  address
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const buildAddressKey = (address: string) =>
  createHash('sha256').update(normalizeAddress(address)).digest('hex');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildQueryAddress = (address: string) => {
  const normalized = address.trim();
  const hasVietnam = /việt nam|viet nam|vietnam/i.test(normalized);
  return hasVietnam ? normalized : `${normalized}, Việt Nam`;
};

export class GeocodingService {
  static async geocodeAddress(address: string): Promise<GeocodeResult> {
    const normalizedAddress = normalizeAddress(address);
    if (normalizedAddress.length < 5) {
      throw new Error('Địa chỉ quá ngắn để tìm tọa độ');
    }

    const addressKey = buildAddressKey(normalizedAddress);
    const { data: cached, error: cacheError } = await supabaseService
      .from('geocode_cache')
      .select('latitude, longitude, display_name, hit_count')
      .eq('address_key', addressKey)
      .maybeSingle();

    if (cacheError) throw cacheError;

    if (cached?.latitude !== null && cached?.longitude !== null && cached?.latitude !== undefined && cached?.longitude !== undefined) {
      await supabaseService
        .from('geocode_cache')
        .update({
          hit_count: Number(cached.hit_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('address_key', addressKey);

      return {
        latitude: Number(cached.latitude),
        longitude: Number(cached.longitude),
        displayName: cached.display_name || address,
        provider: 'nominatim',
        cached: true,
      };
    }

    const elapsed = Date.now() - lastNominatimRequestAt;
    if (elapsed < 1_100) {
      await sleep(1_100 - elapsed);
    }
    lastNominatimRequestAt = Date.now();

    const queryAddress = buildQueryAddress(address);
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'vn');
    url.searchParams.set('q', queryAddress);

    const response = await fetch(url, {
      headers: {
        'User-Agent': `BanrauDriverMap/1.0 (${env.CLIENT_URL})`,
        'Accept-Language': 'vi,en',
      },
    });

    if (!response.ok) {
      throw new Error(`Không thể tìm tọa độ từ OpenStreetMap (${response.status})`);
    }

    const results = (await response.json()) as NominatimResult[];
    const first = results[0];
    const latitude = first?.lat ? Number(first.lat) : NaN;
    const longitude = first?.lon ? Number(first.lon) : NaN;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Không tìm thấy tọa độ phù hợp cho địa chỉ này');
    }

    const displayName = first.display_name || queryAddress;

    await supabaseService.from('geocode_cache').upsert(
      {
        address_key: addressKey,
        query_address: queryAddress,
        display_name: displayName,
        latitude,
        longitude,
        provider: 'nominatim',
        raw_result: first,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'address_key' },
    );

    return {
      latitude,
      longitude,
      displayName,
      provider: 'nominatim',
      cached: false,
    };
  }
}
