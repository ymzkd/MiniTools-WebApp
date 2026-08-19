import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import {
  DEPTH_PMTILES,
  AMP_PMTILES,
  VS350_PMTILES,
  VS350_OFFSET,
  depthAtLngLat,
  ampHeightAt,
  vs350HeightAt,
} from './valueRaster';
import { isSeismicOverlay } from './jshisApi';
import type { MapHighlight } from './jshisApi';

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
  | 'vs350'
  | 'faults';

// 地震系オーバーレイ(seismic/amp/vs350/faults)の表示中は、選択地点への影響度上位の震源を
// ハイライト表示する(判定は jshisApi.isSeismicOverlay)。全断層(下塗り・面・断層線)を描くのは
// 'faults'(震源断層)のときだけ — 他のオーバーレイでは全国の断層が重なって読みづらいため。

interface HazardMapProps {
  center: LatLng; // マーカー＋海率円の中心（地図クリックでも更新される）
  radiusKm: number;
  // この値が変わったとき（住所検索・座標入力・初期表示）だけ円全体が収まるよう表示範囲を合わせる。
  // 地図クリックでは変えない＝クリックのたびに勝手にズームしないようにするため。
  viewVersion: number;
  overlay: ZoneOverlay; // 薄いオーバーレイ（none / 風速区分 / 地震 / 積雪深）
  shorePoint: LatLng | null; // 最寄りの海岸線/湖岸線の点（中心からの測線を表示）
  onPick: (lat: number, lng: number) => void;
  // 選択地点への影響度上位の震源(断層要素 fid 群と系列色)。地震系オーバーレイ表示中に強調描画する。
  faultHighlights?: MapHighlight[];
  // 凡例行クリック等で「この震源の範囲へ寄せる」要求。v が変わったとき bbox(と地点)に fit する。
  focusBbox?: { bbox: [number, number, number, number]; v: number } | null;
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

// Vs350層下面深さ(elevation = D1[m]+1)。浅い=淡 → 深い=濃青 の単系統(GnBu)。
// データ実範囲は 0〜440m だが中央値0・p99=88m と強く偏るので、浅い側に刻みを寄せる。
// 深さ0m(山地で層なし)も淡色で「データあり」と示し、データなし(0)は透明。
const VS350_RELIEF_COLOR = [
  'interpolate', ['linear'], ['elevation'],
  0, 'rgba(0,0,0,0)',
  1, 'rgba(247,252,240,0.4)',
  6, 'rgba(224,243,219,0.45)',
  11, 'rgba(204,235,197,0.5)',
  21, 'rgba(168,221,181,0.55)',
  41, 'rgba(123,204,196,0.6)',
  81, 'rgba(78,179,211,0.65)',
  151, 'rgba(43,140,190,0.7)',
  251, 'rgba(8,104,172,0.75)',
  441, 'rgba(8,64,129,0.8)',
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
// 値ラスターの取得パス・点読み出しは valueRaster.ts に集約（左パネルでも使うため）。
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

// J-SHIS 震源断層(2024年版 P-Y2024-PRM-SHAPE)。jiban-api pipelines/jshis/build_fault_tiles.sh の PMTiles。
//   faults: 個別断層面(傾斜断層の地表投影・海溝型の震源域) / traces: 矩形断層の上端辺(断層線。
//   鉛直断層はこの線のみ) / groups: 地震コード単位に dissolve した薄い下塗り。
// 属性 cat: land(陸域・沿岸の地震=活断層など) / inter(海溝型巨大地震・プレート間) / sub(海溝型その他)。
// 下地は彩度を落とした3色(ハイライトの系列色を目立たせるため)。
const FAULT_PMTILES = '/api/design/tiles/jshis_faults.pmtiles';
const FAULT_CAT_FILL: maplibregl.ExpressionSpecification = [
  'match', ['get', 'cat'], 'land', '#b08a5a', 'inter', '#6f8fbf', 'sub', '#9a86b8', '#9ca3af',
];
const FAULT_CAT_LINE: maplibregl.ExpressionSpecification = [
  'match', ['get', 'cat'], 'land', '#7a4f26', 'inter', '#3d5f95', 'sub', '#6b568c', '#6b7280',
];
const FAULT_CAT_LEGEND = [
  { color: '#b08a5a', line: '#7a4f26', label: '活断層など（陸域・沿岸）' },
  { color: '#6f8fbf', line: '#3d5f95', label: '海溝型巨大地震（プレート間）' },
  { color: '#9a86b8', line: '#6b568c', label: '海溝型その他（プレート内・領域）' },
];
const FAULT_BASE_LAYERS = ['faults-groups-fill', 'faults-fill', 'faults-line', 'faults-traces'] as const;
const FAULT_HL_LAYERS = [
  'faults-hl-groups-fill', 'faults-hl-fill', 'faults-hl-line-casing', 'faults-hl-line',
  'faults-hl-traces-casing', 'faults-hl-traces',
] as const;
const EMPTY_FILTER: maplibregl.FilterSpecification = ['in', ['get', 'fid'], ['literal', []]] as unknown as maplibregl.FilterSpecification;
const EMPTY_LAYER_FILTER: maplibregl.FilterSpecification = ['in', ['get', 'layer'], ['literal', []]] as unknown as maplibregl.FilterSpecification;

// ハイライト用の paint 式: fid → 系列色。空なら定数(フィルタで何も描かれない)。
// match のラベルは一意である必要があるので、上位スロットに割り当て済みの fid は後続から除く。
function dedupeHighlights(hls: MapHighlight[]): MapHighlight[] {
  const seen = new Set<number>();
  const out: MapHighlight[] = [];
  for (const h of hls) {
    const fids = h.fids.filter((f) => !seen.has(f));
    fids.forEach((f) => seen.add(f));
    if (fids.length) out.push({ ...h, fids });
  }
  return out;
}
function highlightColorExpr(hls: MapHighlight[]): maplibregl.ExpressionSpecification | string {
  const nonEmpty = dedupeHighlights(hls);
  if (!nonEmpty.length) return '#000000';
  const expr: unknown[] = ['match', ['get', 'fid']];
  for (const h of nonEmpty) expr.push(h.fids, h.color);
  expr.push('#000000');
  return expr as unknown as maplibregl.ExpressionSpecification;
}
function highlightFilter(hls: MapHighlight[]): maplibregl.FilterSpecification {
  const all = dedupeHighlights(hls).flatMap((h) => h.fids);
  return ['in', ['get', 'fid'], ['literal', all]] as unknown as maplibregl.FilterSpecification;
}
// レイヤ丸ごとの震源(layer 付き)は面の塗りを groups(dissolve済み)で行う。fid 塗りからは外す。
function highlightFillFilter(hls: MapHighlight[]): maplibregl.FilterSpecification {
  const all = dedupeHighlights(hls.filter((h) => !h.layer)).flatMap((h) => h.fids);
  return ['in', ['get', 'fid'], ['literal', all]] as unknown as maplibregl.FilterSpecification;
}
function highlightGroupFilter(hls: MapHighlight[]): maplibregl.FilterSpecification {
  const layers = hls.filter((h) => h.layer).map((h) => h.layer as string);
  return ['in', ['get', 'layer'], ['literal', layers]] as unknown as maplibregl.FilterSpecification;
}
function highlightGroupColorExpr(hls: MapHighlight[]): maplibregl.ExpressionSpecification | string {
  const withLayer = hls.filter((h) => h.layer);
  if (!withLayer.length) return '#000000';
  const expr: unknown[] = ['match', ['get', 'layer']];
  const seen = new Set<string>();
  for (const h of withLayer) {
    if (seen.has(h.layer as string)) continue;
    seen.add(h.layer as string);
    expr.push(h.layer, h.color);
  }
  expr.push('#000000');
  return expr as unknown as maplibregl.ExpressionSpecification;
}

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
    title: '地盤増幅率(工学的基盤Vs400m/sから地表)',
    // AMP_RELIEF_COLOR の値位置(0.5〜3.84)を割合に換算した帯。
    grad:
      'linear-gradient(to right,#1a9850 0%,#91cf60 12%,#d9ef8b 18%,#fee08b 24%,' +
      '#fdae61 33%,#f46d43 42%,#d73027 54%,#a50026 69%,#67001f 100%)',
    min: '0.5',
    max: '3.8',
  },
  vs350: {
    // 深部地盤モデル第1層(Vs=350m/s)の下面 = Vs400m/s層の上面 = 工学的基盤。UI表記は後者に統一。
    title: '工学的基盤(Vs400m/s)深さ',
    // VS350_RELIEF_COLOR の値位置(0〜440m)を割合に換算した帯（浅い側に刻みが寄る）。
    grad:
      'linear-gradient(to right,#f7fcf0 0%,#e0f3db 1%,#ccebc5 2%,#a8ddb5 5%,' +
      '#7bccc4 9%,#4eb3d3 18%,#2b8cbe 34%,#0868ac 57%,#084081 100%)',
    min: '0 m',
    max: '440 m',
  },
  faults: {
    title: '震源断層（J-SHIS 2024年版）',
    // 実際の凡例は FAULT_CAT_LEGEND のスウォッチ表示(下の JSX で分岐)。grad は未使用。
    grad: 'linear-gradient(to right,#b08a5a 0 33%,#6f8fbf 33% 66%,#9a86b8 66% 100%)',
    min: '',
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
  { center, radiusKm, viewVersion, overlay, shorePoint, onPick, faultHighlights, focusBbox },
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
    // 全断層(下塗り・面・断層線)は「震源断層」オーバーレイのときだけ。他の地震系オーバーレイ
    // (地域係数/増幅率/工学的基盤深さ)では全国の断層が常時重なると読みづらいので、選択地点への
    // 影響度上位の震源(ハイライト)だけを重ねる。
    const showAll = kind === 'faults' ? 'visible' : 'none';
    const showHighlight = isSeismicOverlay(kind) ? 'visible' : 'none';
    for (const id of FAULT_BASE_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showAll);
    }
    for (const id of FAULT_HL_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showHighlight);
    }
  }, []);
  // ハイライト対象(fid 群と色)。初期化時にも参照するため ref に保持。
  const highlightsRef = useRef<MapHighlight[]>(faultHighlights ?? []);
  highlightsRef.current = faultHighlights ?? [];
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

      // J-SHIS 震源断層。下塗り(groups) → 断層面(faults) → 断層線(traces) → ハイライト の順。
      // 解析円・マーカーより下に置く。地震系オーバーレイのときだけ可視(applyOverlay)。
      map.addSource('faults', { type: 'vector', url: `pmtiles://${origin}${FAULT_PMTILES}` });
      map.addLayer({
        id: 'faults-groups-fill', type: 'fill', source: 'faults', 'source-layer': 'groups',
        layout: { visibility: 'none' }, paint: { 'fill-color': FAULT_CAT_FILL, 'fill-opacity': 0.16 },
      });
      // 個別面の塗りは薄く(面の重なりで濃くならないよう。面の色は groups が担う)。ホバー判定にも使う。
      map.addLayer({
        id: 'faults-fill', type: 'fill', source: 'faults', 'source-layer': 'faults',
        layout: { visibility: 'none' }, paint: { 'fill-color': FAULT_CAT_FILL, 'fill-opacity': 0.05 },
      });
      map.addLayer({
        id: 'faults-line', type: 'line', source: 'faults', 'source-layer': 'faults',
        layout: { visibility: 'none' }, paint: { 'line-color': FAULT_CAT_LINE, 'line-width': 0.8, 'line-opacity': 0.55 },
      });
      map.addLayer({
        id: 'faults-traces', type: 'line', source: 'faults', 'source-layer': 'traces',
        layout: { visibility: 'none', 'line-cap': 'round' },
        paint: { 'line-color': FAULT_CAT_LINE, 'line-width': 1.4, 'line-opacity': 0.9 },
      });
      const hlColor = highlightColorExpr(highlightsRef.current);
      const hlFilter = highlightFilter(highlightsRef.current);
      map.addLayer({
        id: 'faults-hl-groups-fill', type: 'fill', source: 'faults', 'source-layer': 'groups',
        filter: highlightGroupFilter(highlightsRef.current),
        layout: { visibility: 'none' },
        paint: { 'fill-color': highlightGroupColorExpr(highlightsRef.current), 'fill-opacity': 0.38 },
      });
      map.addLayer({
        id: 'faults-hl-fill', type: 'fill', source: 'faults', 'source-layer': 'faults',
        filter: highlightFillFilter(highlightsRef.current),
        layout: { visibility: 'none' }, paint: { 'fill-color': hlColor, 'fill-opacity': 0.38 },
      });
      map.addLayer({
        id: 'faults-hl-line-casing', type: 'line', source: 'faults', 'source-layer': 'faults', filter: hlFilter,
        layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-width': 4.5, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'faults-hl-line', type: 'line', source: 'faults', 'source-layer': 'faults', filter: hlFilter,
        layout: { visibility: 'none' }, paint: { 'line-color': hlColor, 'line-width': 2.2 },
      });
      map.addLayer({
        id: 'faults-hl-traces-casing', type: 'line', source: 'faults', 'source-layer': 'traces', filter: hlFilter,
        layout: { visibility: 'none', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'faults-hl-traces', type: 'line', source: 'faults', 'source-layer': 'traces', filter: hlFilter,
        layout: { visibility: 'none', 'line-cap': 'round' },
        paint: { 'line-color': hlColor, 'line-width': 3.5 },
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
      // 地震系オーバーレイではカーソル下の震源断層名も併記する(面は点、線は 5px 幅で拾う)。
      const faultTxt = isSeismicOverlay(ov) ? faultTextAt(map, e.point, ov) : null;
      const withFault = (t: string | null): string | null => (t && faultTxt ? `${t} ｜ ${faultTxt}` : t ?? faultTxt);
      if (ov === 'faults') {
        setHover(faultTxt);
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
          setHover(withFault(text));
        } else {
          setHover(withFault(null));
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
            setHover(withFault(h != null && h > 0 ? `地盤増幅率: ${(h / 100).toFixed(2)}` : '地盤増幅率: データなし'));
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
              withFault(
                h != null && h > 0
                  ? `工学的基盤深さ: ${Math.round(h - VS350_OFFSET)} m`
                  : '工学的基盤深さ: データなし（海など）'
              )
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

  // 影響度上位の震源(ハイライト)が変わったら fid フィルタと色を更新
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer('faults-hl-fill')) return;
    const hls = faultHighlights ?? [];
    const color = highlightColorExpr(hls);
    const filter = hls.length ? highlightFilter(hls) : EMPTY_FILTER;
    for (const id of FAULT_HL_LAYERS) {
      if (id === 'faults-hl-groups-fill') {
        map.setFilter(id, hls.length ? highlightGroupFilter(hls) : EMPTY_LAYER_FILTER);
        map.setPaintProperty(id, 'fill-color', highlightGroupColorExpr(hls));
        continue;
      }
      map.setFilter(id, id === 'faults-hl-fill' ? (hls.length ? highlightFillFilter(hls) : EMPTY_FILTER) : filter);
      if (!id.endsWith('casing')) {
        map.setPaintProperty(id, id.includes('fill') ? 'fill-color' : 'line-color', color);
      }
    }
  }, [faultHighlights]);

  // 凡例行クリック: その震源の範囲(＋選択地点)に表示範囲を合わせる
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !focusBbox) return;
    const [w, s, e, n] = focusBbox.bbox;
    const b = new maplibregl.LngLatBounds([w, s], [e, n]);
    const c = latestRef.current.center;
    b.extend([c.lng, c.lat]);
    map.fitBounds(b, { padding: 50, maxZoom: 11, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBbox?.v]);

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
          {overlay === 'faults' ? (
            <div className="mt-1 space-y-0.5">
              {FAULT_CAT_LEGEND.map((c) => (
                <div key={c.label} className="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                  <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: c.color, boxShadow: `inset 0 0 0 1px ${c.line}` }} />
                  {c.label}
                </div>
              ))}
              <div className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                線＝断層線（鉛直断層は線のみ）／太い色付き＝選択地点への影響度上位（左の凡例と同色）
              </div>
            </div>
          ) : (
            <>
              <div className="h-2 w-full rounded mt-1" style={{ background: LEGEND[overlay].grad }} />
              <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                <span>{LEGEND[overlay].min}</span>
                <span>{LEGEND[overlay].max}</span>
              </div>
              {isSeismicOverlay(overlay) && (
                <div className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                  ＋選択地点への影響度上位の震源のみ重ねて表示（全断層は「震源断層」で表示）
                </div>
              )}
            </>
          )}
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

// カーソル位置の震源断層名(地震系オーバーレイのホバー用)。面は点で、線は 5px 四方の矩形で拾う。
// 重なる要素(同一領域の複数モデル等)は先頭＋件数で示す。
// 参照するレイヤは「そのオーバーレイで実際に描いているもの」に合わせる:
//   'faults'      … 全断層(faults/traces)。非表示レイヤは queryRenderedFeatures が拾わないため。
//   その他の地震系 … 影響度上位のハイライトのみ(faults-hl-*)。レイヤ丸ごとの震源(南海トラフ等)は
//                    dissolve 面(groups)なので fid を持たず layer で重複排除する。
function faultTextAt(map: maplibregl.Map, pt: maplibregl.Point, overlay: ZoneOverlay): string | null {
  if (!map.getLayer('faults-fill')) return null;
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [pt.x - 5, pt.y - 5],
    [pt.x + 5, pt.y + 5],
  ];
  const lineLayers = overlay === 'faults' ? ['faults-traces'] : ['faults-hl-traces'];
  const fillLayers =
    overlay === 'faults' ? ['faults-fill'] : ['faults-hl-fill', 'faults-hl-groups-fill'];
  const lines = map.queryRenderedFeatures(box, { layers: lineLayers.filter((l) => map.getLayer(l)) });
  const polys = map.queryRenderedFeatures(pt, { layers: fillLayers.filter((l) => map.getLayer(l)) });
  const seen = new Set<string>();
  const names: string[] = [];
  for (const f of [...lines, ...polys]) {
    const p = f.properties || {};
    const key = p.fid != null ? `f${p.fid}` : `l${p.layer ?? p.name ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mag = p.mag != null && p.mag !== '' ? ` ${p.mag_kind ?? 'M'}${Number(p.mag).toFixed(1)}` : '';
    names.push(`${p.name ?? p.code ?? ''}${mag}`);
  }
  if (!names.length) return null;
  return `断層: ${names[0]}${names.length > 1 ? ` ほか${names.length - 1}件` : ''}`;
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
