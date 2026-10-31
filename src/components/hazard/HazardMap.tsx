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
// ボーリング調査地点タイル(共有定義は boring/pointsTiles.ts)。ヒートマップはオーバーレイの1つ、
// 個別マーカーは注記トグル(annotations.boringPts)として描く。
import {
  PICK_PX,
  TOKYO_COLOR,
  NGI_COLOR,
  NGI_ONLY_COLOR,
  SELECTED_COLOR as BORING_SELECTED_COLOR,
  PMTILES_URL as BORING_PMTILES,
  POINTS_LAYER as BORING_POINTS_LAYER,
  featureToResult,
  sourceLabel,
} from '../boring/pointsTiles';
import type { TileProps } from '../boring/pointsTiles';
import type { MLITSearchResult } from '../boring/types';
import type { SourcePick } from './SourceDetailPanel';

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
  | 'faults'
  | 'boring';

// 全断層(下塗り・面・断層線)を描くのは 'faults'(震源断層)オーバーレイのときだけ —
// 常時だと全国の断層が重なって読みづらいため。
// 一方、海率円・海岸線への測線・ボーリング地点は「その地点の情報」であり、
// 面のオーバーレイ(overlay)とは独立に、下の annotations で個別に表示切替する。
export interface MapAnnotations {
  seaCircle: boolean; // 海率算定の円(半径 R)
  shoreLine: boolean; // 最寄りの海岸線/湖岸線への測線＋最寄り点
  boringPts: boolean; // ボーリング調査地点のマーカー(z10以上。クリックで柱状図)
  nearbyFaults: boolean; // 近隣の震源(地点に波形がある想定地震の断層)の強調
}

interface HazardMapProps {
  center: LatLng; // マーカー＋海率円の中心（地図クリックでも更新される）
  radiusKm: number;
  // この値が変わったとき（住所検索・座標入力・初期表示）だけ円全体が収まるよう表示範囲を合わせる。
  // 地図クリックでは変えない＝クリックのたびに勝手にズームしないようにするため。
  viewVersion: number;
  overlay: ZoneOverlay; // 薄いオーバーレイ（none / 風速区分 / 地震 / 積雪深）
  shorePoint: LatLng | null; // 最寄りの海岸線/湖岸線の点（中心からの測線を表示）
  annotations: MapAnnotations; // 地点の注記(海率円/測線/ボーリング地点)の表示切替
  onPick: (lat: number, lng: number) => void;
  // ボーリング地点マーカーのクリック。primary=踏んだ地点、nearby=周辺12px内の地点群(重なりの巡回用)。
  // ハザードの選択地点(onPick)は動かさない — 近隣の調査地点を巡回して見るユースケースのため。
  onBoringPick?: (primary: MLITSearchResult, nearby: MLITSearchResult[]) => void;
  // 選択中のボーリング地点の座標(青ハイライト表示用)。null で非表示。左パネルに柱状図を
  // 出している間は、ズーム・オーバーレイの状態に依らず常にマーカー表示する。
  selectedBoringPoint?: LatLng | null;
  // 震源断層のクリック。想定地震(Sデータ)を持つ断層を踏んだときだけ呼ばれる。
  // ハザードの選択地点(onPick)は動かさない — ボーリング地点マーカーと同じ扱い。
  onFaultPick?: (pick: FaultPick) => void;
  // 左パネルで開いている断層。code=その断層、src=同じ震源グループ(色で括る)。
  selectedFaultCode?: string | null;
  selectedFaultSrc?: string | null;
  /** 震源グループの色。同じ震源の断層をこの色で括る */
  groupColor?: string | null;
  /** 左パネルの一覧でカーソルを合わせている断層。地図でその断層面を強調する */
  hoverFaultCode?: string | null;
  /** 震源モデル(想定地震の無い震源)のクリック。想定地震の断層より優先度は低い */
  onSourcePick?: (pick: SourcePick) => void;
  /** 左パネルで開いている震源モデルの src(青で強調) */
  selectedSourceSrc?: string | null;
  /** 近隣の震源(地点に波形がある想定地震の断層コード)。注記 nearbyFaults で強調する */
  nearbyCodes?: string[];
  /** 計算対象範囲 [西経度, 南緯度, 東経度, 北緯度]。近隣の震源の一覧でカーソル中の断層のもの */
  hoverArea?: [number, number, number, number] | null;
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

// 想定地震の断層(jiban-api /jshis/scenario/faults.geojson)。J-SHIS「震源断層を特定した
// 地震動予測地図」の断層面で、**断層コードごとに1件**でまとめない。震源断層オーバーレイは
// これだけを描く(確率論的地図の震源モデル=海溝型などは描かない。地点への影響を個別に見られる
// のは想定地震だけなので)。タイルにするには小さいので GeoJSON のまま読む。
// 鉛直断層の面は地表投影が線に潰れるので、データ側で上端の LineString になっている
// (線レイヤだけが描き、塗りレイヤは素通りする)。
// 同時活動(combo=1)は構成区間と同じ場所に重なる長い面なので普段は描かず、一覧のホバーと
// 選択の強調にだけ使う。
const SFAULT_GEOJSON = '/api/jshis/scenario/faults.geojson';
const SFAULT_LAYERS = ['sfault-fill', 'sfault-line'] as const;
const SFAULT_INK = '#7a4f26';
const SFAULT_FILL = '#b08a5a';
const NOT_COMBO: maplibregl.ExpressionSpecification = ['!=', ['get', 'combo'], 1];
// 左パネルで開いている震源の断層は、断層をまとめず同じ色の破線で括る(グループ色)。
const GROUP_INK_DEFAULT = '#0f766e';
// 選択中の断層は青、カーソル下(地図・一覧のどちらでも)は墨で強調する。
const FAULT_SEL_INK = '#2563eb';
const FAULT_HOVER_INK = '#111827';
const LIST_HOVER_LAYERS = ['sfault-listhover-fill', 'sfault-listhover'] as const;
// 近隣の震源(地点に波形がある想定地震の断層)。オーバーレイと関係なく、注記 nearbyFaults で出す。
const NEAR_LAYERS = ['sfault-near-fill', 'sfault-near'] as const;
// 想定地震の断層(茶)と見分けが付くよう、地点マーカー(赤)に寄せた系統にする
const NEAR_INK = '#e11d48';
// 想定地震の無い震源(確率論的地図の震源モデル。jiban-api の PMTiles)。タイルの kind 属性で描き分ける:
//   fault … 想定地震の無い活断層(主要活断層帯の残り・それ以外の活断層)。想定地震の断層と同じ
//           面＋断層線の描き方で、灰色にして区別する
//   sea   … 海溝型の巨大地震・日本海東縁の海域の地震。震源域が広く陸を覆うので輪郭線だけ
//   (scenario は上の GeoJSON で1本ずつ描くので使わない。area=震源を特定しにくい地震の領域は描かない)
const SRCM_PMTILES = '/api/design/tiles/jshis_faults.pmtiles';
const SRCM_LAYERS = ['srcm-fault-fill', 'srcm-fault-traces', 'srcm-sea-line'] as const;
const SRCM_HOVER_LAYERS = ['srcm-hover-fill', 'srcm-hover-line', 'srcm-hover-traces'] as const;
const SRCM_SEL_LAYERS = ['srcm-sel-fill', 'srcm-sel-line', 'srcm-sel-traces'] as const;
const SRCM_FAULT_INK = '#6b7280';
const SRCM_FAULT_FILL = '#9ca3af';
const SRCM_SEA_INK = '#4b6a9b';
const KIND_FAULT: maplibregl.ExpressionSpecification = ['==', ['get', 'kind'], 'fault'];
const KIND_SEA: maplibregl.ExpressionSpecification = ['==', ['get', 'kind'], 'sea'];
const EMPTY_SRC_FILTER: maplibregl.FilterSpecification = ['==', ['get', 'src'], ''] as unknown as maplibregl.FilterSpecification;
// 地点の注記レイヤー(annotations で個別に表示切替する)。マーカーは地点そのものなので常時表示。
const CIRCLE_LAYERS = ['circle-fill', 'circle-line'] as const;
const SHORE_LAYERS = ['shore-line', 'shore-pt'] as const;
// 海率円も測線も非表示のときに使う、地点中心の既定ズーム。
const POINT_ZOOM = 12;
const EMPTY_FILTER: maplibregl.FilterSpecification = ['in', ['get', 'src'], ['literal', []]] as unknown as maplibregl.FilterSpecification;
const EMPTY_CODE_FILTER: maplibregl.FilterSpecification = ['in', ['get', 'code'], ['literal', []]] as unknown as maplibregl.FilterSpecification;

// 想定地震の断層と震源モデルは、震源断層オーバーレイのときだけ出す。
function applyScenarioFaults(map: maplibregl.Map, overlay: ZoneOverlay) {
  const vis = overlay === 'faults' ? 'visible' : 'none';
  for (const id of [...SFAULT_LAYERS, ...SRCM_LAYERS]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
  }
}

// 震源モデルの src でフィルタする(カーソル下 / 選択中)。null で解除。
function setSrcFilter(map: maplibregl.Map, ids: readonly string[], src: string | null) {
  const filter: maplibregl.FilterSpecification = src
    ? (['==', ['get', 'src'], src] as unknown as maplibregl.FilterSpecification)
    : EMPTY_SRC_FILTER;
  for (const id of ids) {
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

// 近隣の震源(断層コードの一覧)を強調する。同時活動は構成区間と重なるので描かない。
function setNearFilter(map: maplibregl.Map, codes: string[]) {
  const filter = [
    'all',
    ['in', ['get', 'code'], ['literal', codes]],
    NOT_COMBO,
  ] as unknown as maplibregl.FilterSpecification;
  for (const id of NEAR_LAYERS) {
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

function areaFeature(a: [number, number, number, number] | null | undefined): GeoJSON.FeatureCollection {
  if (!a) return EMPTY_FC;
  const [w, s, e, n] = a;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] },
    }],
  };
}

// 断層コードでフィルタする(カーソル下 / 選択中)。null で解除。
function setCodeFilter(map: maplibregl.Map, ids: readonly string[], code: string | null) {
  const filter: maplibregl.FilterSpecification =
    code ? (['==', ['get', 'code'], code] as unknown as maplibregl.FilterSpecification) : EMPTY_CODE_FILTER;
  for (const id of ids) {
    if (map.getLayer(id)) map.setFilter(id, filter);
  }
}

// 選択中の断層と同じ震源グループの断層をグループ色で括る。断層は1本ずつ描いたままで、
// 「同じ震源である」ことだけを色で示す(データとしてはまとめない)。
function setGroupOutline(map: maplibregl.Map, src: string | null, exclude: string | null, color: string) {
  if (!map.getLayer('sfault-group')) return;
  const filter: maplibregl.FilterSpecification = src
    ? ([
        'all',
        ['==', ['get', 'src'], src],
        ['!=', ['get', 'code'], exclude ?? ''],
        NOT_COMBO,
      ] as unknown as maplibregl.FilterSpecification)
    : EMPTY_FILTER;
  map.setFilter('sfault-group', filter);
  map.setPaintProperty('sfault-group', 'line-color', color);
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
    title: '震源断層（J-SHIS）',
    // 実際の凡例はスウォッチと注記(下の JSX で分岐)。grad は未使用。
    grad: 'linear-gradient(to right,#b08a5a,#b08a5a)',
    min: '',
    max: '',
  },
  boring: {
    title: 'ボーリング調査データ',
    // 実際の凡例はデータソース別のマーカー色(下の JSX の BORING_LEGEND)。密度ヒートマップは
    // 「そこにデータがある」ことを示すだけなので帯は出さない。grad は未使用。
    grad:
      'linear-gradient(to right,rgba(33,102,172,0.55),rgba(103,169,207,0.7),' +
      'rgba(253,184,99,0.85),rgba(239,138,98,0.9),rgba(178,24,43,0.95))',
    min: '密度低',
    max: '密度高',
  },
};

// ボーリング調査データの凡例。マーカーの色(boringColorExpr)と対応させる。
const BORING_LEGEND: { color: string; label: string; ring?: boolean }[] = [
  { color: NGI_COLOR, label: '国土地盤（KuniJiban掲載）' },
  { color: NGI_ONLY_COLOR, label: '国土地盤（NGICのみ）' },
  { color: TOKYO_COLOR, label: '東京の地盤（GIS版）' },
  { color: BORING_SELECTED_COLOR, label: '選択中', ring: true },
];

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
  {
    center,
    radiusKm,
    viewVersion,
    overlay,
    shorePoint,
    annotations,
    onPick,
    onBoringPick,
    selectedBoringPoint,
    onFaultPick,
    selectedFaultCode,
    selectedFaultSrc,
    groupColor,
    hoverFaultCode,
    onSourcePick,
    selectedSourceSrc,
    nearbyCodes,
    hoverArea,
  },
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
  const annotRef = useRef(annotations);
  annotRef.current = annotations;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onBoringPickRef = useRef(onBoringPick);
  onBoringPickRef.current = onBoringPick;
  const onFaultPickRef = useRef(onFaultPick);
  onFaultPickRef.current = onFaultPick;
  const selectedFaultSrcRef = useRef(selectedFaultSrc);
  selectedFaultSrcRef.current = selectedFaultSrc;
  const groupColorRef = useRef(groupColor);
  groupColorRef.current = groupColor;
  const hoverFaultCodeRef = useRef(hoverFaultCode);
  hoverFaultCodeRef.current = hoverFaultCode;
  const selectedFaultCodeRef = useRef(selectedFaultCode);
  selectedFaultCodeRef.current = selectedFaultCode;
  const onSourcePickRef = useRef(onSourcePick);
  onSourcePickRef.current = onSourcePick;
  const selectedSourceSrcRef = useRef(selectedSourceSrc);
  selectedSourceSrcRef.current = selectedSourceSrc;
  const nearbyCodesRef = useRef(nearbyCodes);
  nearbyCodesRef.current = nearbyCodes;
  const hoverAreaRef = useRef(hoverArea);
  hoverAreaRef.current = hoverArea;
  // 拡大表示中の震源モデル(srcm-hover のフィルタ比較用)
  const srcmHoverKeyRef = useRef<string | null>(null);
  // 拡大表示中の想定地震断層(sfault-hover のフィルタ比較用)
  const sfaultHoverKeyRef = useRef<string | null>(null);
  // カーソル位置のオーバーレイ値（地図左下に控えめ表示）
  const [hover, setHover] = useState<string | null>(null);
  const hoverTokenRef = useRef(0);
  // 拡大表示中のボーリング地点ID(boring-hover のフィルタ比較用)。
  const boringHoverKeyRef = useRef<string | null>(null);

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

  // ボーリング地点マーカーの可視条件: オーバーレイ 'boring' 有効(全ズームで
  // 点を表示) または 注記トグルON(ズームインしたとき = z10以上のみ)。両者でズーム下限が違うので、
  // visibility と zoom range をここでまとめて切り替える。オーバーレイと注記の両方の状態に
  // 依存するため、applyOverlay / applyAnnotations の双方から呼ぶ。
  const applyBoringPts = useCallback((kind: ZoneOverlay, a: MapAnnotations) => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer('boring-pts')) return;
    const overlayOn = kind === 'boring';
    const vis = overlayOn || a.boringPts ? 'visible' : 'none';
    // トグル単独では z11 以上(詳細を見に行ったときだけ出す)。オーバーレイ時は全ズーム。
    for (const id of ['boring-pts', 'boring-hover'] as const) {
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, 'visibility', vis);
      map.setLayerZoomRange(id, overlayOn ? 0 : 11, 24);
    }
    // 表示条件が変わったら、切替前のホバー拡大は残さない。
    boringHoverKeyRef.current = null;
    if (map.getLayer('boring-hover')) map.setFilter('boring-hover', ['==', ['get', 'id'], '']);
  }, []);

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
    if (map.getLayer('boring-heat')) {
      map.setLayoutProperty('boring-heat', 'visibility', kind === 'boring' ? 'visible' : 'none');
    }
    applyBoringPts(kind, annotRef.current);
    // 断層は「震源断層」オーバーレイのときだけ(全国の断層が常時重なると読みづらいため)。
    applyScenarioFaults(map, kind);
  }, [applyBoringPts]);

  // 地点の注記(海率円/測線/ボーリング地点)の表示切替。データはそのまま持っているので
  // visibility を差し替えるだけ＝再取得は発生しない。
  const applyAnnotations = useCallback((a: MapAnnotations) => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const setVis = (ids: readonly string[], on: boolean) => {
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    };
    setVis(CIRCLE_LAYERS, a.seaCircle);
    setVis(SHORE_LAYERS, a.shoreLine);
    setVis(NEAR_LAYERS, a.nearbyFaults);
    applyBoringPts(overlayRef.current, a);
  }, [applyBoringPts]);
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
      fitToPoint(map, c, r, shorePointRef.current, annotRef.current);
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

      // 想定地震の無い震源(震源モデル)。想定地震の断層の下に敷く。海溝型の輪郭 → 活断層の面 →
      // 断層線 の順。強調(カーソル下・選択中)は想定地震の断層と同じく常に可視の層で描く。
      map.addSource('srcm', { type: 'vector', url: `pmtiles://${origin}${SRCM_PMTILES}` });
      map.addLayer({
        id: 'srcm-sea-line', type: 'line', source: 'srcm', 'source-layer': 'sources', filter: KIND_SEA,
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': SRCM_SEA_INK, 'line-width': 1.4, 'line-opacity': 0.85, 'line-dasharray': [3, 2] },
      });
      map.addLayer({
        id: 'srcm-fault-fill', type: 'fill', source: 'srcm', 'source-layer': 'sources', filter: KIND_FAULT,
        layout: { visibility: 'none' }, paint: { 'fill-color': SRCM_FAULT_FILL, 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'srcm-fault-traces', type: 'line', source: 'srcm', 'source-layer': 'source_traces', filter: KIND_FAULT,
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': SRCM_FAULT_INK, 'line-width': 1.2, 'line-opacity': 0.9 },
      });
      const srcmHi = (prefix: string, ink: string, fillOpacity: number, width: number) => {
        map.addLayer({
          id: `${prefix}-fill`, type: 'fill', source: 'srcm', 'source-layer': 'sources',
          filter: EMPTY_SRC_FILTER, paint: { 'fill-color': ink, 'fill-opacity': fillOpacity },
        });
        map.addLayer({
          id: `${prefix}-line`, type: 'line', source: 'srcm', 'source-layer': 'sources',
          filter: EMPTY_SRC_FILTER, layout: { 'line-join': 'round' },
          paint: { 'line-color': ink, 'line-width': width },
        });
        map.addLayer({
          id: `${prefix}-traces`, type: 'line', source: 'srcm', 'source-layer': 'source_traces',
          filter: EMPTY_SRC_FILTER, layout: { 'line-join': 'round' },
          paint: { 'line-color': ink, 'line-width': width },
        });
      };
      // 海溝型の震源域は広いので、強調でも塗りは薄くする
      srcmHi('srcm-hover', FAULT_HOVER_INK, 0.08, 2.2);
      srcmHi('srcm-sel', FAULT_SEL_INK, 0.12, 2.6);

      // 想定地震の断層。普段の描画 → 震源グループの破線 → カーソル下 → 選択中 の順に重ねる。
      // 解析円・マーカーより下に置く。普段の描画は震源断層オーバーレイのときだけ可視(applyOverlay)、
      // 強調の層は常に可視(一覧からのホバー・選択はオーバーレイと関係なく見せる)。
      map.addSource('scenario-faults', { type: 'geojson', data: SFAULT_GEOJSON });
      map.addLayer({
        id: 'sfault-fill', type: 'fill', source: 'scenario-faults', filter: NOT_COMBO,
        layout: { visibility: 'none' }, paint: { 'fill-color': SFAULT_FILL, 'fill-opacity': 0.16 },
      });
      map.addLayer({
        id: 'sfault-line', type: 'line', source: 'scenario-faults', filter: NOT_COMBO,
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': SFAULT_INK, 'line-width': 1.6, 'line-opacity': 0.95 },
      });
      // 近隣の震源(地点に波形がある断層)。注記 nearbyFaults で出し入れする(applyAnnotations)。
      map.addLayer({
        id: 'sfault-near-fill', type: 'fill', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'none' }, paint: { 'fill-color': NEAR_INK, 'fill-opacity': 0.16 },
      });
      map.addLayer({
        id: 'sfault-near', type: 'line', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'none', 'line-join': 'round' },
        paint: { 'line-color': NEAR_INK, 'line-width': 2 },
      });
      // 一覧でカーソル中の断層の計算対象範囲(この矩形の中にだけ波形がある)
      map.addSource('nearby-area', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'nearby-area', type: 'line', source: 'nearby-area',
        paint: { 'line-color': FAULT_HOVER_INK, 'line-width': 1.4, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
      });
      // 選択中の断層と同じ震源グループの断層(グループ色で括る。まとめて塗らず1本ずつ)
      map.addLayer({
        id: 'sfault-group', type: 'line', source: 'scenario-faults', filter: EMPTY_FILTER,
        layout: { visibility: 'visible', 'line-join': 'round' },
        paint: { 'line-color': GROUP_INK_DEFAULT, 'line-width': 2.4, 'line-dasharray': [2, 1.4] },
      });
      // カーソル下の断層(地図のホバーと、左パネルの一覧のホバーで別の層。フィルタを差し替えて
      // 1本だけ描く)。一覧のホバーは同時活動のように普段描かない断層も指すので、塗りも付ける。
      map.addLayer({
        id: 'sfault-hover', type: 'line', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'visible', 'line-join': 'round' },
        paint: { 'line-color': FAULT_HOVER_INK, 'line-width': 2.6 },
      });
      map.addLayer({
        id: 'sfault-listhover-fill', type: 'fill', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'visible' },
        paint: { 'fill-color': FAULT_HOVER_INK, 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'sfault-listhover', type: 'line', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'visible', 'line-join': 'round' },
        paint: { 'line-color': FAULT_HOVER_INK, 'line-width': 3 },
      });
      map.addLayer({
        id: 'sfault-sel-fill', type: 'fill', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'visible' },
        paint: { 'fill-color': FAULT_SEL_INK, 'fill-opacity': 0.3 },
      });
      map.addLayer({
        id: 'sfault-sel', type: 'line', source: 'scenario-faults', filter: EMPTY_CODE_FILTER,
        layout: { visibility: 'visible', 'line-join': 'round' },
        paint: { 'line-color': FAULT_SEL_INK, 'line-width': 3 },
      });

      // ボーリング調査地点(points.pmtiles)。
      //   boring-heat     … 密度ヒートマップ。排他オーバーレイ 'boring' のときだけ可視。
      //                     点レイヤが立ち上がる z9-12 でフェードアウトする。
      //   boring-pts      … 個別マーカー。オーバーレイ 'boring' 有効時は
      //                     全ズームで、注記トグル(annotations.boringPts)単独では z11 以上で表示
      //                     (可視条件とズーム範囲は applyBoringPts で切り替える)。
      //   boring-hover    … カーソル下の地点の拡大表示(boring-pts より一回り大きい)。
      //   boring-selected … 選択中の地点の青ハイライト。タイルは広域ズームで点を間引くため
      //                     タイルのフィルタでは広域で消えてしまう。選択地点の座標は分かって
      //                     いるので GeoJSON ソースで描き、ズーム・オーバーレイに依らず常時表示する。
      map.addSource('boring', { type: 'vector', url: `pmtiles://${origin}${BORING_PMTILES}` });
      map.addLayer({
        id: 'boring-heat',
        type: 'heatmap',
        source: 'boring',
        'source-layer': BORING_POINTS_LAYER,
        maxzoom: 12,
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': 0.8,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1.0, 6, 1.1, 12, 1.5],
          // 広域でも孤立した地点が見えるよう、低ズームで半径を大きめに取る。
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 7, 4, 10, 8, 16, 12, 26],
          // 低密度(=まばらにデータがある所)にも色の下限を置き、「データがある」ことが分かるようにする。
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.04, 'rgba(33,102,172,0.55)',
            0.25, 'rgba(103,169,207,0.7)',
            0.5, 'rgba(253,184,99,0.85)',
            0.8, 'rgba(239,138,98,0.9)',
            1, 'rgba(178,24,43,0.95)',
          ],
          // 円レイヤが立ち上がる z9-12 でヒートマップをフェードアウト
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 12, 0],
        },
      });
      const boringColorExpr: maplibregl.ExpressionSpecification = [
        'case',
        ['==', ['get', 'source'], 'tokyo'], TOKYO_COLOR,
        ['==', ['get', 'kj'], 0], NGI_ONLY_COLOR,
        NGI_COLOR,
      ];
      map.addLayer({
        id: 'boring-pts',
        type: 'circle',
        source: 'boring',
        'source-layer': BORING_POINTS_LAYER,
        minzoom: 11, // 既定(トグル単独)の下限。オーバーレイ有効時は applyBoringPts が 0 に広げる
        layout: { visibility: 'none' },
        paint: {
          'circle-color': boringColorExpr,
          // 通常時は一段階小さめにして地点指定マーカーを目立たせる。カーソル下の点は
          // boring-hover が従来サイズに拡大表示する。
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 8, 4, 11, 5, 14, 6, 17, 8],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1, 14, 1.5],
        },
      });
      // カーソル下の地点を一回り拡大し「この点を選べる」ことを示す。
      // 震源ホバーと同じフィルタ差替え方式。可視条件・ズーム範囲は boring-pts と連動(applyBoringPts)。
      map.addLayer({
        id: 'boring-hover',
        type: 'circle',
        source: 'boring',
        'source-layer': BORING_POINTS_LAYER,
        minzoom: 11,
        filter: ['==', ['get', 'id'], ''],
        layout: { visibility: 'none' },
        paint: {
          'circle-color': boringColorExpr,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 5, 11, 6, 14, 7.5, 17, 10],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 1.2, 14, 1.8],
        },
      });
      map.addSource('boring-selected', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'boring-selected',
        type: 'circle',
        source: 'boring-selected',
        paint: {
          'circle-color': BORING_SELECTED_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 5, 16, 9],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
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
          // ボーリング地点マーカーの群れに埋もれないよう一段階大きくする。
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
      readyRef.current = true;
      // 初期データ反映。表示範囲合わせは「実サイズが付いてから」一度だけ（下の maybeInitialFit）。
      updateData(map, center, radiusKm);
      updateShore(map, center, shorePointRef.current);
      maybeInitialFit();
      applyOverlay(overlayRef.current); // マウント時にオーバーレイ選択済みなら反映
      applyAnnotations(annotRef.current); // 同上（前回セッションのトグル状態を復元）
      setCodeFilter(map, ['sfault-sel-fill', 'sfault-sel'], selectedFaultCodeRef.current ?? null);
      setGroupOutline(map, selectedFaultSrcRef.current ?? null, selectedFaultCodeRef.current ?? null,
                      groupColorRef.current || GROUP_INK_DEFAULT);
      setCodeFilter(map, LIST_HOVER_LAYERS, hoverFaultCodeRef.current ?? null);
      setSrcFilter(map, SRCM_SEL_LAYERS, selectedSourceSrcRef.current ?? null);
      setNearFilter(map, nearbyCodesRef.current ?? []);
      (map.getSource('nearby-area') as maplibregl.GeoJSONSource).setData(areaFeature(hoverAreaRef.current));
    });

    // クリックの優先順位: 可視のボーリング地点マーカーを踏んだらその調査データを選択し、
    // ハザードの選択地点は動かさない(近隣の調査地点を巡回して見るユースケースのため)。
    // マーカーに当たらなければ従来どおり、その地点をハザードの選択地点にする。
    // 非表示レイヤーは queryRenderedFeatures が拾わないので、トグルOFF時は自動的に全面クリック扱い。
    map.on('click', (e) => {
      // boring-hover も対象にして、拡大表示中の円のフチまでクリックで拾えるようにする。
      const boringLayers = ['boring-pts', 'boring-hover'].filter((l) => map.getLayer(l));
      if (boringLayers.length && onBoringPickRef.current) {
        const hit = map.queryRenderedFeatures(e.point, { layers: boringLayers });
        if (hit.length) {
          const c = (hit[0].geometry as GeoJSON.Point).coordinates;
          const primary = featureToResult(hit[0].properties as TileProps, c[0], c[1]);
          // クリック周辺の地点群も一覧用に拾う(重なった地点の切替用。12px)。
          const box: [maplibregl.PointLike, maplibregl.PointLike] = [
            [e.point.x - PICK_PX, e.point.y - PICK_PX],
            [e.point.x + PICK_PX, e.point.y + PICK_PX],
          ];
          const near = map.queryRenderedFeatures(box, { layers: boringLayers });
          const seen = new Set<string>([`${primary.source}-${primary.id}`]);
          const list: MLITSearchResult[] = [primary];
          for (const nf of near) {
            const p = nf.properties as TileProps;
            const nc = (nf.geometry as GeoJSON.Point).coordinates;
            const r = featureToResult(p, nc[0], nc[1]);
            const key = `${r.source}-${r.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            list.push(r);
          }
          onBoringPickRef.current(primary, list);
          return;
        }
      }
      // 想定地震の断層を踏んだら、その詳細を左パネルへ。ボーリング地点と同様、
      // ハザードの選択地点は動かさない(断層を見比べている最中に地点が飛ぶと使いにくいため)。
      if (onFaultPickRef.current) {
        const sf = scenarioFaultAt(map, e.point);
        if (sf?.code) {
          onFaultPickRef.current({ src: sf.src, name: sf.name, code: sf.code });
          return;
        }
      }
      // 想定地震の無い震源(震源モデル)。想定地震の断層と重なる所では想定地震を優先する。
      if (onSourcePickRef.current) {
        const sm = sourceModelAt(map, e.point);
        if (sm) {
          onSourcePickRef.current(sm);
          return;
        }
      }
      // 選択中ボーリング地点の青マーカー(GeoJSON・タイル属性なし)の上は何もしない。
      // 広域ズームで個別マーカーが消えていても、選択中の点を踏んだクリックが
      // 地点指定に化けて選択が解除されてしまわないようにする。
      if (
        map.getLayer('boring-selected') &&
        map.queryRenderedFeatures(e.point, { layers: ['boring-selected'] }).length
      ) {
        return;
      }
      onPickRef.current(e.lngLat.lat, normLng(e.lngLat.lng));
    });
    // マーカー上では「押せる」ことが伝わるよう pointer にし、カーソル下の点を拡大表示する
    // (それ以外は地点指定の crosshair)。対象が変わったときだけフィルタを差し替える。
    const setBoringHover = (id: string | null) => {
      if (id === boringHoverKeyRef.current) return;
      boringHoverKeyRef.current = id;
      if (map.getLayer('boring-hover')) {
        map.setFilter('boring-hover', ['==', ['get', 'id'], id ?? '']);
      }
    };
    map.on('mousemove', 'boring-pts', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0]?.properties as TileProps | undefined;
      setBoringHover(p?.id ?? null);
    });
    map.on('mouseleave', 'boring-pts', () => {
      map.getCanvas().style.cursor = 'crosshair';
      setBoringHover(null);
    });

    // オーバーレイ表示中、カーソル位置のデータを小さくリアルタイム表示。
    //   区分(snow/wind)はベクタを queryRenderedFeatures で即時取得。
    //   積雪深はラスターなので PMTiles のタイル画素を復号(同一タイルはキャッシュ)。
    // 対象が変わったときだけフィルタを差し替える(mousemove ごとの setFilter は無駄が大きい)。
    // カーソル下の断層を1本だけ強調し、押せることを伝える
    const applyScenarioHover = (code: string | null) => {
      if (code === sfaultHoverKeyRef.current) return;
      sfaultHoverKeyRef.current = code;
      setCodeFilter(map, ['sfault-hover'], code);
    };

    const applySourceHover = (src: string | null) => {
      if (src === srcmHoverKeyRef.current) return;
      srcmHoverKeyRef.current = src;
      setSrcFilter(map, SRCM_HOVER_LAYERS, src);
    };

    map.on('mousemove', (e) => {
      const ov = overlayRef.current;
      const sfHit = scenarioFaultAt(map, e.point);
      applyScenarioHover(sfHit?.code ?? null);
      const smHit = sfHit ? null : sourceModelAt(map, e.point);
      applySourceHover(smHit?.src ?? null);
      if (sfHit) {
        map.getCanvas().style.cursor = onFaultPickRef.current ? 'pointer' : 'crosshair';
      } else if (smHit) {
        map.getCanvas().style.cursor = onSourcePickRef.current ? 'pointer' : 'crosshair';
      }
      if (ov === 'none') {
        // オーバーレイ無しでも、近隣の震源の断層の上は押せる(pointer は上で設定済み)。
        // ボーリング地点(注記で表示中)の上も、専用ハンドラが付けた pointer を残す
        if (!sfHit && !boringHoverKeyRef.current) map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      // 断層は押せるので pointer(上で設定済み)。ボーリング側の mousemove は専用ハンドラで
      // 別に pointer にしているので上書きしない。
      if (!boringHoverKeyRef.current && !sfHit && !smHit) {
        map.getCanvas().style.cursor = 'crosshair';
      }
      const faultTxt = sfHit
        ? `断層: ${sfHit.name}（クリックで想定地震）`
        : smHit
          ? `${smHit.kind === 'sea' ? '海溝型・海域' : '活断層'}: ${smHit.name}（想定地震なし）`
          : null;
      const withFault = (t: string | null): string | null => (t && faultTxt ? `${t} ｜ ${faultTxt}` : t ?? faultTxt);
      if (ov === 'faults') {
        setHover(faultTxt);
        return;
      }
      if (ov === 'boring') {
        // ヒートマップ自体に点の属性は無い。マーカー(オーバーレイ有効中は全ズームで可視)に
        // 乗っていればその調査名とデータソースを出す。
        const box: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 5, e.point.y - 5],
          [e.point.x + 5, e.point.y + 5],
        ];
        const layers = ['boring-pts'].filter((l) => map.getLayer(l));
        const fs = layers.length ? map.queryRenderedFeatures(box, { layers }) : [];
        if (fs.length) {
          const p = fs[0].properties as TileProps;
          setHover(withFault(`${p.title ?? '(調査名未取得)'}（${sourceLabel(p.source, p.source_name)}）`));
        } else {
          setHover(withFault(null));
        }
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
    map.on('mouseout', () => {
      setHover(null);
      applyScenarioHover(null);
      applySourceHover(null);
    });

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
    fitToPoint(map, c, r, shorePointRef.current, annotRef.current);
  }, [viewVersion]);

  // オーバーレイ選択が変わったら反映
  useEffect(() => {
    applyOverlay(overlay);
  }, [overlay, applyOverlay]);

  // 地点の注記トグルが変わったら反映
  useEffect(() => {
    applyAnnotations(annotations);
  }, [annotations, applyAnnotations]);

  // 左パネルで開いている震源・区間が変わったら、地図上の選択表示を合わせる
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setCodeFilter(map, ['sfault-sel-fill', 'sfault-sel'], selectedFaultCode ?? null);
    setGroupOutline(map, selectedFaultSrc ?? null, selectedFaultCode ?? null,
                    groupColor || GROUP_INK_DEFAULT);
  }, [selectedFaultSrc, selectedFaultCode, groupColor]);

  // 左パネルの一覧でカーソルを合わせた断層を強調する
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setCodeFilter(map, LIST_HOVER_LAYERS, hoverFaultCode ?? null);
  }, [hoverFaultCode]);

  // 近隣の震源の一覧でカーソル中の断層の計算対象範囲
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource('nearby-area') as maplibregl.GeoJSONSource | undefined)?.setData(areaFeature(hoverArea));
  }, [hoverArea]);

  // 近隣の震源の強調
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setNearFilter(map, nearbyCodes ?? []);
  }, [nearbyCodes]);

  // 左パネルで開いている震源モデルの強調
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setSrcFilter(map, SRCM_SEL_LAYERS, selectedSourceSrc ?? null);
  }, [selectedSourceSrc]);

  // 選択中のボーリング地点の青ハイライト(GeoJSON 更新)。タイル非依存なので、広域ズームで
  // タイル側の点が間引かれても消えない。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const p = selectedBoringPoint;
    const apply = () => {
      const src = map.getSource('boring-selected') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(
        p
          ? {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            }
          : EMPTY_FC
      );
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [selectedBoringPoint]);

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
              <div className="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: SFAULT_FILL, boxShadow: `inset 0 0 0 1px ${SFAULT_INK}` }} />
                想定地震のある活断層（クリックで地点の揺れ）
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: `${SRCM_FAULT_FILL}55`, boxShadow: `inset 0 0 0 1px ${SRCM_FAULT_INK}` }} />
                想定地震のない活断層
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                <span className="inline-block w-4 h-2.5 rounded-sm" style={{ border: `1.5px dashed ${SRCM_SEA_INK}` }} />
                海溝型・海域の地震の震源域（想定地震なし）
              </div>
              {annotations.nearbyFaults && (
                <div className="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                  <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: `${NEAR_INK}33`, boxShadow: `inset 0 0 0 1.5px ${NEAR_INK}` }} />
                  近隣の震源（この地点に波形がある想定地震）
                </div>
              )}
              <div className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                地点の揺れ（震度・波形）があるのは想定地震のある活断層だけ。ほかの震源の影響は左パネルの応答スペクトルに含まれます
              </div>
            </div>
          ) : overlay === 'boring' ? (
            <div className="mt-1 space-y-0.5">
              {BORING_LEGEND.map((b) => (
                <div key={b.label} className="flex items-center gap-1.5 text-[9px] text-gray-600 dark:text-gray-300">
                  <span
                    className="inline-block rounded-full shadow"
                    style={{
                      background: b.color,
                      width: b.ring ? 11 : 9,
                      height: b.ring ? 11 : 9,
                      border: `${b.ring ? 2 : 1}px solid #ffffff`,
                    }}
                  />
                  {b.label}
                </div>
              ))}
              <div className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                広域ではデータのある所を濃淡で表示。ズームインで個別地点（クリックで柱状図）
              </div>
            </div>
          ) : (
            <>
              <div className="h-2 w-full rounded mt-1" style={{ background: LEGEND[overlay].grad }} />
              <div className="flex justify-between text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">
                <span>{LEGEND[overlay].min}</span>
                <span>{LEGEND[overlay].max}</span>
              </div>
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

/** 地図で選ばれた断層(想定地震の断層コード)と、その震源。 */
export interface FaultPick {
  src: string;
  name: string;
  code: string;
}

/** カーソル位置の想定地震の断層(断層レイヤか近隣の震源の強調が可視のときだけ拾える)。 */
function scenarioFaultAt(
  map: maplibregl.Map,
  pt: maplibregl.Point
): { code: string; src: string; name: string } | null {
  // 近隣の震源の強調(NEAR_LAYERS)も拾う: 震源断層オーバーレイを出していなくても、
  // 注記で見えている近隣の断層は地図で選べるようにする(非表示レイヤは拾われない)
  const layers = [...SFAULT_LAYERS, ...NEAR_LAYERS].filter((l) => map.getLayer(l));
  if (!layers.length) return null;
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [pt.x - 4, pt.y - 4],
    [pt.x + 4, pt.y + 4],
  ];
  const f = map.queryRenderedFeatures(box, { layers })[0];
  if (!f) return null;
  const p = f.properties || {};
  return { code: String(p.code ?? ''), src: String(p.src ?? ''), name: String(p.name ?? '') };
}
/** カーソル位置の震源モデル(想定地震の無い震源。震源断層オーバーレイのときだけ拾える)。 */
function sourceModelAt(map: maplibregl.Map, pt: maplibregl.Point): SourcePick | null {
  const layers = SRCM_LAYERS.filter((l) => map.getLayer(l));
  if (!layers.length) return null;
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [pt.x - 4, pt.y - 4],
    [pt.x + 4, pt.y + 4],
  ];
  const fs = map.queryRenderedFeatures(box, { layers });
  // 活断層を海溝型の輪郭より優先する(海溝型の輪郭は広く、陸の断層と重なりやすい)
  const f = fs.find((x) => x.properties?.kind === 'fault') ?? fs[0];
  if (!f) return null;
  const p = f.properties || {};
  return {
    src: String(p.src ?? ''),
    name: String(p.name ?? ''),
    kind: p.kind === 'sea' ? 'sea' : 'fault',
  };
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

// 検索・初期表示のときの表示範囲合わせ。海率円が非表示なら円に合わせない
// （見えていないものに合わせると「何も無いのに引きの画」になるため）。測線が見えていれば
// 地点＋最寄り点、どちらも非表示なら地点中心の既定ズームにする。
function fitToPoint(
  map: maplibregl.Map,
  center: LatLng,
  radiusKm: number,
  shorePoint: LatLng | null,
  a: MapAnnotations
) {
  const b = new maplibregl.LngLatBounds();
  if (a.seaCircle) {
    for (const c of circleCoords(center.lat, center.lng, radiusKm)) b.extend(c as [number, number]);
    map.fitBounds(b, { padding: 40, animate: false, maxZoom: 14 });
    return;
  }
  if (a.shoreLine && shorePoint) {
    b.extend([center.lng, center.lat]);
    b.extend([shorePoint.lng, shorePoint.lat]);
    map.fitBounds(b, { padding: 60, animate: false, maxZoom: 14 });
    return;
  }
  map.jumpTo({ center: [center.lng, center.lat], zoom: POINT_ZOOM });
}

export default HazardMap;
