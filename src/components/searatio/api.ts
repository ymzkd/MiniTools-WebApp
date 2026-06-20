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

export interface SeismicParams {
  zone: number;
  Z: number; // 地震地域係数（昭55建告1793号。1.0/0.9/0.8/0.7）
  nearest?: boolean;
  nearest_km?: number;
}

export interface DesignResult {
  lat: number;
  lng: number;
  wind: WindParams | null;
  snow: SnowParams | null;
  seismic: SeismicParams | null;
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

// 住所として不要な要素（国/郵便番号/地方/振興局/POI・建物・道路 等）の address キー。
// これらの値を display_name から除外する。
const NON_ADDRESS_KEYS = [
  'country', 'country_code', 'postcode', 'region', 'subprovince', 'state_district',
  'ISO3166-2-lvl4', 'ISO3166-2-lvl6',
  'amenity', 'building', 'railway', 'shop', 'office', 'tourism', 'leisure', 'man_made',
  'historic', 'road', 'emergency', 'aeroway', 'highway', 'natural', 'place', 'club',
  'craft', 'healthcare',
];

/** Nominatim の reverse 応答を、日本の住所表記（都道府県→市区町村→丁目…）の一続きに整形。 */
function formatJpAddress(data: { display_name?: unknown; address?: Record<string, unknown> }): string | null {
  const dn = data.display_name;
  if (typeof dn !== 'string') return null;
  const a = data.address || {};
  const excludeVals = new Set<string>();
  for (const k of NON_ADDRESS_KEYS) {
    const v = a[k];
    if (typeof v === 'string') excludeVals.add(v);
  }
  // display_name は「小→大, 郵便番号, 日本」の順。除外して反転＝大→小に。
  const parts = dn
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p && p !== '日本' && !excludeVals.has(p) && !/^\d{3}-?\d{2,4}$/.test(p));
  parts.reverse();
  // 接頭辞重複の除去（例: 「丸の内」⊂「丸の内一丁目」→ 親を落とす）
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const next = parts[i + 1];
    if (next && next.startsWith(parts[i])) continue;
    out.push(parts[i]);
  }
  const s = out.join(' '); // 分類間は半角スペース区切り
  return s || null;
}

/** 緯度経度 → 住所（Nominatim リバースジオコーディング, 日本語）。取得不可は null。 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}` +
        `&zoom=18&addressdetails=1&accept-language=ja`
    );
    if (!res.ok) return null;
    return formatJpAddress(await res.json());
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
