// Hazard Map 左パネルの「地震動ハザード(J-SHIS)」セクション。
//   - 応答スペクトル(ローカルデータ・即時)の折れ線グラフ + PGA + 値表
//   - 震源別影響度(J-SHIS CGI・初回は数十秒〜2分)の積み上げ棒 + 凡例
// 凡例の色は地図の断層ハイライトと同じ(スロット固定割当)。凡例行クリックで地図をその震源へ寄せる。
import React, { useState } from 'react';
import { Loader2, RefreshCw, Table2, Info, EyeOff, Crosshair } from 'lucide-react';
import { ResponseSpectrumChart, ContributionChart } from './SeismicCharts';
import {
  JSHIS_PERIODS,
  JSHIS_PERIOD_KEYS,
  JSHIS_PROB_KEYS,
  PROB_LABEL,
  PROB_COLOR_VAR,
  PROB_RETURN_YEARS,
  SERIES_VARS,
  contribAt,
  otherShare,
  fmtMag,
} from './jshisApi';
import type { ContribResult, ContribSource, PeriodKey, ProbKey, SourceSlot, SpectrumResult } from './jshisApi';

export interface ContribStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  elapsedS: number | null;
  message?: string;
}

interface Props {
  spectrum: SpectrumResult | null;
  spectrumLoading: boolean;
  contrib: ContribResult | null;
  contribStatus: ContribStatus;
  onRetryContrib: () => void;
  slots: SourceSlot[];
  prob: ProbKey;
  period: PeriodKey;
  onProbChange: (p: ProbKey) => void;
  onPeriodChange: (p: PeriodKey) => void;
  /** 凡例の行クリックで地図をその震源に合わせる(震源のハイライトは常時表示なので誘導UIは持たない) */
  onFocusSource: (s: ContribSource) => void;
}

const SeismicHazardPanel: React.FC<Props> = ({
  spectrum,
  spectrumLoading,
  contrib,
  contribStatus,
  onRetryContrib,
  slots,
  prob,
  period,
  onProbChange,
  onPeriodChange,
  onFocusSource,
}) => {
  const [showTable, setShowTable] = useState(false);

  // 応答スペクトル: ローカルデータが無い環境では API 側の一様ハザードスペクトル(同値)で代替
  const sa = spectrum?.available && spectrum.sa ? spectrum.sa : contrib?.available && contrib.uhs ? contrib.uhs : null;
  const pga = spectrum?.available ? spectrum.pga ?? null : null;

  const row = contribAt(contrib, prob, period);
  const other = otherShare(contrib, slots, prob, period);
  const legendRows = [...slots].sort((a, b) => (row[b.code] ?? 0) - (row[a.code] ?? 0));

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1">
        地震動ハザード
        <InfoTip>
          J-SHIS 確率論的地震動予測地図 2020年版。工学的基盤（Vs=400m/s）上の加速度応答スペクトル（減衰5%）と
          最大加速度、および各周期の応答に対する震源別の影響度（寄与率）。
        </InfoTip>
      </h3>

      {/* ---------------- 応答スペクトル ---------------- */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">加速度応答スペクトル Sa</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] ${
              showTable
                ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="値の表を表示"
          >
            <Table2 className="w-3 h-3" />表
          </button>
        </div>
      </div>
      {/* 凡例: 超過確率(順序尺度・1色相の明度段階) */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400 mb-1">
        <span>50年超過確率</span>
        {JSHIS_PROB_KEYS.map((pk) => (
          <span key={pk} className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-[3px] rounded" style={{ background: PROB_COLOR_VAR[pk] }} />
            {PROB_LABEL[pk]}
            <span className="text-gray-400 dark:text-gray-500">(≈{PROB_RETURN_YEARS[pk]}年)</span>
          </span>
        ))}
      </div>
      {sa ? (
        <>
          <ResponseSpectrumChart sa={sa} selectedPeriod={period} onSelectPeriod={onPeriodChange} />
          {pga && (
            <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-300 flex flex-wrap items-baseline gap-x-2">
              <span className="text-gray-500 dark:text-gray-400">最大加速度 PGA</span>
              {JSHIS_PROB_KEYS.map((pk) => (
                <span key={pk} className="tabular-nums">
                  <span className="text-gray-400 dark:text-gray-500">{PROB_LABEL[pk]}</span>{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {pga[pk] != null ? Math.round(pga[pk]!).toLocaleString() : '—'}
                  </span>
                </span>
              ))}
              <span className="text-gray-400 dark:text-gray-500">cm/s²</span>
            </div>
          )}
          {showTable && (
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400">
                    <th className="text-left font-medium py-0.5">周期 (s)</th>
                    {JSHIS_PROB_KEYS.map((pk) => (
                      <th key={pk} className="text-right font-medium py-0.5">
                        {PROB_LABEL[pk]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-200">
                  {pga && (
                    <tr className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-0.5 text-gray-500 dark:text-gray-400">PGA</td>
                      {JSHIS_PROB_KEYS.map((pk) => (
                        <td key={pk} className="py-0.5 text-right">
                          {pga[pk] != null ? Math.round(pga[pk]!).toLocaleString() : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                  {JSHIS_PERIODS.map((t, i) => (
                    <tr key={t} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-0.5">{t}</td>
                      {JSHIS_PROB_KEYS.map((pk) => {
                        const v = sa[pk]?.[i];
                        return (
                          <td key={pk} className="py-0.5 text-right">
                            {v != null ? Math.round(v).toLocaleString() : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-gray-400 mt-0.5">単位 cm/s²。工学的基盤（Vs=400m/s）上、減衰定数5%。</p>
            </div>
          )}
        </>
      ) : spectrumLoading ? (
        <p className="text-xs text-gray-400 py-4 text-center">応答スペクトルを取得中…</p>
      ) : (
        <p className="text-xs text-gray-400 py-3">
          この地点の応答スペクトルはありません（海上・評価範囲外{spectrum?.reason === 'no_data_file' ? '、またはサーバにデータ未配置' : ''}）
        </p>
      )}

      {/* ---------------- 震源別影響度 ---------------- */}
      <div className="mt-3 flex items-center justify-between gap-2 mb-1">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">震源別の影響度（寄与率）</div>
        <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden text-[10px]" role="group" aria-label="50年超過確率">
          {JSHIS_PROB_KEYS.map((pk) => (
            <button
              key={pk}
              type="button"
              onClick={() => onProbChange(pk)}
              className={`px-1.5 py-0.5 ${
                prob === pk
                  ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={`50年超過確率 ${PROB_LABEL[pk]}（再現期間 約${PROB_RETURN_YEARS[pk]}年）`}
            >
              {PROB_LABEL[pk]}
            </button>
          ))}
        </div>
      </div>

      {contrib?.provisional && (
        <div className="mb-1 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <Loader2 className="mt-px w-3 h-3 shrink-0 animate-spin" />
          <span>
            近傍 {contrib.provisional.dist_km} km の地点の暫定値です（この地点の値を取得中
            {contribStatus.elapsedS != null ? `・${Math.round(contribStatus.elapsedS)} 秒経過` : ''}）。
            取得でき次第この地点の値に差し替わります。
          </span>
        </div>
      )}
      {contribStatus.state === 'loading' && !contrib ? (
        <div className="py-3 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            J-SHIS から震源別影響度を取得中…
            {contribStatus.elapsedS != null && (
              <span className="tabular-nums">（{Math.round(contribStatus.elapsedS)} 秒経過）</span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            初めて評価する地点は J-SHIS 側の計算に 1〜2 分かかります（2回目以降は即時）。
          </p>
        </div>
      ) : contribStatus.state === 'error' ? (
        <div className="py-2 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between gap-2">
          <span>震源別影響度を取得できませんでした{contribStatus.message ? `（${contribStatus.message}）` : ''}</span>
          <button
            type="button"
            onClick={onRetryContrib}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <RefreshCw className="w-3 h-3" />
            再試行
          </button>
        </div>
      ) : contrib && !contrib.available ? (
        <p className="text-xs text-gray-400 py-2">この地点の震源別影響度はありません（海上・評価範囲外）</p>
      ) : contrib && contrib.available ? (
        <>
          <ContributionChart contrib={contrib} slots={slots} prob={prob} selectedPeriod={period} onSelectPeriod={onPeriodChange} />
          {/* 凡例: 選択中の 確率×周期 の寄与率順。色は地図のハイライトと同じ */}
          <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
            50年超過確率 {PROB_LABEL[prob]} ・ 周期 {JSHIS_PERIODS[JSHIS_PERIOD_KEYS.indexOf(period)]} s の寄与率
          </div>
          <ul className="mt-1 divide-y divide-gray-100 dark:divide-gray-700">
            {legendRows.map((s) => (
              <LegendRow key={s.code} slot={s} share={row[s.code] ?? 0} onFocus={onFocusSource} />
            ))}
            {other > 0.0005 && (
              <li className="flex items-center gap-2 py-1">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: 'var(--viz-other)' }} />
                <div className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-300">その他の震源（寄与の小さいもの・集計）</div>
                <div className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{(other * 100).toFixed(1)}%</div>
              </li>
            )}
          </ul>
        </>
      ) : (
        <p className="text-xs text-gray-400 py-2">—</p>
      )}
    </div>
  );
};

// タイトル横の情報アイコン。ホバー/フォーカスで説明を出す(常時表示だと一覧が窮屈になるため)。
const InfoTip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="relative inline-flex group align-middle">
    <button
      type="button"
      tabIndex={0}
      aria-label="この表示についての説明"
      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:text-gray-600"
    >
      <Info className="w-3.5 h-3.5" />
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-2 text-[11px] font-normal leading-snug text-gray-600 shadow-lg group-hover:block group-focus-within:block dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
    >
      {children}
    </span>
  </span>
);

// 震源1件。名称と寄与率だけを並べ、距離・深さ・マグニチュード等の詳細は行のツールチップに退避する
// (一覧の視認性を優先。形状の有無はチップの斜線とアイコンで示す)。
const LegendRow: React.FC<{ slot: SourceSlot; share: number; onFocus: (s: ContribSource) => void }> = ({ slot, share, onFocus }) => {
  const s = slot.source;
  const color = SERIES_VARS[slot.slot];
  const hasGeom = s.fids.length > 0;
  const mag = fmtMag(s);
  const meta: string[] = [];
  if (hasGeom) {
    if (s.dist_km != null) meta.push(s.dist_km < 0.05 ? '直上' : `${s.dist_km < 10 ? s.dist_km.toFixed(1) : Math.round(s.dist_km)} km ${s.direction ?? ''}`.trim());
    if (s.depth_km != null) meta.push(`深さ ${Math.round(s.depth_km)} km`);
    if (mag) meta.push(mag);
  } else if (s.kind === 'areal') {
    meta.push('面的モデル（断層形状を持たないため地図には表示されません）');
  } else if (s.kind === 'aggregate') {
    meta.push('集計');
  } else {
    meta.push('形状データなし');
  }
  const tip = `${s.name}\n${meta.join('・')}${hasGeom ? '\nクリックで地図をこの震源に合わせます' : ''}`;
  const chipStyle: React.CSSProperties = hasGeom
    ? { background: color }
    : {
        background: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)`,
        boxShadow: `inset 0 0 0 1px ${color}`,
      };
  const inner = (
    <>
      <span className="w-3 h-3 rounded-sm shrink-0" style={chipStyle} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-800 dark:text-gray-200 leading-tight line-clamp-2">{s.name}</div>
      </div>
      <div className="text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-100 shrink-0">{(share * 100).toFixed(1)}%</div>
      {hasGeom ? (
        <Crosshair className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
      ) : (
        <EyeOff className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0" />
      )}
    </>
  );
  return (
    <li>
      {hasGeom ? (
        <button
          type="button"
          onClick={() => onFocus(s)}
          className="w-full flex items-center gap-2 py-1 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded"
          title={tip}
        >
          {inner}
        </button>
      ) : (
        <div className="w-full flex items-center gap-2 py-1" title={tip}>
          {inner}
        </div>
      )}
    </li>
  );
};

export default SeismicHazardPanel;
