import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';

interface LatLng {
  lat: number;
  lng: number;
}

export type ZoneOverlay = 'none' | 'wind' | 'seismic' | 'urban' | 'depth' | 'snow_zones' | 'authority';

interface HazardMapProps {
  center: LatLng; // マーカー＋海率円の中心（地図クリックでも更新される）
  radiusKm: number;
  // この値が変わったとき（住所検索・座標入力・初期表示）だけ円全体が収まるよう表示範囲を合わせる。
  // 地図クリックでは変えない＝クリックのたびに勝手にズームしないようにするため。
  viewVersion: number;
  overlay: ZoneOverlay; // 薄いオーバーレイ（none / 風速区分 / 地震 / 積雪深）
  shorePoint: LatLng | null; // 最寄りの海岸線/湖岸線の点（中心からの測線を表示）
  onPick: (lat: number, lng: number) => void;
}

// ゾーン番号→色。色が濃いほど区分番号が大きい（元アプリと同じ向き）。薄く重ねる。
// 積雪は青系(第1〜40区)、風速は赤系(第1〜9区)。
const ZONE_FILL_COLOR: Record<'wind' | 'seismic' | 'snow_zones', maplibregl.ExpressionSpecification> = {
  wind: ['interpolate', ['linear'], ['get', 'zone'], 1, '#fee5d9', 5, '#fb6a4a', 9, '#a50f15'],
  // 地震地域係数 Z（大きいほど地震荷重が大）。Z=0.7淡 → 1.0濃赤。
  seismic: ['interpolate', ['linear'], ['get', 'Z'], 0.7, '#fee08b', 0.8, '#fdae61', 0.9, '#f46d43', 1.0, '#d73027'],
  // 積雪荷重の地域区分（平12建告1455号、第0〜40区）。連続値ではなく離散区分なので、
  // 隣り合う区が必ず別色になるよう高コントラスト10色を zone%10 で循環割当する。
  // 第0区＝積雪なしは中立グレー。zone は離散なので match（補間しない）。
  snow_zones: [
    'match', ['get', 'zone'],
    0, '#d9d9d9',
    [
      'match', ['%', ['get', 'zone'], 10],
      0, '#1f77b4', 1, '#ff7f0e', 2, '#2ca02c', 3, '#d62728', 4, '#9467bd',
      5, '#8c564b', 6, '#e377c2', 7, '#17becf', 8, '#bcbd22', 9, '#393b79',
      '#888888',
    ],
  ] as unknown as maplibregl.ExpressionSpecification,
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
const ZONE_PMTILES: Record<'wind' | 'seismic' | 'snow_zones', string> = {
  wind: '/api/design/tiles/wind_zones.pmtiles',
  seismic: '/api/design/tiles/seismic_zones.pmtiles',
  snow_zones: '/api/design/tiles/snow_zones.pmtiles',
};
// init で生成するベクタ区分レイヤ一覧（source-layer はいずれも 'zones'）。
const VECTOR_ZONE_KINDS = ['wind', 'seismic', 'snow_zones'] as const;
const ZONE_SOURCE_LAYER = 'zones';
const DEPTH_PMTILES = '/api/design/tiles/snow_depth.pmtiles';
// 都市計画区域(外形のみ)。区域区分は区別せずグレー塗りで分布を示す。tippecanoe -l urban。
const URBAN_PMTILES = '/api/design/tiles/urban_areas.pmtiles';
const URBAN_SOURCE_LAYER = 'urban';
const URBAN_FILL_COLOR = '#9ca3af'; // gray-400

// 特定行政庁(建築基準法)の分布。authority_zones.pmtiles(source-layer='zones')を庁の区分(type)で
// 4色に塗り分ける。属性は build_authority_geojson.py のフラット属性(p_type/p_name/split/l_name…)。
const AUTHORITY_PMTILES = '/api/design/tiles/authority_zones.pmtiles';
const AUTHORITY_SOURCE_LAYER = 'zones';
// 区分(type)→色。知事=緑 / 建築主事設置市=青 / 限定特定行政庁=橙 / 特別区=紫。
const AUTHORITY_TYPE_COLOR: maplibregl.ExpressionSpecification = [
  'match', ['get', 'p_type'],
  'prefecture', '#66bd63',
  'city_full', '#3182bd',
  'city_limited', '#fdae61',
  'special_ward', '#8856a7',
  '#bdbdbd',
];
// 区分(type)の日本語ラベル（凡例/ホバー用）。
const AUTHORITY_TYPE_LABEL: Record<string, string> = {
  prefecture: '都道府県知事',
  city_full: '建築主事設置市',
  city_limited: '限定特定行政庁',
  special_ward: '特別区',
};

// 地図内オーバーレイ凡例（CSSグラデーション）。地図の塗り色と対応。
const LEGEND: Record<Exclude<ZoneOverlay, 'none'>, { title: string; grad: string; min: string; max: string }> = {
  wind: {
    title: '基準風速 地域区分（平12建告1454号）',
    grad: 'linear-gradient(to right, #fee5d9, #fb6a4a, #a50f15)',
    min: '第1区 Vo30',
    max: '第9区 Vo46',
  },
  seismic: {
    title: '地震地域係数 Z（昭55建告1793号）',
    grad: 'linear-gradient(to right, #fee08b, #fdae61, #f46d43, #d73027)',
    min: 'Z0.7',
    max: 'Z1.0',
  },
  urban: {
    title: '都市計画区域（国土数値情報 A09）',
    grad: '#9ca3af',
    min: '区域内',
    max: '',
  },
  depth: {
    title: '積雪深（垂直積雪量 cm）',
    grad:
      'linear-gradient(to right,rgba(198,219,239,0.6) 0%,rgba(107,174,214,0.7) 7%,' +
      'rgba(33,113,181,0.8) 20%,rgba(8,69,148,0.85) 33%,rgba(84,39,143,0.9) 53%,' +
      'rgba(106,30,140,0.92) 80%,rgba(74,20,80,0.95) 100%)',
    min: '0',
    max: '1500',
  },
  snow_zones: {
    title: '積雪 地域区分（平12建告1455号）',
    // 区分ごとに色分け（連続スケールではない）。帯は多色で「カテゴリ配色」であることを示す。
    grad:
      'linear-gradient(to right,#1f77b4,#ff7f0e,#2ca02c,#d62728,#9467bd,' +
      '#8c564b,#e377c2,#17becf,#bcbd22,#393b79)',
    min: '区分ごとに配色',
    max: '',
  },
  authority: {
    title: '特定行政庁（建築基準法）',
    // 庁の区分で色分け（知事=緑 / 主事設置市=青 / 限定=橙 / 特別区=紫）の4色ハードストップ。
    grad:
      'linear-gradient(to right,#66bd63 0 25%,#3182bd 25% 50%,' +
      '#fdae61 50% 75%,#8856a7 75% 100%)',
    min: '知事 / 市 / 限定 / 特別区',
    max: '',
  },
};

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

const HazardMap: React.FC<HazardMapProps> = ({
  center,
  radiusKm,
  viewVersion,
  overlay,
  shorePoint,
  onPick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const firstFitRef = useRef(false);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const shorePointRef = useRef(shorePoint);
  shorePointRef.current = shorePoint;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // カーソル位置のオーバーレイ値（地図左下に控えめ表示）
  const [hover, setHover] = useState<string | null>(null);
  const hoverTokenRef = useRef(0);

  // ゾーン区分オーバーレイの表示切り替え（タイルは可視時に maplibre が遅延取得する）。
  const applyOverlay = useCallback((kind: ZoneOverlay) => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer('zones-wind-fill')) return;
    map.setLayoutProperty('zones-wind-fill', 'visibility', kind === 'wind' ? 'visible' : 'none');
    if (map.getLayer('zones-seismic-fill')) {
      map.setLayoutProperty('zones-seismic-fill', 'visibility', kind === 'seismic' ? 'visible' : 'none');
    }
    if (map.getLayer('zones-snow_zones-fill')) {
      map.setLayoutProperty('zones-snow_zones-fill', 'visibility', kind === 'snow_zones' ? 'visible' : 'none');
    }
    if (map.getLayer('zones-urban-fill')) {
      map.setLayoutProperty('zones-urban-fill', 'visibility', kind === 'urban' ? 'visible' : 'none');
    }
    if (map.getLayer('zones-authority-fill')) {
      map.setLayoutProperty('zones-authority-fill', 'visibility', kind === 'authority' ? 'visible' : 'none');
    }
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
      VECTOR_ZONE_KINDS.forEach((kind) => {
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

      // 都市計画区域（外形のみ・グレー塗り）。
      map.addSource('zones-urban', {
        type: 'vector',
        url: `pmtiles://${origin}${URBAN_PMTILES}`,
      });
      map.addLayer({
        id: 'zones-urban-fill',
        type: 'fill',
        source: 'zones-urban',
        'source-layer': URBAN_SOURCE_LAYER,
        layout: { visibility: 'none' },
        paint: { 'fill-color': URBAN_FILL_COLOR, 'fill-opacity': 0.45 },
      });

      // 特定行政庁（建築基準法）の分布。庁の区分(type)で4色に塗り分け。
      map.addSource('zones-authority', {
        type: 'vector',
        url: `pmtiles://${origin}${AUTHORITY_PMTILES}`,
      });
      map.addLayer({
        id: 'zones-authority-fill',
        type: 'fill',
        source: 'zones-authority',
        'source-layer': AUTHORITY_SOURCE_LAYER,
        layout: { visibility: 'none' },
        paint: { 'fill-color': AUTHORITY_TYPE_COLOR, 'fill-opacity': 0.5 },
      });

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
      // 海岸線/湖岸線までの測線（中心→最寄り点）と最寄り点マーカー。
      // 重ね順: 測線 → 最寄り点(橙) → 中心マーカー(赤) の順で、地点指定の赤を最前面にする
      // (広域表示で赤マーカーが隠れないように)。
      map.addSource('shore', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'shore-line',
        type: 'line',
        source: 'shore',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
      map.addLayer({
        id: 'shore-pt',
        type: 'circle',
        source: 'shore',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#f59e0b',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
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
      updateShore(map, center, shorePointRef.current);
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
      if (ov === 'wind' || ov === 'seismic') {
        const fs = map.queryRenderedFeatures(e.point, { layers: [`zones-${ov}-fill`] });
        if (fs.length) {
          const p = fs[0].properties || {};
          const text =
            ov === 'wind'
              ? `風速区分: 第${p.zone}区 Vo${p.Vo} m/s`
              : `地震区分: 第${p.zone}区 Z${p.Z}`;
          setHover(text);
        } else {
          setHover(null);
        }
        return;
      }
      if (ov === 'urban') {
        const fs = map.queryRenderedFeatures(e.point, { layers: ['zones-urban-fill'] });
        setHover(fs.length ? '都市計画区域: 区域内' : '都市計画区域: 区域外');
        return;
      }
      if (ov === 'snow_zones') {
        const fs = map.queryRenderedFeatures(e.point, { layers: ['zones-snow_zones-fill'] });
        if (fs.length) {
          const p = fs[0].properties || {};
          setHover(`積雪区分: 第${p.zone}区 (α${p.alpha} β${p.beta} γ${p.gamma})`);
        } else {
          setHover(null);
        }
        return;
      }
      if (ov === 'authority') {
        const fs = map.queryRenderedFeatures(e.point, { layers: ['zones-authority-fill'] });
        if (fs.length) {
          const p = fs[0].properties || {};
          const typeLabel = AUTHORITY_TYPE_LABEL[p.p_type as string] ?? '';
          // 規模分割地点は小規模側(主たる庁)を表示し、大規模側を併記。
          const large = p.split ? `／大規模:${p.l_name}` : '';
          setHover(`特定行政庁: ${p.p_name}${typeLabel ? `（${typeLabel}）` : ''}${large}`);
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

  // 中心・最寄り点が変わったら測線を更新
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    updateShore(map, center, shorePoint);
  }, [center, shorePoint]);

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
      {overlay !== 'none' && (
        <div className="absolute bottom-2 left-2 z-[2] pointer-events-none bg-white/85 dark:bg-gray-800/85 rounded-lg shadow p-2 backdrop-blur-sm w-56">
          <div className="text-[10px] font-medium text-gray-700 dark:text-gray-200 leading-tight">
            {LEGEND[overlay].title}
          </div>
          <div className="h-2 w-full rounded mt-1" style={{ background: LEGEND[overlay].grad }} />
          <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
            <span>{LEGEND[overlay].min}</span>
            <span>{LEGEND[overlay].max}</span>
          </div>
          <div className="text-[11px] mt-1 font-medium text-gray-900 dark:text-gray-100 min-h-[15px]">
            {hover ?? <span className="text-gray-400 font-normal">カーソル位置の値を表示</span>}
          </div>
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

// 中心→最寄りの海岸線/湖岸線の点 の測線（と最寄り点）を反映。shorePoint が無ければ消す。
function updateShore(map: maplibregl.Map, center: LatLng, shorePoint: LatLng | null) {
  const src = map.getSource('shore') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  if (!shorePoint) {
    src.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  src.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [center.lng, center.lat],
            [shorePoint.lng, shorePoint.lat],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [shorePoint.lng, shorePoint.lat] },
      },
    ],
  });
}

function fitToCircle(map: maplibregl.Map, center: LatLng, radiusKm: number) {
  const coords = circleCoords(center.lat, center.lng, radiusKm);
  const b = new maplibregl.LngLatBounds();
  for (const c of coords) b.extend(c as [number, number]);
  map.fitBounds(b, { padding: 40, animate: false, maxZoom: 14 });
}

export default HazardMap;
