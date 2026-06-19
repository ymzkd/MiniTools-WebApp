// 海率計算アプリの外部データ取得。
// - 設計用地域区分(基準風速/積雪荷重係数/海率)は jiban-api を同一オリジン /api/design で叩く。
// - 標高は国土地理院DEM、住所→座標は Nominatim をブラウザから直接叩く（boring と同じ方針）。

export interface WindParams {
  zone: number;
  Vo: number;
  nearest?: boolean; // 区域外で最寄り区分を補完したとき true
  nearest_km?: number; // 最寄り区域までの距離(km)
}

export interface SnowParams {
  zone: number;
  alpha: number;
  beta: number;
  gamma: number;
  R: number;
  no_snow?: boolean; // 積雪荷重 対象区域外（沖縄県＝第0区）
  nearest?: boolean;
  nearest_km?: number;
}

export interface DesignResult {
  lat: number;
  lng: number;
  wind: WindParams | null;
  snow: SnowParams | null;
  radius_km: number;
  sea_ratio: number;
  land_ratio: number;
}

/** jiban-api /design/lookup を叩いて基準風速・積雪荷重係数・海率を取得する。 */
export async function fetchDesign(
  lat: number,
  lng: number,
  radiusKm?: number
): Promise<DesignResult> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (radiusKm != null) params.set('radius', String(radiusKm));
  const res = await fetch(`/api/design/lookup?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`design API error: ${res.status}`);
  }
  return (await res.json()) as DesignResult;
}

/** 国土地理院DEMで標高(m)を取得。範囲外・取得不可は null。 */
export async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const url =
      `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php` +
      `?lon=${lng}&lat=${lat}&outtype=JSON`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const e = data?.elevation;
    if (e == null || e === '-----') return null;
    const v = typeof e === 'number' ? e : parseFloat(e);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** 住所・地名 → 緯度経度（Nominatim, 日本に限定）。見つからなければ null。 */
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      address
    )}&countrycodes=jp&limit=1`
  );
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  return null;
}

/** 積雪深 d = (α·H + β·rs + γ) × 100 [cm]（負値は0でクランプ）。平12建告1455号。 */
export function snowDepthCm(snow: SnowParams, elevationM: number, seaRatio: number): number {
  const d = (snow.alpha * elevationM + snow.beta * seaRatio + snow.gamma) * 100;
  return Math.max(d, 0);
}
