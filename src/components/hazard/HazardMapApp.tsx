import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Search, MapPin, TriangleAlert, Snowflake, Wind, Activity, Building2, EyeOff, ExternalLink, Printer, Loader2, CircleDashed, Ruler, Zap, Database } from 'lucide-react';
import HazardMap from './HazardMap';
import type { ZoneOverlay, HazardMapHandle, MapAnnotations } from './HazardMap';
import { ampAtLngLat, vs400DepthAtLngLat } from './valueRaster';
import { fetchDesign, fetchElevation, geocode, reverseGeocode, snowDepthCm } from './api';
import { roughnessCases } from './roughness';
import InfoTip from './InfoTip';
import type { DesignResult, Authority, AuthorityType } from './api';
import type { HazardReportData } from './report/types';
import SeismicHazardPanel from './SeismicHazardPanel';
import type { ContribStatus } from './SeismicHazardPanel';
// ボーリング調査データ(Boring Data タブと共有)。マーカークリック時に左パネルへ柱状図を出す。
import BoringLogViewer from '../boring/BoringLogViewer';
import ResultsList from '../boring/ResultsList';
import { fetchAndParseBoringData } from '../boring/api';
import type { MLITSearchResult, BoringData } from '../boring/types';
import { fetchSpectrum, fetchContrib, assignSourceSlots, highlightsFromSlots } from './jshisApi';
import type { SpectrumResult, ContribResult, ContribSource, ProbKey, PeriodKey } from './jshisApi';

// 特定行政庁の区分(type)の日本語ラベル。
const AUTHORITY_TYPE_LABEL: Record<AuthorityType, string> = {
  prefecture: '都道府県知事',
  city_full: '建築主事設置市',
  city_limited: '限定特定行政庁',
  special_ward: '特別区',
};

// 地図上のオーバーレイ切替アイコン。カテゴリごとに1つのアイコンを持ち、同じアイコンを
// 押すたびに category 内の variant をループで巡回する（例: 積雪アイコン → 積雪深 →
// 積雪地域区分 → 積雪深 …）。「オフ」だけは独立したボタンとして常に残す。
type OverlayVariant = Exclude<ZoneOverlay, 'none'>;
interface OverlayCategory {
  key: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string; // カテゴリ名（単一 variant のときの既定表示）
  variants: { val: OverlayVariant; label: string }[];
}
const OVERLAY_CATEGORIES: OverlayCategory[] = [
  { key: 'wind', Icon: Wind, label: '風速区分', variants: [{ val: 'wind', label: '風速区分' }] },
  {
    key: 'seismic',
    Icon: Activity,
    label: '地震',
    // 押すたびに 地域係数(告示) → 地盤増幅率(J-SHIS) → Vs350層深さ(J-SHIS) → 震源断層(J-SHIS)
    // をループ切替。いずれも震源断層と影響度上位のハイライトを重ねる。
    variants: [
      { val: 'seismic', label: '地震地域係数' },
      { val: 'amp', label: '地盤増幅率' },
      { val: 'vs350', label: '工学的基盤深さ' },
      { val: 'faults', label: '震源断層' },
    ],
  },
  {
    key: 'snow',
    Icon: Snowflake,
    label: '積雪',
    // 押すたびに 積雪深(連続ラスター) ↔ 積雪地域区分(告示の区分ポリゴン) をループ切替。
    variants: [
      { val: 'depth', label: '積雪深マップ' },
      { val: 'snow_zones', label: '積雪地域区分' },
    ],
  },
  {
    key: 'urban',
    Icon: Building2,
    label: '都市計画区域',
    // 押すたびに 都市計画区域(外形) ↔ 特定行政庁(建築基準法の所管庁分布) をループ切替。
    variants: [
      { val: 'urban', label: '都市計画区域' },
      { val: 'authority', label: '特定行政庁' },
    ],
  },
  {
    key: 'boring',
    Icon: Database,
    label: 'ボーリング調査データ',
    // boring タブと同じ表示(広域=密度ヒートマップ、ズームイン=個別マーカー)。
    // オーバーレイを使わずマーカーだけ出したいときは下の注記トグル(boringPts)。
    variants: [{ val: 'boring', label: 'ボーリング調査データ' }],
  },
];

// 地点の注記(海率円/海岸線測線/震源ハイライト)の表示トグル。面のオーバーレイと違って
// 排他ではなく個別に ON/OFF する。表示が重なって煩わしいときに個別に消せるようにするため。
const ANNOT_TOGGLES: {
  key: keyof MapAnnotations;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}[] = [
  { key: 'seaCircle', Icon: CircleDashed, label: '海率円', hint: '海率を算定する半径の円（積雪荷重）' },
  { key: 'shoreLine', Icon: Ruler, label: '海岸線測線', hint: '最寄りの海岸線・湖岸線までの測線（風荷重）' },
  { key: 'faultHl', Icon: Zap, label: '震源', hint: 'この地点への影響度が大きい震源のハイライト' },
  { key: 'boringPts', Icon: MapPin, label: 'ボーリング地点', hint: 'ボーリング調査地点のマーカー（ズームインで表示。クリックで柱状図）' },
];

const ANNOT_STORAGE_KEY = 'hazard.annotations';
// 既定は海率円だけ。複数を同時に描くと地図が混むので、残りは必要なときに出してもらう。
const ANNOT_DEFAULT: MapAnnotations = { seaCircle: true, shoreLine: false, faultHl: false, boringPts: false };

// 前回セッションの表示状態を復元。未保存・壊れていれば既定値。
function loadAnnotations(): MapAnnotations {
  try {
    const raw = localStorage.getItem(ANNOT_STORAGE_KEY);
    if (!raw) return ANNOT_DEFAULT;
    const j = JSON.parse(raw) as Partial<Record<keyof MapAnnotations, unknown>>;
    const pick = (v: unknown, key: keyof MapAnnotations) =>
      typeof v === 'boolean' ? v : ANNOT_DEFAULT[key];
    return {
      seaCircle: pick(j.seaCircle, 'seaCircle'),
      shoreLine: pick(j.shoreLine, 'shoreLine'),
      faultHl: pick(j.faultHl, 'faultHl'),
      boringPts: pick(j.boringPts, 'boringPts'),
    };
  } catch {
    return ANNOT_DEFAULT;
  }
}

interface HazardMapAppProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

// デフォルトは東京駅
const DEFAULT_POINT = { lat: 35.681236, lng: 139.767125 };

interface LatLng {
  lat: number;
  lng: number;
}

const HazardMapApp: React.FC<HazardMapAppProps> = ({ onSuccess, onError }) => {
  // 選択中の地点は内部状態として保持（緯度経度の入力欄は持たない）。
  const [point, setPoint] = useState<LatLng>(DEFAULT_POINT);
  // 検索ボックス：住所・地名、または「緯度,経度」を受け付ける。
  const [query, setQuery] = useState('');
  // 加算されると地図が円全体に表示範囲を合わせる（検索時のみ。クリックでは加算しない）
  const [viewVersion, setViewVersion] = useState(0);
  // 地図に薄く重ねる地域区分（なし / 積雪 / 風速）
  const [overlay, setOverlay] = useState<ZoneOverlay>('none');
  // 地点の注記の表示状態（オーバーレイとは独立。localStorage に保存）
  const [annotations, setAnnotations] = useState<MapAnnotations>(loadAnnotations);
  useEffect(() => {
    try {
      localStorage.setItem(ANNOT_STORAGE_KEY, JSON.stringify(annotations));
    } catch {
      /* プライベートモード等で保存できなくても動作には影響しない */
    }
  }, [annotations]);
  const toggleAnnotation = useCallback((key: keyof MapAnnotations) => {
    setAnnotations((a) => ({ ...a, [key]: !a[key] }));
  }, []);

  const [design, setDesign] = useState<DesignResult | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  // PDFレポート出力中フラグ（ボタンの多重実行防止 + スピナー表示）
  const [exporting, setExporting] = useState(false);
  // 地図のキャプチャ用ハンドル（レポート出力時にだけ使う）
  const mapRef = useRef<HazardMapHandle>(null);
  // 選択地点の住所（リバースジオコーディング）
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);

  // ---- ボーリング調査データ(マーカークリックで左パネルに柱状図を表示) ----
  // 選択してもハザードの選択地点(point)は動かさない(近隣の調査地点を巡回して見られるように)。
  // 任意地点のクリックや検索での移動時に選択を解除し、左パネルをハザード情報へ戻す。
  const [selectedBoring, setSelectedBoring] = useState<MLITSearchResult | null>(null);
  const [boringData, setBoringData] = useState<BoringData | null>(null);
  const [boringLoading, setBoringLoading] = useState(false);
  // クリック周辺の地点群(重なった地点の切替リスト用)
  const [boringNearby, setBoringNearby] = useState<MLITSearchResult[]>([]);
  const boringReq = useRef(0);

  const clearBoring = useCallback(() => {
    boringReq.current++; // 取得途中の応答は破棄
    setSelectedBoring(null);
    setBoringData(null);
    setBoringNearby([]);
    setBoringLoading(false);
  }, []);

  // 地点選択 → 詳細(柱状図XML)取得。BoringDataApp.handleResultSelect と同じ流儀＋古い応答の破棄。
  const selectBoring = useCallback(
    async (result: MLITSearchResult) => {
      const id = ++boringReq.current;
      setSelectedBoring(result);
      setBoringData(null);
      setBoringLoading(true);
      try {
        const xmlUrl = result.metadata?.['NGI:link_boring_xml'];
        const pdfUrl = result.metadata?.['NGI:link_boring_pdf'];
        if (xmlUrl && result.location) {
          try {
            const data = await fetchAndParseBoringData(xmlUrl, result.id, result.location);
            if (id === boringReq.current) setBoringData(data);
          } catch (e) {
            if (id !== boringReq.current) return;
            console.error('Failed to fetch boring data:', e);
            // 公開元にデータが無い場合など、中継プロキシが返した理由をそのまま見せる。
            onError?.(e instanceof Error && e.message ? e.message : 'ボーリングデータの取得に失敗しました');
            setBoringData(null);
          }
        } else if (pdfUrl) {
          // PDF柱状図のみの地点(港湾など)。ビューアの「PDF柱状図を表示」ボタンを案内する。
          if (id === boringReq.current) setBoringData(null);
        } else {
          if (id !== boringReq.current) return;
          onError?.('この地点の柱状図データが見つかりませんでした');
          setBoringData(null);
        }
      } finally {
        if (id === boringReq.current) setBoringLoading(false);
      }
    },
    [onError]
  );

  // 地図のマーカークリック(HazardMap から primary + 周辺の地点群が渡ってくる)
  const handleBoringPick = useCallback(
    (primary: MLITSearchResult, nearby: MLITSearchResult[]) => {
      setBoringNearby(nearby);
      void selectBoring(primary);
    },
    [selectBoring]
  );

  // 選択地点の J-SHIS 地盤値（地盤増幅率・Vs400m/s層上面深さ）。値ラスターPMTilesから
  // 直接読む(APIを介さない)。null=読込中または海などのデータなし。
  const [jshis, setJshis] = useState<{ amp: number | null; depth: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setJshis(null);
    Promise.all([
      ampAtLngLat(point.lng, point.lat),
      vs400DepthAtLngLat(point.lng, point.lat),
    ])
      .then(([amp, depth]) => {
        if (!cancelled) setJshis({ amp, depth });
      })
      .catch(() => {
        if (!cancelled) setJshis({ amp: null, depth: null });
      });
    return () => {
      cancelled = true;
    };
  }, [point.lat, point.lng]);

  // ---- J-SHIS 地震動ハザード(応答スペクトル・震源別影響度) ----
  const [spectrum, setSpectrum] = useState<SpectrumResult | null>(null);
  const [spectrumLoading, setSpectrumLoading] = useState(false);
  const [contrib, setContrib] = useState<ContribResult | null>(null);
  const [contribStatus, setContribStatus] = useState<ContribStatus>({ state: 'idle', elapsedS: null });
  const [contribRetry, setContribRetry] = useState(0);
  const [jshisProb, setJshisProb] = useState<ProbKey>('0.10');
  const [jshisPeriod, setJshisPeriod] = useState<PeriodKey>('0.20');
  const [focusBbox, setFocusBbox] = useState<{ bbox: [number, number, number, number]; v: number } | null>(null);

  // 応答スペクトル(ローカルデータ・即時)
  useEffect(() => {
    const ac = new AbortController();
    setSpectrumLoading(true);
    fetchSpectrum(point.lat, point.lng, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setSpectrum(r);
      })
      .catch(() => {
        if (!ac.signal.aborted) setSpectrum(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setSpectrumLoading(false);
      });
    return () => ac.abort();
  }, [point.lat, point.lng]);

  // 震源別影響度(J-SHIS CGI。初回は 1〜2 分)。連打を避けるため少し待ってから開始し、
  // 202 pending の間はポーリング。地点が変わったら中断(サーバ側の取得は継続しキャッシュされる)。
  useEffect(() => {
    const ac = new AbortController();
    setContrib(null);
    setContribStatus({ state: 'loading', elapsedS: null });
    const t = setTimeout(() => {
      fetchContrib(point.lat, point.lng, {
        signal: ac.signal,
        onPending: (p) => {
          if (!ac.signal.aborted) setContribStatus({ state: 'loading', elapsedS: p.elapsedS });
        },
        // 取得待ちの間は近傍メッシュ(10km以内)の暫定値を先に見せる。status は loading のままで、
        // 本来の値が届いたら差し替わる。
        onProvisional: (r) => {
          if (!ac.signal.aborted) setContrib(r);
        },
      })
        .then((r) => {
          if (ac.signal.aborted) return;
          setContrib(r);
          setContribStatus({ state: 'ready', elapsedS: null });
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          const msg = e instanceof Error ? (e.message === 'timeout' ? '時間切れ' : e.message) : '不明なエラー';
          setContribStatus({ state: 'error', elapsedS: null, message: msg });
        });
    }, 700);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [point.lat, point.lng, contribRetry]);

  // 系列色の割当(順位順固定)と地図ハイライト
  const sourceSlots = useMemo(() => (contrib ? assignSourceSlots(contrib) : []), [contrib]);
  const faultHighlights = useMemo(() => highlightsFromSlots(sourceSlots), [sourceSlots]);
  // 凡例の行クリック: その震源が収まるよう地図を寄せる(オーバーレイは変えない)。
  // 震源ハイライトを消していた場合は「見たい」という意思表示なので自動で戻す。
  const handleFocusSource = useCallback((s: ContribSource) => {
    if (!s.bbox) return;
    setAnnotations((a) => (a.faultHl ? a : { ...a, faultHl: true }));
    setFocusBbox((prev) => ({ bbox: s.bbox!, v: (prev?.v ?? 0) + 1 }));
  }, []);

  // 地点が変わったら住所を取得（デバウンス。Nominatim への過負荷を避ける）
  useEffect(() => {
    let cancelled = false;
    setPlaceName(null);
    setPlaceLoading(true);
    const t = setTimeout(async () => {
      const name = await reverseGeocode(point.lat, point.lng);
      if (!cancelled) {
        setPlaceName(name);
        setPlaceLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [point.lat, point.lng]);

  // 地点が変わるたびに設計パラメータ＋標高を取得（半径は常にAPI自動: 積雪R→40km）
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    Promise.all([fetchDesign(point.lat, point.lng), fetchElevation(point.lat, point.lng)])
      .then(([d, e]) => {
        if (id !== reqId.current) return; // 古い応答は破棄
        setDesign(d);
        setElevation(e);
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setDesign(null);
        onError?.('設計パラメータの取得に失敗しました');
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [point.lat, point.lng, onError]);

  const handleMapPick = useCallback(
    (lat: number, lng: number) => {
      clearBoring(); // 任意地点の指定 → 左パネルはその地点のハザード情報に戻す
      setPoint({ lat, lng });
    },
    [clearBoring]
  );

  // カテゴリのアイコンを押したときの切替。未選択なら先頭 variant、選択中なら次の
  // variant をループで巡回する（末尾でオフにはしない）。オフは別ボタンが担当。
  const cycleCategory = useCallback((cat: OverlayCategory) => {
    setOverlay((cur) => {
      const idx = cat.variants.findIndex((v) => v.val === cur);
      const next = idx === -1 ? 0 : (idx + 1) % cat.variants.length;
      return cat.variants[next].val;
    });
  }, []);

  // 検索：カンマ区切りの「緯度,経度」ならそこへ移動、そうでなければ住所・地名でジオコーディング。
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      // 半角/全角カンマ区切りの数値2つ＝緯度,経度
      const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          clearBoring();
          setPoint({ lat, lng });
          setViewVersion((v) => v + 1);
          onSuccess?.(`緯度 ${lat}, 経度 ${lng} に移動しました`);
        } else {
          onError?.('緯度は±90、経度は±180の範囲で入力してください');
        }
        return;
      }
      // それ以外は住所・地名としてジオコーディング
      try {
        const r = await geocode(q);
        if (r) {
          clearBoring();
          setPoint(r);
          setViewVersion((v) => v + 1);
          onSuccess?.(`「${q}」に移動しました`);
        } else {
          onError?.('住所が見つかりませんでした');
        }
      } catch {
        onError?.('住所検索に失敗しました');
      }
    },
    [query, onSuccess, onError, clearBoring]
  );

  const radiusKm = design?.radius_km ?? 40;
  const snow = design?.snow ?? null;
  const wind = design?.wind ?? null;
  const seismic = design?.seismic ?? null;
  const shore = design?.shore ?? null;
  const urbanInside = design?.urban ? design.urban.inside : null;
  // 地表面粗度区分(平12建告1454号)。Ⅰ/Ⅳは特定行政庁の指定なので、ここで出せるのはⅡかⅢか。
  const roughness = useMemo(
    () =>
      roughnessCases({
        urbanInside,
        shoreM: shore?.nearest_m ?? null,
        shoreKind: shore?.nearest_kind ?? null,
      }),
    [urbanInside, shore]
  );
  const seaRatio = design?.sea_ratio ?? null;
  const landRatio = design?.land_ratio ?? null;
  const building = design?.building_authority ?? null;

  // 標高が取れる＝陸とみなす。区域ポリゴン外(海岸線変化の埋立地等)でも、陸なら
  // 最寄り区分(nearest)を採用して計算する。陸と判定できなければ採用しない＝海上扱い。
  const onLand = elevation != null;
  const snowUsable = !!snow && (!snow.nearest || onLand);
  const windUsable = !!wind && (!wind.nearest || onLand);
  const seismicUsable = !!seismic && (!seismic.nearest || onLand);
  // 積雪深 d=(α·H+β·rs+γ)×100。第0区(no_snow, 係数0)なら 0 になる。
  const depth =
    snowUsable && snow && elevation != null && seaRatio != null
      ? snowDepthCm(snow, elevation, seaRatio)
      : null;

  // PDFレポート出力。レポート描画モジュールは押下時に動的 import し（初期表示に乗せない）、
  // 地図キャプチャと並行させる。クリック時点の state をスナップショットとして渡し、
  // ブラウザの「印刷 → PDFに保存」で出力する（フォントはユーザーのローカル書体を使用）。
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [{ printHazardReport }, mapImage] = await Promise.all([
        import('./report/print'),
        mapRef.current?.capturePng() ?? Promise.resolve(null),
      ]);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const generatedAt =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const data: HazardReportData = {
        generatedAt,
        point,
        placeName,
        elevation,
        seaRatio,
        landRatio,
        radiusKm,
        snow: snow
          ? {
              usable: snowUsable,
              noSnow: !!snow.no_snow,
              zone: snow.zone,
              alpha: snow.alpha,
              beta: snow.beta,
              gamma: snow.gamma,
              R: snow.R,
              depthCm: depth,
            }
          : null,
        wind: wind ? { usable: windUsable, zone: wind.zone, Vo: wind.Vo } : null,
        shore: shore ? { nearestM: shore.nearest_m, nearestKind: shore.nearest_kind } : null,
        roughness: {
          available: roughness.available,
          bands: roughness.bands,
          basis: roughness.basis,
          urbanInside,
        },
        seismic: seismic
          ? {
              usable: seismicUsable,
              zone: seismic.zone,
              Z: seismic.Z,
              amp: jshis?.amp ?? null,
              vs400DepthM: jshis?.depth ?? null,
            }
          : null,
        mapImage,
      };

      await printHazardReport(data);
      onSuccess?.('印刷ダイアログを開きました（送信先で「PDFに保存」を選択してください）');
    } catch {
      onError?.('PDFレポートの生成に失敗しました');
    } finally {
      setExporting(false);
    }
  }, [
    exporting,
    point,
    placeName,
    elevation,
    seaRatio,
    landRatio,
    radiusKm,
    snow,
    wind,
    shore,
    roughness,
    urbanInside,
    seismic,
    snowUsable,
    windUsable,
    seismicUsable,
    depth,
    jshis,
    onSuccess,
    onError,
  ]);

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TriangleAlert className="w-5 h-5 text-amber-500" />
              Hazard Map
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              地図をクリック、または検索ボックスに住所・地名か「緯度,経度」を入力すると、その地点の海率・標高と、建築基準法告示の積雪荷重係数・基準風速・地震地域係数・積雪深、所管する特定行政庁、J-SHISの応答スペクトルと震源別影響度を表示します。ボーリング調査地点のマーカー（地図左のトグルで表示）をクリックすると柱状図に切り替わります。
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            title="表示中の地点の設計用荷重レポートを印刷（プリンタまたはPDFに保存）します"
            aria-label="レポートを印刷"
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:min-h-0">
          {/* 左: 入力 + 結果 */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto lg:min-h-0 slim-scrollbar">
            {/* 検索（住所・地名 または 緯度,経度） */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="住所・地名 または 緯度,経度（例: 35.681,139.767）"
                  className={inputCls + ' pl-10'}
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors inline-flex items-center gap-1"
              >
                <Search className="w-4 h-4" />
                検索
              </button>
            </form>

            {selectedBoring ? (
              <>
                {/* ボーリング調査地点を選択中: 近接データの切替リスト(コンパクト表示)を上、
                    柱状図ビューアを下に。閉じる(×)・任意地点のクリック・検索での移動で
                    ハザード情報へ戻る。 */}
                {boringNearby.length > 1 && (
                  <ResultsList
                    compact
                    results={boringNearby}
                    selectedResult={selectedBoring}
                    searchStatus="success"
                    onResultSelect={selectBoring}
                  />
                )}
                <BoringLogViewer
                  data={boringData}
                  selectedResult={selectedBoring}
                  loading={boringLoading}
                  onClose={clearBoring}
                />
              </>
            ) : (
              <>
            {/* 選択地点（緯度経度・住所） */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">緯度</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {point.lat.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">経度</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {point.lng.toFixed(3)}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">所在地</div>
                <div className="text-sm text-gray-800 dark:text-gray-200">
                  {placeLoading ? '取得中…' : placeName ?? '取得できませんでした（海上など）'}
                </div>
              </div>
            </div>

            {/* 結果 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
              {loading && <p className="text-sm text-gray-400">計算中…</p>}

              {/* 標高・海率・陸率 */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="標高" value={elevation != null ? `${elevation.toFixed(1)} m` : '—'} />
                <Metric label="海率" value={seaRatio != null ? `${(seaRatio * 100).toFixed(1)} %` : '—'} />
                <Metric label="陸率" value={landRatio != null ? `${(landRatio * 100).toFixed(1)} %` : '—'} />
              </div>
              <p className="text-xs text-gray-400 text-center">
                海率は半径 {radiusKm} km の円内の海面積の割合
              </p>

              {/* 積雪荷重 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  設計用積雪量（平12建告1455号）
                </h3>
                {!snowUsable ? (
                  <p className="text-sm text-gray-400">
                    海上または区域外です（標高が取得できず陸と判定されませんでした）
                  </p>
                ) : snow && snow.no_snow ? (
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      積雪荷重の対象区域外（第0区・積雪なし）
                    </p>
                    <div className="mt-2">
                      <Metric label="積雪深 d" value="0 cm" />
                    </div>
                  </div>
                ) : snow ? (
                  <>
                    <table className="w-full text-sm">
                      <tbody>
                        <Row k="地域区分" v={`第${snow.zone}区`} />
                        <Row k="α (標高係数)" v={String(snow.alpha)} />
                        <Row k="β (海率係数)" v={String(snow.beta)} />
                        <Row k="γ (定数項)" v={String(snow.gamma)} />
                        <Row k="R (海率計算半径)" v={`${snow.R} km`} />
                      </tbody>
                    </table>
                    {depth != null ? (
                      <div className="mt-2">
                        <Metric label="積雪深 d" value={`${depth.toFixed(0)} cm`} />
                        <p className="text-xs text-gray-400 mt-1">
                          d = ({snow.alpha} × {elevation?.toFixed(1)} + {snow.beta} ×{' '}
                          {seaRatio?.toFixed(3)} + {snow.gamma}) × 100
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">標高が取得できると積雪深を計算します</p>
                    )}
                  </>
                ) : null}
              </div>

              {/* 基準風速 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  設計基準風速（平12建告1454号）
                </h3>
                {windUsable && wind ? (
                  <>
                    <table className="w-full text-sm">
                      <tbody>
                        <Row k="地域区分" v={`第${wind.zone}区`} />
                      </tbody>
                    </table>
                    <div className="mt-2">
                      <Metric label="基準風速 Vo" value={`${wind.Vo} m/s`} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    海上または区域外です（陸と判定されませんでした）
                  </p>
                )}
              </div>

              {/* 地表面粗度区分（風荷重設計の一部なので風速の直下に）。判定材料の距離・区域も併記する */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-1">
                  地表面粗度区分（平12建告1454号）
                  <InfoTip>
                    区分Ⅰ（都市計画区域外の極めて平坦な区域）・区分Ⅳ（都市化が極めて著しい区域）は特定行政庁が規則で定めるため判定していません。指定がある場合はそちらが優先します。都市計画区域の内外は区域の外形による判定なので、境界付近は要確認です。
                  </InfoTip>
                </h3>
                {shore && shore.nearest_m != null ? (
                  <>
                    {roughness.available ? (
                      <>
                        {/* Ⅱは建築物の高さで分かれるので、高さ帯ごとに併記する */}
                        <ul className="space-y-1">
                          {roughness.bands.map((b) => (
                            <li
                              key={b.height ?? 'all'}
                              className={`flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-1.5 ${
                                b.height ? 'justify-between' : 'justify-center'
                              }`}
                            >
                              {b.height && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  建築物の高さ {b.height}
                                </span>
                              )}
                              <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                                区分 {b.category}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-[11px] text-gray-400 mt-1">判定根拠: {roughness.basis.join(' ・ ')}</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">
                        {roughness.reason ?? '判定できませんでした'}
                        {urbanInside == null ? '' : urbanInside ? '（都市計画区域内）' : '（都市計画区域外）'}
                      </p>
                    )}
                    {/* 判定の元になる距離。地図には測線を表示している */}
                    <div className="mt-2">
                      <Metric
                        label={`最寄りの${shore.nearest_kind === 'lake' ? '湖岸線' : '海岸線'}まで`}
                        value={fmtDist(shore.nearest_m)}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">取得できませんでした</p>
                )}
              </div>

              {/* 地震地域係数 + J-SHIS地盤値 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  地震地域係数（昭55建告1793号）
                </h3>
                {seismicUsable && seismic ? (
                  <>
                    <table className="w-full text-sm">
                      <tbody>
                        <Row k="地域区分" v={`第${seismic.zone}区`} />
                      </tbody>
                    </table>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <Metric label="地震地域係数 Z" value={`${seismic.Z}`} />
                      <Metric
                        label="地盤増幅率"
                        value={jshis?.amp != null ? jshis.amp.toFixed(2) : '—'}
                      />
                      <Metric
                        label="工学的基盤深さ"
                        value={jshis?.depth != null ? `${Math.round(jshis.depth)} m` : '—'}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      地盤増幅率(工学的基盤Vs400m/sから地表)と工学的基盤(Vs400m/s)深さは
                      J-SHIS（表層地盤・深部地盤）による参考値。
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    海上または区域外です（陸と判定されませんでした）
                  </p>
                )}
              </div>

              {/* J-SHIS 地震動ハザード: 応答スペクトル + 震源別影響度(地図の断層ハイライトと連動) */}
              <SeismicHazardPanel
                spectrum={spectrum}
                spectrumLoading={spectrumLoading}
                contrib={contrib}
                contribStatus={contribStatus}
                onRetryContrib={() => setContribRetry((v) => v + 1)}
                slots={sourceSlots}
                prob={jshisProb}
                period={jshisPeriod}
                onProbChange={setJshisProb}
                onPeriodChange={setJshisPeriod}
                onFocusSource={handleFocusSource}
              />

              {/* 特定行政庁（建築基準法） */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  特定行政庁（建築基準法）
                </h3>
                {building && (building.all || building.small) ? (
                  <div className="space-y-2">
                    {building.split ? (
                      <>
                        <AuthorityCard scaleLabel="小規模" sub="法6条1項一〜三号以外の規模" au={building.small} />
                        <AuthorityCard scaleLabel="大規模" sub="法6条1項一〜三号の規模" au={building.large} />
                        <p className="text-[11px] text-gray-400">
                          建築物の規模で所管が分かれる地点です（限定特定行政庁・特別区）。規模の境界は施行令148条/149条の現行条文によります。
                        </p>
                      </>
                    ) : (
                      <AuthorityCard au={building.all} />
                    )}
                    {building.nearest ? (
                      <p className="text-[11px] text-amber-600 dark:text-amber-500">
                        区域外のため最寄りの庁を表示（約{building.nearest_km?.toFixed(1)}km）。
                      </p>
                    ) : null}
                    <p className="text-[11px] text-gray-400">
                      庁区分: 令和7年4月1日現在（全国建築審査会協議会）。URLは参考値のため最終確認は各庁の窓口で。
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">取得できませんでした（海上など）</p>
                )}
              </div>
            </div>
              </>
            )}
          </div>

          {/* 右: 地図 + オーバーレイ切替アイコン */}
          <div className="lg:col-span-2 h-[400px] lg:h-full lg:min-h-0 relative">
            <HazardMap
              ref={mapRef}
              center={point}
              radiusKm={radiusKm}
              viewVersion={viewVersion}
              overlay={overlay}
              shorePoint={
                shore && shore.nearest_lat != null && shore.nearest_lng != null
                  ? { lat: shore.nearest_lat, lng: shore.nearest_lng }
                  : null
              }
              annotations={annotations}
              onPick={handleMapPick}
              onBoringPick={handleBoringPick}
              selectedBoringPoint={selectedBoring?.location ?? null}
              faultHighlights={faultHighlights}
              focusBbox={focusBbox}
            />
            <div className="absolute top-3 left-3 z-[2] flex flex-col gap-1 bg-white/85 dark:bg-gray-800/85 rounded-lg shadow p-1 backdrop-blur-sm">
              {/* オフは独立したボタン（カテゴリのループには含めない） */}
              <button
                type="button"
                title="オフ"
                aria-label="オフ"
                onClick={() => setOverlay('none')}
                className={`inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
                  overlay === 'none'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <EyeOff className="w-5 h-5" />
              </button>
              {OVERLAY_CATEGORIES.map((cat) => {
                const activeIdx = cat.variants.findIndex((v) => v.val === overlay);
                const active = activeIdx !== -1;
                const multi = cat.variants.length > 1;
                const curLabel = active ? cat.variants[activeIdx].label : cat.label;
                const title = multi
                  ? `${curLabel}（クリックで切替: ${cat.variants.map((v) => v.label).join(' / ')}）`
                  : cat.label;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    title={title}
                    aria-label={curLabel}
                    onClick={() => cycleCategory(cat)}
                    className={`inline-flex flex-col items-center justify-center gap-0.5 w-9 h-9 rounded-md transition-colors ${
                      active
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <cat.Icon className="w-5 h-5" />
                    {/* 複数 variant のカテゴリは現在位置をドットで示し「押すと切替わる」ことを伝える */}
                    {multi && (
                      <span className="flex gap-0.5">
                        {cat.variants.map((v, i) => (
                          <span
                            key={v.val}
                            className={`block w-1 h-1 rounded-full ${
                              active && i === activeIdx
                                ? 'bg-white'
                                : active
                                  ? 'bg-white/40'
                                  : 'bg-gray-400/60'
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
              {/* 区切り線から下は「地点の注記」。上のオーバーレイ(排他選択)と違い個別に ON/OFF する。
                  区別が付くよう、選択中は塗りつぶしではなくリング表示にしている。 */}
              <div className="my-0.5 mx-1 border-t border-gray-300 dark:border-gray-600" />
              {ANNOT_TOGGLES.map(({ key, Icon, label, hint }) => {
                const on = annotations[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={`${label}: ${on ? '表示中' : '非表示'}（${hint}）`}
                    aria-label={label}
                    aria-pressed={on}
                    onClick={() => toggleAnnotation(key)}
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
                      on
                        ? 'text-blue-600 dark:text-blue-300 ring-2 ring-inset ring-blue-500 dark:ring-blue-400'
                        : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* フッター: データ出典 */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 px-4 py-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed">
          データ出典:
          <a
            href="https://nlftp.mlit.go.jp/ksj/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline ml-1"
          >
            国土数値情報
          </a>
          <span className="ml-1">（都市地域 A09・行政区域 N03・湖沼 W09／国土交通省・CC BY 4.0）</span>
          {' / '}
          <a
            href="https://maps.gsi.go.jp/development/ichiran.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            国土地理院
          </a>
          <span className="ml-1">（標高・背景地図）</span>
          {' / '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            OpenStreetMap
          </a>
          <span className="ml-1">（住所検索 Nominatim・ODbL）</span>
          {' / '}
          <a
            href="https://www.j-shis.bosai.go.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            地震ハザードステーション
          </a>
          <span className="ml-1">（表層地盤・深部地盤・応答スペクトルに関する地震動予測地図2020年版・震源断層2024年版／防災科研 J-SHIS）</span>
          {' / '}
          <a
            href="https://www.kunijiban.pwri.go.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            国土地盤情報検索サイト (KuniJiban)
          </a>
          {' / '}
          <a
            href="https://ngic.or.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            国土地盤情報センター (NGIC)
          </a>
          {' / '}
          <a
            href="https://www.kensetsu.metro.tokyo.lg.jp/jimusho/tech/geo-web"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            東京の地盤(GIS版)
          </a>
          <span className="ml-1">（ボーリング柱状図／東京都建設局 CC BY 2.1 JP）</span>
        </p>
      </div>
    </div>
  );
};

// 距離[m] を見やすく整形（1km未満は m、以上は km）。null は「—」。
function fmtDist(m: number | null | undefined): string {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg py-2">
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</div>
  </div>
);

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <tr className="border-b border-gray-100 dark:border-gray-700 last:border-0">
    <td className="py-1 text-gray-500 dark:text-gray-400">{k}</td>
    <td className="py-1 text-right font-medium text-gray-900 dark:text-gray-100">{v}</td>
  </tr>
);

// 1つの特定行政庁を、庁名・区分・公式URLリンクで表示する。規模分割地点では小規模/大規模の
// それぞれに scaleLabel（小規模/大規模）を付けて2枚並べる。
const AuthorityCard: React.FC<{ au?: Authority; scaleLabel?: string; sub?: string }> = ({
  au,
  scaleLabel,
  sub,
}) => {
  if (!au) return null;
  return (
    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          {scaleLabel ? (
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mr-1">
              {scaleLabel}
            </span>
          ) : null}
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{au.name}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
            {AUTHORITY_TYPE_LABEL[au.type] ?? au.type}
          </span>
        </div>
        {au.url ? (
          <a
            href={au.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-0.5 text-xs text-blue-500 hover:underline"
            title={au.url}
          >
            公式ページ
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>
      <div className="text-[11px] text-gray-400 mt-0.5">
        {au.legal_basis}
        {sub ? ` ・ ${sub}` : ''}
      </div>
    </div>
  );
};

export default HazardMapApp;
