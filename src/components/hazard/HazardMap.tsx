import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';

interface LatLng {
  lat: number;
  lng: number;
}

export type ZoneOverlay =
  | 'none'
  | 'wind'
  | 'seismic'
  | 'urban'
  | 'depth'
  | 'snow_zones'
  | 'authority'
  | 'amp'
  | 'vs350';

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

// PDFレポート用に、現在の地図表示をPNG(dataURL)で取り出すためのハンドル。
// 親(HazardMapApp)が ref 経由でレポート出力時にだけ呼ぶ。常時コストは無い。
export interface HazardMapHandle {
  capturePng: () => Promise<string | null>;
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

// 地盤増幅率(elevation = ARV×100)。0.5(良好地盤)緑 → 1.3前後 黄 → 2以上(増幅大)赤系。
// データ実範囲は 0.50〜3.84。50 未満はデータなし側なので透明へ落とす。
const AMP_RELIEF_COLOR = [
  'interpolate', ['linear'], ['elevation'],
  0, 'rgba(0,0,0,0)',
  49, 'rgba(0,0,0,0)',
  50, 'rgba(26,152,80,0.55)',
  90, 'rgba(145,207,96,0.58)',
  110, 'rgba(217,239,139,0.6)',
  130, 'rgba(254,224,139,0.62)',
  160, 'rgba(253,174,97,0.68)',
  190, 'rgba(244,109,67,0.72)',
  230, 'rgba(215,48,39,0.76)',
  280, 'rgba(165,0,38,0.8)',
  384, 'rgba(103,0,31,0.85)',
] as unknown as maplibregl.ExpressionSpecification;

// Vs350層下面標高(elevation = E1[m]+10000)。標高図の配色に合わせ、海面下(堆積盆地)は
// 青系(深いほど濃紺)、海面上は緑→茶の段彩。データ実範囲は E1=-600〜+3700m。
// 縁のGPU補間でデータなし(0)と混ざった中間値が全色を横断しないよう、9000 まで透明に保つ。
const VS350_RELIEF_COLOR = [
  'interpolate', ['linear'], ['elevation'],
  0, 'rgba(0,0,0,0)',
  9000, 'rgba(8,48,107,0)',
  9400, 'rgba(8,48,107,0.78)',
  9700, 'rgba(33,102,172,0.72)',
  9900, 'rgba(67,147,195,0.65)',
  9970, 'rgba(146,197,222,0.6)',
  10000, 'rgba(209,229,240,0.55)',
  10050, 'rgba(184,225,134,0.55)',
  10300, 'rgba(127,188,65,0.58)',
  10800, 'rgba(223,194,125,0.6)',
  11500, 'rgba(191,129,45,0.65)',
  13700, 'rgba(84,48,5,0.7)',
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
const DEPTH_NATIVE_Z = 12; // build_snow_depth.py のネイティブズーム

// J-SHIS 地盤データの値ラスター(積雪深と同じ terrarium エンコード、0=データなし)。
// jiban-api pipelines/jshis/build_jshis_tiles.py の出力とエンコードを一致させること。
//   site_amp:     enc = ARV×100        (地盤増幅率 Vs=400m/s→地表, 250mメッシュ)
//   vs350_bottom: enc = E1[m] + 10000  (深部地盤モデル第1層(Vs=350m/s)下面標高, 陸のみ)
const AMP_PMTILES = '/api/design/tiles/site_amp.pmtiles';
const AMP_NATIVE_Z = 12;
const VS350_PMTILES = '/api/design/tiles/vs350_bottom.pmtiles';
const VS350_NATIVE_Z = 10;
const VS350_OFFSET = 10000;
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
  amp: {
    title: '地盤増幅率（J-SHIS表層地盤 Vs=400m/s→地表）',
    // AMP_RELIEF_COLOR の値位置(0.5〜3.84)を割合に換算した帯。
    grad:
      'linear-gradient(to right,#1a9850 0%,#91cf60 12%,#d9ef8b 18%,#fee08b 24%,' +
      '#fdae61 33%,#f46d43 42%,#d73027 54%,#a50026 69%,#67001f 100%)',
    min: '0.5',
    max: '3.8',
  },
  vs350: {
    title: 'Vs350層下面標高（J-SHIS深部地盤 第1層）',
    // VS350_RELIEF_COLOR の値位置(-600〜+3700m)を割合に換算した帯。
    grad:
      'linear-gradient(to right,#08306b 0%,#2166ac 7%,#4393c3 12%,#92c5de 13%,' +
      '#d1e5f0 14%,#b8e186 15%,#7fbc41 21%,#dfc27d 33%,#bf812d 49%,#543005 100%)',
    min: '-600 m',
    max: '+3700 m',
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

// ホバー時に値ラスター(積雪深/増幅率/Vs350下面標高)をカーソル位置で読み出すため、
// PMTiles を直接デコードする汎用リーダー。同一タイルは ImageData をキャッシュ
// (タイル内移動は再デコード不要)。返り値は terrarium 復号後の生エンコード値。
function makeValueRasterReader(path: string, nativeZ: number) {
  let pm: pmtiles.PMTiles | null = null;
  const cache = new Map<string, Uint8ClampedArray | null>();

  async function loadTile(z: number, x: number, y: number): Promise<Uint8ClampedArray | null> {
    const key = `${z}/${x}/${y}`;
    if (cache.has(key)) return cache.get(key)!;
    let out: Uint8ClampedArray | null = null;
    try {
      if (!pm) pm = new pmtiles.PMTiles(`${window.location.origin}${path}`);
      const r = await pm.getZxy(z, x, y);
      if (r) {
        // 値ラスターなので色変換/プリマルチを無効化して画素値を正確に読む（R は terrarium の
        // 上位バイト=×256 なので 1 ずれると値が 256 狂う）。
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
    cache.set(key, out);
    return out;
  }

  // 緯度経度のエンコード値（terrarium 復号）。タイルなし/取得失敗は null。
  return async function heightAt(lng: number, lat: number): Promise<number | null> {
    const n = 2 ** nativeZ;
    const xf = ((lng + 180) / 360) * n;
    const latR = (lat * Math.PI) / 180;
    const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
    const x = Math.floor(xf);
    const y = Math.floor(yf);
    const px = Math.min(255, Math.max(0, Math.floor((xf - x) * 256)));
    const py = Math.min(255, Math.max(0, Math.floor((yf - y) * 256)));
    const img = await loadTile(nativeZ, x, y);
    if (!img) return null;
    const i = (py * 256 + px) * 4;
    return img[i] * 256 + img[i + 1] + img[i + 2] / 256 - 32768; // terrarium 復号
  };
}

const depthHeightAt = makeValueRasterReader(DEPTH_PMTILES, DEPTH_NATIVE_Z);
const ampHeightAt = makeValueRasterReader(AMP_PMTILES, AMP_NATIVE_Z);
const vs350HeightAt = makeValueRasterReader(VS350_PMTILES, VS350_NATIVE_Z);

// 緯度経度の積雪深[cm]。雪なし/タイルなしは null。
async function depthAtLngLat(lng: number, lat: number): Promise<number | null> {
  const d = await depthHeightAt(lng, lat);
  return d != null && d > 0.5 ? d : null;
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

const HazardMap = forwardRef<HazardMapHandle, HazardMapProps>(function HazardMap(
  { center, radiusKm, viewVersion, overlay, shorePoint, onPick },
  ref
) {
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

  // capturePng が常に最新の中心・半径を参照できるようにする。
  const centerRef = useRef(center);
  centerRef.current = center;
  const radiusRef = useRef(radiusKm);
  radiusRef.current = radiusKm;

  // レポート出力用の地図キャプチャ。ライブ地図には一切触れず、画面外に専用の地図を
  // 生成して「オーバーレイなし・指定地点中心・積雪算定円が全体に収まるズーム」で描画し、
  // PNG 化する。これによりページ本体のズーム/位置/オーバーレイ表示は完全に維持される。
  useImperativeHandle(
    ref,
    () => ({
      capturePng: () =>
        new Promise<string | null>((resolve) => {
          const center = centerRef.current;
          const radiusKm = radiusRef.current;
          const shore = shorePointRef.current;
          // 横長カード（マップ全幅）に合わせたアスペクトで高解像度に描く。
          const container = document.createElement('div');
          Object.assign(container.style, {
            position: 'fixed', left: '-10000px', top: '0', width: '1100px', height: '480px',
          } as Partial<CSSStyleDeclaration>);
          document.body.appendChild(container);

          let map: maplibregl.Map | null = null;
          let done = false;
          const cleanup = () => {
            try { map?.remove(); } catch { /* noop */ }
            try { container.remove(); } catch { /* noop */ }
          };
          const finish = (val: string | null) => {
            if (done) return;
            done = true;
            try { resolve(val); } finally { cleanup(); }
          };
          const grab = () => {
            try { finish(map!.getCanvas().toDataURL('image/png')); }
            catch { finish(null); }
          };

          try {
            map = new maplibregl.Map({
              container,
              style: buildStyle(), // ベース(GSI)のみ。オーバーレイは一切追加しない。
              center: [center.lng, center.lat],
              zoom: 8,
              interactive: false,
              attributionControl: false,
              canvasContextAttributes: { preserveDrawingBuffer: true },
            });
            map.on('error', () => finish(null));
            map.on('load', () => {
              const m = map!;
              const circle: GeoJSON.Feature = {
                type: 'Feature', properties: {},
                geometry: { type: 'Polygon', coordinates: [circleCoords(center.lat, center.lng, radiusKm)] },
              };
              const marker: GeoJSON.Feature = {
                type: 'Feature', properties: {},
                geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
              };
              m.addSource('cap-circle', { type: 'geojson', data: circle });
              m.addLayer({ id: 'cap-circle-fill', type: 'fill', source: 'cap-circle', paint: { 'fill-color': '#5a6f93', 'fill-opacity': 0.08 } });
              m.addLayer({ id: 'cap-circle-line', type: 'line', source: 'cap-circle', paint: { 'line-color': '#5a6f93', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
              // 最寄りの海岸線/湖岸線への測線＋最寄り点（ライブ地図と同じ橙の破線）
              if (shore) {
                const shoreFc: GeoJSON.FeatureCollection = {
                  type: 'FeatureCollection',
                  features: [
                    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[center.lng, center.lat], [shore.lng, shore.lat]] } },
                    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [shore.lng, shore.lat] } },
                  ],
                };
                m.addSource('cap-shore', { type: 'geojson', data: shoreFc });
                m.addLayer({ id: 'cap-shore-line', type: 'line', source: 'cap-shore', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
                m.addLayer({ id: 'cap-shore-pt', type: 'circle', source: 'cap-shore', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#f59e0b', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
              }
              m.addSource('cap-marker', { type: 'geojson', data: marker });
              m.addLayer({ id: 'cap-marker', type: 'circle', source: 'cap-marker', paint: { 'circle-radius': 5, 'circle-color': '#c0392b', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
              // 円全体（と測線の最寄り点）が収まるよう表示範囲を合わせる
              const b = new maplibregl.LngLatBounds();
              for (const c of circleCoords(center.lat, center.lng, radiusKm)) b.extend(c as [number, number]);
              if (shore) b.extend([shore.lng, shore.lat]);
              m.fitBounds(b, { padding: 30, animate: false, maxZoom: 14 });
              m.once('idle', grab);
              setTimeout(grab, 4000); // タイル待ちの保険
            });
            setTimeout(() => finish(null), 9000); // 全体の保険
          } catch {
            finish(null);
          }
        }),
    }),
    []
  );

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
    if (map.getLayer('zones-amp-fill')) {
      map.setLayoutProperty('zones-amp-fill', 'visibility', kind === 'amp' ? 'visible' : 'none');
    }
    if (map.getLayer('zones-vs350-fill')) {
      map.setLayoutProperty('zones-vs350-fill', 'visibility', kind === 'vs350' ? 'visible' : 'none');
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

      // J-SHIS 地盤増幅率 / Vs350層下面標高（積雪深と同じ値ラスター方式）。
      const valueRasters = [
        { key: 'amp', url: AMP_PMTILES, ramp: AMP_RELIEF_COLOR },
        { key: 'vs350', url: VS350_PMTILES, ramp: VS350_RELIEF_COLOR },
      ] as const;
      valueRasters.forEach(({ key, url, ramp }) => {
        map.addSource(`zones-${key}`, {
          type: 'raster-dem',
          url: `pmtiles://${origin}${url}`,
          tileSize: 256,
          encoding: 'terrarium',
        });
        map.addLayer({
          id: `zones-${key}-fill`,
          type: 'color-relief',
          source: `zones-${key}`,
          layout: { visibility: 'none' },
          paint: {
            'color-relief-color': ramp,
            'color-relief-opacity': 0.9,
          },
        } as unknown as maplibregl.AddLayerObject);
      });

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
      if (ov === 'amp') {
        // 値ラスター: 非同期デコード（古い応答は token で破棄）
        const token = ++hoverTokenRef.current;
        ampHeightAt(e.lngLat.lng, e.lngLat.lat)
          .then((h) => {
            if (token !== hoverTokenRef.current) return;
            setHover(h != null && h > 0 ? `地盤増幅率: ${(h / 100).toFixed(2)}` : '地盤増幅率: データなし');
          })
          .catch(() => {});
        return;
      }
      if (ov === 'vs350') {
        const token = ++hoverTokenRef.current;
        vs350HeightAt(e.lngLat.lng, e.lngLat.lat)
          .then((h) => {
            if (token !== hoverTokenRef.current) return;
            setHover(
              h != null && h > 0
                ? `Vs350層下面標高: ${Math.round(h - VS350_OFFSET)} m`
                : 'Vs350層下面標高: データなし（海など）'
            );
          })
          .catch(() => {});
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
});

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
