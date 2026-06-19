import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, MapPin, Waves } from 'lucide-react';
import SeaRatioMap from './SeaRatioMap';
import type { ZoneOverlay } from './SeaRatioMap';
import { fetchDesign, fetchElevation, geocode, snowDepthCm } from './api';
import type { DesignResult } from './api';

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
  const [point, setPoint] = useState<LatLng>(DEFAULT_POINT);
  // 緯度経度の入力欄（地図クリック・住所検索でも同期）
  const [latText, setLatText] = useState(String(DEFAULT_POINT.lat));
  const [lngText, setLngText] = useState(String(DEFAULT_POINT.lng));
  // 海率計算半径の任意上書き（空なら API が積雪R→40km で自動決定）
  const [radiusText, setRadiusText] = useState('');
  const [address, setAddress] = useState('');
  // 加算されると地図が円全体に表示範囲を合わせる（住所検索・座標入力時のみ。クリックでは加算しない）
  const [viewVersion, setViewVersion] = useState(0);
  // 地図に薄く重ねる地域区分（なし / 積雪 / 風速）
  const [overlay, setOverlay] = useState<ZoneOverlay>('none');

  const [design, setDesign] = useState<DesignResult | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // 地点・半径が変わるたびに設計パラメータ＋標高を取得
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    const radiusKm = radiusText.trim() ? parseFloat(radiusText) : undefined;
    if (radiusKm != null && (!Number.isFinite(radiusKm) || radiusKm <= 0)) return;

    setLoading(true);
    Promise.all([
      fetchDesign(point.lat, point.lng, radiusKm),
      fetchElevation(point.lat, point.lng),
    ])
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
  }, [point.lat, point.lng, radiusText, onError]);

  // 緯度経度入力欄を地点へ反映
  useEffect(() => {
    setLatText(String(point.lat));
    setLngText(String(point.lng));
  }, [point.lat, point.lng]);

  const handleMapPick = useCallback((lat: number, lng: number) => {
    setPoint({ lat, lng });
  }, []);

  const applyManual = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const lat = parseFloat(latText);
      const lng = parseFloat(lngText);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setPoint({ lat, lng });
        setViewVersion((v) => v + 1);
      } else {
        onError?.('緯度・経度は数値で入力してください');
      }
    },
    [latText, lngText, onError]
  );

  const handleAddressSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!address.trim()) return;
      try {
        const r = await geocode(address.trim());
        if (r) {
          setPoint(r);
          setViewVersion((v) => v + 1);
          onSuccess?.(`「${address.trim()}」に移動しました`);
        } else {
          onError?.('住所が見つかりませんでした');
        }
      } catch {
        onError?.('住所検索に失敗しました');
      }
    },
    [address, onSuccess, onError]
  );

  const radiusKm = design?.radius_km ?? (radiusText.trim() ? parseFloat(radiusText) : 40);
  const snow = design?.snow ?? null;
  const wind = design?.wind ?? null;
  const seaRatio = design?.sea_ratio ?? null;
  const landRatio = design?.land_ratio ?? null;

  // 標高が取れる＝陸とみなす。区域ポリゴン外(海岸線変化の埋立地等)でも、陸なら
  // 最寄り区分(nearest)を採用して計算する。陸と判定できなければ採用しない＝海上扱い。
  const onLand = elevation != null;
  const snowUsable = !!snow && (!snow.nearest || onLand);
  const windUsable = !!wind && (!wind.nearest || onLand);
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
          <Waves className="w-5 h-5 text-blue-500" />
          海率計算
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          地図をクリックまたは緯度経度を入力すると、その地点の海率・標高と、建築基準法告示（平成12年基準）の積雪荷重係数・基準風速を表示します。
        </p>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:min-h-0">
          {/* 左: 入力 + 結果 */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto lg:min-h-0">
            {/* 住所検索 */}
            <form onSubmit={handleAddressSearch} className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="住所・地名（例: 東京都千代田区）"
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

            {/* 緯度経度・半径 */}
            <form onSubmit={applyManual} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">緯度</span>
                  <input value={latText} onChange={(e) => setLatText(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">経度</span>
                  <input value={lngText} onChange={(e) => setLngText(e.target.value)} className={inputCls} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  海率計算半径 [km]（空欄＝告示の積雪R、無指定地点は40km）
                </span>
                <input
                  value={radiusText}
                  onChange={(e) => setRadiusText(e.target.value)}
                  placeholder="自動"
                  className={inputCls}
                />
              </label>
              <button
                type="submit"
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                この座標で計算
              </button>
            </form>

            {/* 地図オーバーレイ（地域区分を薄く重ねる） */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">地図オーバーレイ（地域区分）</span>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ['none', 'なし'],
                  ['snow', '積雪区分'],
                  ['wind', '風速区分'],
                ] as [ZoneOverlay, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOverlay(val)}
                    className={`px-2 py-1.5 text-sm rounded-lg border transition-colors ${
                      overlay === val
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {overlay !== 'none' && <ZoneLegend overlay={overlay} />}
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
                    {snow.nearest && <NearestNote kind="積雪" zone={snow.zone} km={snow.nearest_km} />}
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
                    {wind.nearest && <NearestNote kind="風速" zone={wind.zone} km={wind.nearest_km} />}
                    <table className="w-full text-sm">
                      <tbody>
                        <Row k="地域区分" v={`第${wind.zone}区`} />
                        <Row k="Vo (基準風速)" v={`${wind.Vo} m/s`} />
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">
                    海上または区域外です（陸と判定されませんでした）
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 右: 地図 */}
          <div className="lg:col-span-2 h-[400px] lg:h-full lg:min-h-0">
            <SeaRatioMap
              center={point}
              radiusKm={radiusKm}
              viewVersion={viewVersion}
              overlay={overlay}
              onPick={handleMapPick}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// 区域外だが陸のため最寄り区分で計算したことを示す注記。
const NearestNote: React.FC<{ kind: string; zone: number; km?: number }> = ({ kind, zone, km }) => (
  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 mb-1">
    区域外のため最寄りの{kind}第{zone}区で計算
    {km != null ? `（約${km}km）` : ''}
  </p>
);

// オーバーレイの凡例（地図の塗り色と対応するグラデーションバー）。
const ZoneLegend: React.FC<{ overlay: Exclude<ZoneOverlay, 'none'> }> = ({ overlay }) => {
  const conf =
    overlay === 'snow'
      ? {
          grad: 'linear-gradient(to right, #deebf7, #6baed6, #08306b)',
          min: '第1区',
          max: '第40区',
          note: '平12建告1455号 積雪荷重の地域区分（濃いほど区分番号が大）。第0区(沖縄)=積雪なし',
        }
      : {
          grad: 'linear-gradient(to right, #fee5d9, #fb6a4a, #a50f15)',
          min: '第1区 (Vo30)',
          max: '第9区 (Vo46)',
          note: '平12建告1454号 基準風速の地域区分（濃いほど基準風速が大）',
        };
  return (
    <div className="pt-1">
      <div className="h-2 w-full rounded" style={{ background: conf.grad }} />
      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
        <span>{conf.min}</span>
        <span>{conf.max}</span>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{conf.note}</p>
    </div>
  );
};

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
