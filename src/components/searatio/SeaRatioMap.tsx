import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';

interface LatLng {
  lat: number;
  lng: number;
}

export type ZoneOverlay = 'none' | 'snow' | 'wind' | 'depth';

interface SeaRatioMapProps {
  center: LatLng; // マーカー＋海率円の中心（地図クリックでも更新される）
  radiusKm: number;
  // この値が変わったとき（住所検索・座標入力・初期表示）だけ円全体が収まるよう表示範囲を合わせる。
  // 地図クリックでは変えない＝クリックのたびに勝手にズームしないようにするため。
  viewVersion: number;
  overlay: ZoneOverlay; // 薄いオーバーレイ（none / 積雪区分 / 風速区分 / 積雪深）
  onPick: (lat: number, lng: number) => void;
}

// ゾーン番号→色。色が濃いほど区分番号が大きい（元アプリと同じ向き）。薄く重ねる。
// 積雪は青系(第1〜40区)、風速は赤系(第1〜9区)。
const ZONE_FILL_COLOR: Record<'snow' | 'wind', maplibregl.ExpressionSpecification> = {
  snow: ['interpolate', ['linear'], ['get', 'zone'], 1, '#deebf7', 20, '#6baed6', 40, '#08306b'],
  wind: ['interpolate', ['linear'], ['get', 'zone'], 1, '#fee5d9', 5, '#fb6a4a', 9, '#a50f15'],
};

// 積雪深は「値ラスター」: タイルは d[cm] を terrarium 標高エンコードで格納。maplibre v5 の
// color-relief レイヤー(raster-dem, encoding=terrarium)が elevation=d[cm] に復号し、
// 下の連続カラーランプで GPU 着色する。段差/境界のない無段階カラー。
// ['elevation'] はこの型定義に未収載だが color-relief で有効。castで通す。
const DEPTH_RELIEF_COLOR = [
  'interpolate', ['linear'], ['elevation'],
  0, 'rgba(0,0,0,0)',
  5, 'rgba(198,219,239,0.45)',
  50, 'rgba(158,202,225,0.55)',
  100, 'rgba(107,174,214,0.6)',
  200, 'rgba(66,146,198,0.65)',
  300, 'rgba(33,113,181,0.7)',
  500, 'rgba(8,69,148,0.74)',
  800, 'rgba(84,39,143,0.78)',
  1200, 'rgba(106,30,140,0.82)',
  1500, 'rgba(74,20,80,0.85)',
] as unknown as maplibregl.ExpressionSpecification;

// ベクタタイル(区分)とラスタータイル(積雪深)の同一オリジン取得パス。jiban-api
// /design/tiles を minitools の Express が Range 転送する。
const ZONE_PMTILES: Record<'snow' | 'wind', string> = {
  snow: '/api/design/tiles/snow_zones.pmtiles',
  wind: '/api/design/tiles/wind_zones.pmtiles',
};
const ZONE_SOURCE_LAYER = 'zones';
const DEPTH_PMTILES = '/api/design/tiles/snow_depth.pmtiles';

// pmtiles プロトコルはグローバル登録。boring 側でも使うため重複登録を避け、解除もしない
// (全タブ常時マウントのSPAなので、片方のアンマウントで他方を壊さないよう removeProtocol しない)。
let _pmtilesRegistered = false;
function ensurePmtilesProtocol() {
  if (_pmtilesRegistered) return;
  _pmtilesRegistered = true;
  maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
}

// ホバー時に積雪深(d[cm])をカーソル位置で読み出すため、深さPMTilesを直接デコードする。
// 同一タイルは ImageData をキャッシュ(タイル内移動は再デコード不要)。
let _depthPM: pmtiles.PMTiles | null = null;
const _depthTileCache = new Map<string, Uint8ClampedArray | null>();
const DEPTH_NATIVE_Z = 12; // build_snow_depth.py のネイティブズーム

async function loadDepthTile(z: number, x: number, y: number): Promise<Uint8ClampedArray | null> {
  const key = `${z}/${x}/${y}`;
  if (_depthTileCache.has(key)) return _depthTileCache.get(key)!;
  let out: Uint8ClampedArray | null = null;
  try {
    if (!_depthPM) _depthPM = new pmtiles.PMTiles(`${window.location.origin}${DEPTH_PMTILES}`);
    const r = await _depthPM.getZxy(z, x, y);
    if (r) {
      // 値ラスターなので色変換/プリマルチを無効化して画素値を正確に読む（R は terrarium の
      // 上位バイト=×256 なので 1 ずれると 256cm 狂う）。
      const bmp = await createImageBitmap(new Blob([r.data], { type: 'image/png' }), {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 256;
      const ctx = cv.getContext('2d');
      if (ctx) {
        ctx.drawImage(bmp, 0, 0);
        out = ctx.getImageData(0, 0, 256, 256).data;
      }
    }
  } catch {
    out = null;
  }
  _depthTileCache.set(key, out);
  return out;
}

// 緯度経度の積雪深[cm]（terrarium 復号）。雪なし/タイルなしは null。
async function depthAtLngLat(lng: number, lat: number): Promise<number | null> {
  const n = 2 ** DEPTH_NATIVE_Z;
  const xf = ((lng + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  const px = Math.min(255, Math.max(0, Math.floor((xf - x) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((yf - y) * 256)));
  const img = await loadDepthTile(DEPTH_NATIVE_Z, x, y);
  if (!img) return null;
  const i = (py * 256 + px) * 4;
  const d = img[i] * 256 + img[i + 1] + img[i + 2] / 256 - 32768; // terrarium 復号
  return d > 0.5 ? d : null;
}

// 経度を [-180, 180] に正規化（メルカトルで地図を一周しても巨大な経度を上流へ送らない）。
function normLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// 中心から半径 radiusKm の地理的な円（球面の正確な目的地計算）を多角形座標で返す。
function circleCoords(lat: number, lng: number, radiusKm: number, steps = 96): number[][] {
  const R = 6371; // 地球半径(km)
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const d = radiusKm / R;
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng)
    );
    const lng2 =
      lngR +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latR),
        Math.cos(d) - Math.sin(latR) * Math.sin(lat2)
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return coords;
}

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      gsi: {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
      },
    },
    layers: [
      // 未読込領域が暗く見えないよう、最下層を地理院淡色地図の地色に近い明色で塗る（boring と同じ）。
      { id: 'bg', type: 'background', paint: { 'background-color': '#eceae4' } },
      { id: 'gsi', type: 'raster', source: 'gsi' },
    ],
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const SeaRatioMap: React.FC<SeaRatioMapProps> = ({
  center,
  radiusKm,
  viewVersion,
  overlay,
  onPick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const firstFitRef = useRef(false);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // カーソル位置のオーバーレイ値（地図左下に控えめ表示）
  const [hover, setHover] = useState<string | null>(null);
  const hoverTokenRef = useRef(0);

  // ゾーン区分オーバーレイの表示切り替え（タイルは可視時に maplibre が遅延取得する）。
  const applyOverlay = useCallback((kind: ZoneOverlay) => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer('zones-snow-fill')) return;
    map.setLayoutProperty('zones-snow-fill', 'visibility', kind === 'snow' ? 'visible' : 'none');
    map.setLayoutProperty('zones-wind-fill', 'visibility', kind === 'wind' ? 'visible' : 'none');
    if (map.getLayer('zones-depth-fill')) {
      map.setLayoutProperty('zones-depth-fill', 'visibility', kind === 'depth' ? 'visible' : 'none');
    }
  }, []);
  // viewVersion 効果が最新の中心・半径を参照するための ref（中心変化では再fitしないため依存に入れない）
  const latestRef = useRef({ center, radiusKm });
  latestRef.current = { center, radiusKm };

  // 初期化（マウント時1回）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [center.lng, center.lat],
      zoom: 10,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    ensurePmtilesProtocol();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.scrollZoom.setWheelZoomRate(1 / 120);
    map.scrollZoom.setZoomRate(1 / 60);
    map.getCanvas().style.cursor = 'crosshair';

    // タブが display:none で 0×0 マウントされるため、実サイズが付いた最初のタイミングで
    // 一度だけ円全体にフィットさせる（0サイズで fitBounds するとズームがずれるため）。
    const maybeInitialFit = () => {
      const el = containerRef.current;
      if (firstFitRef.current || !readyRef.current || !el || el.clientWidth === 0) return;
      firstFitRef.current = true;
      const { center: c, radiusKm: r } = latestRef.current;
      fitToCircle(map, c, r);
    };

    map.on('load', () => {
      // ゾーン区分オーバーレイ（GSIタイルの上・解析円の下に薄く重ねる）。初期は非表示。
      // PMTilesベクタソースを2種(積雪/風速)。可視になったタイルだけ Range 取得される。
      const origin = window.location.origin;
      (['snow', 'wind'] as const).forEach((kind) => {
        map.addSource(`zones-${kind}`, {
          type: 'vector',
          url: `pmtiles://${origin}${ZONE_PMTILES[kind]}`,
        });
        map.addLayer({
          id: `zones-${kind}-fill`,
          type: 'fill',
          source: `zones-${kind}`,
          'source-layer': ZONE_SOURCE_LAYER,
          layout: { visibility: 'none' },
          paint: { 'fill-color': ZONE_FILL_COLOR[kind], 'fill-opacity': 0.62 },
        });
      });
      // 積雪深マップ（値ラスター → color-relief で無段階連続着色）。
      // タイルは terrarium 標高エンコードで d[cm] を格納。color-relief が elevation=d に復号。
      map.addSource('zones-depth', {
        type: 'raster-dem',
        url: `pmtiles://${origin}${DEPTH_PMTILES}`,
        tileSize: 256,
        encoding: 'terrarium',
      });
      map.addLayer({
        id: 'zones-depth-fill',
        type: 'color-relief',
        source: 'zones-depth',
        layout: { visibility: 'none' },
        paint: {
          'color-relief-color': DEPTH_RELIEF_COLOR,
          'color-relief-opacity': 0.9,
        },
      } as unknown as maplibregl.AddLayerObject);

      map.addSource('circle', { type: 'geojson', data: EMPTY_FC });
      map.addSource('marker', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'circle-fill',
        type: 'fill',
        source: 'circle',
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: 'circle-line',
        type: 'line',
        source: 'circle',
        paint: { 'line-color': '#2563eb', 'line-width': 2 },
      });
      map.addLayer({
        id: 'marker',
        type: 'circle',
        source: 'marker',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      readyRef.current = true;
      // 初期データ反映。表示範囲合わせは「実サイズが付いてから」一度だけ（下の maybeInitialFit）。
      updateData(map, center, radiusKm);
      maybeInitialFit();
      applyOverlay(overlayRef.current); // マウント時にオーバーレイ選択済みなら反映
    });

    // 地図のどこをクリックしても、その地点を選択する。
    map.on('click', (e) => {
      onPickRef.current(e.lngLat.lat, normLng(e.lngLat.lng));
    });

    // オーバーレイ表示中、カーソル位置のデータを小さくリアルタイム表示。
    //   区分(snow/wind)はベクタを queryRenderedFeatures で即時取得。
    //   積雪深はラスターなので PMTiles のタイル画素を復号(同一タイルはキャッシュ)。
    map.on('mousemove', (e) => {
      const ov = overlayRef.current;
      if (ov === 'none') {
        setHover(null);
        return;
      }
      if (ov === 'snow' || ov === 'wind') {
        const fs = map.queryRenderedFeatures(e.point, { layers: [`zones-${ov}-fill`] });
        if (fs.length) {
          const p = fs[0].properties || {};
          const text =
            ov === 'snow'
              ? p.zone === 0
                ? '積雪区分: 第0区（積雪なし）'
                : `積雪区分: 第${p.zone}区`
              : `風速区分: 第${p.zone}区 Vo${p.Vo} m/s`;
          setHover(text);
        } else {
          setHover(null);
        }
        return;
      }
      // depth: 非同期デコード（古い応答は token で破棄）
      const token = ++hoverTokenRef.current;
      depthAtLngLat(e.lngLat.lng, e.lngLat.lat)
        .then((d) => {
          if (token !== hoverTokenRef.current) return;
          setHover(d != null ? `積雪深: 約 ${Math.round(d)} cm` : '積雪深: ほぼ0');
        })
        .catch(() => {});
    });
    map.on('mouseout', () => setHover(null));

    const ro = new ResizeObserver(() => {
      map.resize();
      maybeInitialFit();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 中心・半径が変わったらマーカー＋円を更新（表示範囲は変えない）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    updateData(map, center, radiusKm);
  }, [center, radiusKm]);

  // viewVersion が変わったとき（住所検索・座標入力）だけ円全体に合わせる
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || viewVersion === 0) return;
    const { center: c, radiusKm: r } = latestRef.current;
    fitToCircle(map, c, r);
  }, [viewVersion]);

  // オーバーレイ選択が変わったら反映
  useEffect(() => {
    applyOverlay(overlay);
  }, [overlay, applyOverlay]);

  return (
    <div className="h-full w-full relative">
      <div
        ref={containerRef}
        className="h-full w-full rounded-lg"
        style={{ minHeight: '400px', backgroundColor: '#eceae4' }}
      />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1] bg-gray-900/80 text-white text-xs px-3 py-1.5 rounded-full shadow pointer-events-none">
        地図をクリックして地点を指定
      </div>
      {hover && (
        <div className="absolute bottom-2 left-2 z-[2] pointer-events-none px-2 py-1 text-[11px] rounded bg-gray-900/70 text-white shadow whitespace-nowrap">
          {hover}
        </div>
      )}
    </div>
  );
};

function updateData(map: maplibregl.Map, center: LatLng, radiusKm: number) {
  const circle = map.getSource('circle') as maplibregl.GeoJSONSource | undefined;
  const marker = map.getSource('marker') as maplibregl.GeoJSONSource | undefined;
  if (!circle || !marker) return;
  circle.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [circleCoords(center.lat, center.lng, radiusKm)] },
  });
  marker.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
  });
}

function fitToCircle(map: maplibregl.Map, center: LatLng, radiusKm: number) {
  const coords = circleCoords(center.lat, center.lng, radiusKm);
  const b = new maplibregl.LngLatBounds();
  for (const c of coords) b.extend(c as [number, number]);
  map.fitBounds(b, { padding: 40, animate: false, maxZoom: 14 });
}

export default SeaRatioMap;
