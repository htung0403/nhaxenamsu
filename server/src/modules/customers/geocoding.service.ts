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

type VietMapSuggestion = {
  ref_id?: string;
  display?: string;
  name?: string;
  address?: string;
};

type VietMapPlaceResult = {
  ref_id?: string;
  display?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
};

type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
  provider: 'nominatim' | 'vietmap';
  cached: boolean;
};

export type AddressSuggestion = {
  refId: string;
  displayName: string;
  name?: string;
  address?: string;
  provider: 'vietmap';
};

let lastNominatimRequestAt = 0;
const VIETMAP_DEFAULT_FOCUS = '10.7769,106.7009';

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

const assertVietMapApiKey = () => {
  if (!env.VIETMAP_API_KEY) {
    throw new Error('Chưa cấu hình VIETMAP_API_KEY');
  }
  return env.VIETMAP_API_KEY;
};

const normalizeVietMapSuggestion = (item: VietMapSuggestion): AddressSuggestion | null => {
  if (!item.ref_id || !item.display) return null;
  return {
    refId: item.ref_id,
    displayName: item.display,
    name: item.name,
    address: item.address,
    provider: 'vietmap',
  };
};

export class GeocodingService {
  static async autocompleteAddress(text: string): Promise<AddressSuggestion[]> {
    const normalizedText = text.trim();
    if (normalizedText.length < 2) return [];

    const url = new URL('https://maps.vietmap.vn/api/autocomplete/v4');
    url.searchParams.set('apikey', assertVietMapApiKey());
    url.searchParams.set('text', normalizedText);
    url.searchParams.set('focus', VIETMAP_DEFAULT_FOCUS);
    url.searchParams.set('display_type', '6');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Không thể lấy gợi ý địa chỉ từ VietMap (${response.status})`);
    }

    const results = (await response.json()) as VietMapSuggestion[];
    return (Array.isArray(results) ? results : [])
      .map(normalizeVietMapSuggestion)
      .filter((item): item is AddressSuggestion => Boolean(item))
      .slice(0, 8);
  }

  static async resolveVietMapPlace(refId: string): Promise<GeocodeResult> {
    const normalizedRefId = refId.trim();
    if (!normalizedRefId) {
      throw new Error('Thiếu mã địa chỉ VietMap');
    }

    const url = new URL('https://maps.vietmap.vn/api/place/v4');
    url.searchParams.set('apikey', assertVietMapApiKey());
    url.searchParams.set('refid', normalizedRefId);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Không thể lấy tọa độ từ VietMap (${response.status})`);
    }

    const result = (await response.json()) as VietMapPlaceResult;
    const latitude = Number(result.lat ?? result.latitude);
    const longitude = Number(result.lng ?? result.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('VietMap không trả về tọa độ hợp lệ');
    }

    const displayName = result.display || [result.name, result.address].filter(Boolean).join(' ') || normalizedRefId;
    const addressKey = buildAddressKey(displayName);

    await supabaseService.from('geocode_cache').upsert(
      {
        address_key: addressKey,
        query_address: displayName,
        display_name: displayName,
        latitude,
        longitude,
        provider: 'vietmap',
        raw_result: result,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'address_key' },
    );

    return {
      latitude,
      longitude,
      displayName,
      provider: 'vietmap',
      cached: false,
    };
  }

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
