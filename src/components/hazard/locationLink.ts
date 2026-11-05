export interface LocationPoint {
  lat: number;
  lng: number;
}

/** 印刷後も使える本番URL。住所やレポート内容は含めない。 */
export function buildLocationLink(point: LocationPoint): string {
  const url = new URL('https://minitools.yama-structure-test.com/hazard');
  url.searchParams.set('lat', String(point.lat));
  url.searchParams.set('lng', String(point.lng));
  return url.href;
}

/** 不完全・不正な座標は採用せず、呼び出し元の既定地点を使う。 */
export function readLocationLink(search: string): LocationPoint | null {
  const params = new URLSearchParams(search);
  const latText = params.get('lat');
  const lngText = params.get('lng');
  if (!latText?.trim() || !lngText?.trim()) return null;
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!decimal.test(latText.trim()) || !decimal.test(lngText.trim())) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
