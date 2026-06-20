import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, MapPin, TriangleAlert, Snowflake, Wind, Activity, EyeOff } from 'lucide-react';
import SeaRatioMap from './SeaRatioMap';
import type { ZoneOverlay } from './SeaRatioMap';
import { fetchDesign, fetchElevation, geocode, reverseGeocode, snowDepthCm } from './api';
import type { DesignResult } from './api';

// 地図上のオーバーレイ切替アイコン
const OVERLAY_ITEMS: { val: ZoneOverlay; Icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { val: 'none', Icon: EyeOff, label: 'オフ' },
  { val: 'wind', Icon: Wind, label: '風速区分' },
  { val: 'seismic', Icon: Activity, label: '地震地域係数' },
  { val: 'depth', Icon: Snowflake, label: '積雪深マップ' },
];

interface SeaRatioAppProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

// デフォルトは東京駅
const DEFAULT_POINT = { lat: 35.681236, lng: 139.767125 };

interface LatLng {
  lat: number;
  lng: number;
}

const SeaRatioApp: React.FC<SeaRatioAppProps> = ({ onSuccess, onError }) => {
  // 選択中の地点は内部状態として保持（緯度経度の入力欄は持たない）。
  const [point, setPoint] = useState<LatLng>(DEFAULT_POINT);
  // 検索ボックス：住所・地名、または「緯度,経度」を受け付ける。
  const [query, setQuery] = useState('');
  // 加算されると地図が円全体に表示範囲を合わせる（検索時のみ。クリックでは加算しない）
  const [viewVersion, setViewVersion] = useState(0);
  // 地図に薄く重ねる地域区分（なし / 積雪 / 風速）
  const [overlay, setOverlay] = useState<ZoneOverlay>('none');

  const [design, setDesign] = useState<DesignResult | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  // 選択地点の住所（リバースジオコーディング）
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);

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

  const handleMapPick = useCallback((lat: number, lng: number) => {
    setPoint({ lat, lng });
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
    [query, onSuccess, onError]
  );

  const radiusKm = design?.radius_km ?? 40;
  const snow = design?.snow ?? null;
  const wind = design?.wind ?? null;
  const seismic = design?.seismic ?? null;
  const shore = design?.shore ?? null;
  const seaRatio = design?.sea_ratio ?? null;
  const landRatio = design?.land_ratio ?? null;

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

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <TriangleAlert className="w-5 h-5 text-amber-500" />
          Hazard Map
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          地図をクリック、または検索ボックスに住所・地名か「緯度,経度」を入力すると、その地点の海率・標高と、建築基準法告示の積雪荷重係数・基準風速・地震地域係数・積雪深を表示します。
        </p>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:min-h-0">
          {/* 左: 入力 + 結果 */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto lg:min-h-0">
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

            {/* 選択地点（緯度経度・住所） */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">緯度</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {point.lat.toFixed(6)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">経度</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {point.lng.toFixed(6)}
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

              {/* 海岸線・湖岸線までの距離（地表面粗度区分の判定用。風荷重設計の一部なので風速の直下に） */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  海岸線・湖岸線までの距離（平12建告1454号）
                </h3>
                {shore && shore.nearest_m != null ? (
                  <>
                    <Metric
                      label={`最寄りの${shore.nearest_kind === 'lake' ? '湖岸線' : '海岸線'}まで`}
                      value={fmtDist(shore.nearest_m)}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      地表面粗度区分の判定用の距離（地図上に測線を表示）。区分の確定・個別パラメータは設計者判断。
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">取得できませんでした</p>
                )}
              </div>

              {/* 地震地域係数 */}
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
                    <div className="mt-2">
                      <Metric label="地震地域係数 Z" value={`${seismic.Z}`} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    海上または区域外です（陸と判定されませんでした）
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 右: 地図 + オーバーレイ切替アイコン */}
          <div className="lg:col-span-2 h-[400px] lg:h-full lg:min-h-0 relative">
            <SeaRatioMap
              center={point}
              radiusKm={radiusKm}
              viewVersion={viewVersion}
              overlay={overlay}
              shorePoint={
                shore && shore.nearest_lat != null && shore.nearest_lng != null
                  ? { lat: shore.nearest_lat, lng: shore.nearest_lng }
                  : null
              }
              onPick={handleMapPick}
            />
            <div className="absolute top-3 left-3 z-[2] flex flex-col gap-1 bg-white/85 dark:bg-gray-800/85 rounded-lg shadow p-1 backdrop-blur-sm">
              {OVERLAY_ITEMS.map(({ val, Icon, label }) => (
                <button
                  key={val}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => setOverlay(val)}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
                    overlay === val
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
        </div>
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

export default SeaRatioApp;
