// Hazard Map 左パネルの「近隣の震源」。指定地点に**波形がある**想定地震の断層の一覧。
//
// 想定地震の地点の値と波形は、J-SHIS が断層ごとに決めている計算対象範囲(経緯度矩形、断層から
// 40〜50km 程度の余白)の中にしか無い。距離で切ると、範囲の外なのに載る断層や、範囲の中なのに
// 漏れる断層が出るので、範囲に地点を含むかで判定する(jiban-api /jshis/scenario/nearby)。
// 確率論的地図の震源モデル(海溝型など)は地点ごとの揺れを持たないので載せない。
//
// 行にカーソルを合わせると地図でその断層と計算範囲を強調し、クリックで想定地震のパネルを開く。
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import InfoTip from './InfoTip';
import type { NearbyFault } from './scenarioApi';

interface Props {
  faults: NearbyFault[] | null;
  loading: boolean;
  error: string | null;
  onOpen: (f: NearbyFault) => void;
  onHover: (f: NearbyFault | null) => void;
}

// 単独区間は近い順にこの件数まで出し、残りは畳む
const SHOW_FIRST = 8;

const pct = (v: number | null) =>
  v == null ? '—' : v === 0 ? 'ほぼ0%' : `${v.toFixed(v < 1 ? 2 : 1)}%`;
const mag = (m: string | null) => (m ? m.replace(/\((M\w?)\)/, '') : '—');
const dist = (km: number) => (km === 0 ? '直上' : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

const NearbyFaultsPanel: React.FC<Props> = ({ faults, loading, error, onOpen, onHover }) => {
  const [showAll, setShowAll] = useState(false);
  const [showCombo, setShowCombo] = useState(false);

  const singles = (faults ?? []).filter((f) => !f.combo);
  const combos = (faults ?? []).filter((f) => f.combo);
  const shown = showAll ? singles : singles.slice(0, SHOW_FIRST);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-1">
        近隣の震源（想定地震）
        <InfoTip>
          この地点に想定地震の波形がある断層です。J-SHIS は断層ごとに計算対象範囲（断層を囲む経緯度の矩形）を
          決めていて、その中にこの地点が入るものだけを載せています。距離は断層面の地表投影までの最短距離。
          海溝型などの震源モデルは地点ごとの揺れを持たないため載せていません（応答スペクトルに確率論的に含まれます）。
        </InfoTip>
      </h3>
      {loading && !faults ? (
        <p className="text-xs text-gray-400 py-2 flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          近隣の震源を検索中…
        </p>
      ) : error ? (
        <p className="text-xs text-red-600 dark:text-red-400 py-2">{error}</p>
      ) : !singles.length && !combos.length ? (
        <p className="text-xs text-gray-400 py-2">
          この地点に波形がある想定地震はありません（どの断層の計算範囲にも入っていません）。
        </p>
      ) : (
        <>
          <table className="w-full text-xs" onMouseLeave={() => onHover(null)}>
            <thead>
              <tr className="text-[11px] text-gray-500 dark:text-gray-400">
                <th className="text-left font-medium py-0.5">断層</th>
                <th className="text-right font-medium py-0.5 pr-1">距離</th>
                <th className="text-right font-medium py-0.5 pr-1">M</th>
                <th className="text-right font-medium py-0.5">30年確率</th>
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-200">
              {shown.map((f) => (
                <Row key={f.code} f={f} onOpen={onOpen} onHover={onHover} />
              ))}
            </tbody>
          </table>
          {singles.length > SHOW_FIRST && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showAll ? '近い順に絞る' : `ほか ${singles.length - SHOW_FIRST} 件を表示`}
            </button>
          )}
          {combos.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowCombo((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {showCombo ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                複数区間の同時活動 {combos.length} 件
              </button>
              {showCombo && (
                <table className="w-full text-xs" onMouseLeave={() => onHover(null)}>
                  <tbody className="text-gray-800 dark:text-gray-200">
                    {combos.map((f) => (
                      <Row key={f.code} f={f} onOpen={onOpen} onHover={onHover} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-0.5">
            行にカーソルで地図に断層と計算範囲（破線）を表示、クリックで想定地震（震度・波形）
          </p>
        </>
      )}
    </div>
  );
};

const Row: React.FC<{
  f: NearbyFault;
  onOpen: (f: NearbyFault) => void;
  onHover: (f: NearbyFault | null) => void;
}> = ({ f, onOpen, onHover }) => (
  <tr
    className="border-t border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
    onMouseEnter={() => onHover(f)}
    onClick={() => onOpen(f)}
  >
    <td className="py-1 pr-1">
      <div className="leading-tight">{f.name || f.code}</div>
    </td>
    <td className="py-1 pr-1 text-right tabular-nums whitespace-nowrap">{dist(f.dist_km)}</td>
    <td className="py-1 pr-1 text-right tabular-nums whitespace-nowrap">{mag(f.mag)}</td>
    <td className="py-1 text-right tabular-nums whitespace-nowrap">{pct(f.t30p)}</td>
  </tr>
);

export default NearbyFaultsPanel;
