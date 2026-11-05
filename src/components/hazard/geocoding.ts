export interface GeocodingConfig {
  provider: 'nominatim' | 'jageocoder';
  attribution: string;
  notice: string;
}

export interface GeocodingResult {
  lat: number;
  lng: number;
  address: string;
  level: number;
  approximate: boolean;
  distance_m?: number;
}

let configRequest: Promise<GeocodingConfig> | undefined;

// Runtime server configuration, not a UI toggle or a build-time API key.
export function getGeocodingConfig(): Promise<GeocodingConfig> {
  configRequest ??= fetch('/api/geocoding/config', { signal: AbortSignal.timeout(5000) })
    .then(async (res) => {
      if (!res.ok) throw new Error('住所検索の設定を取得できませんでした');
      const config = await res.json() as GeocodingConfig;
      if (!['nominatim', 'jageocoder'].includes(config.provider)) throw new Error('住所検索の設定が不正です');
      return config;
    })
    .catch((error) => { configRequest = undefined; throw error; });
  return configRequest;
}

export async function fetchLocalGeocoding(path: 'search' | 'reverse', params: URLSearchParams): Promise<GeocodingResult | null> {
  const res = await fetch(`/api/geocoding/${path}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('ローカル住所検索APIを利用できません');
  return ((await res.json()) as { result: GeocodingResult | null }).result;
}
