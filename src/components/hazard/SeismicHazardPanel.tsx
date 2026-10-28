// Hazard Map 左パネルの「地震動ハザード(J-SHIS)」セクション。
//   応答スペクトル(ローカルデータ・即時)の折れ線グラフ + PGA + 値表
import React, { useState } from 'react';
import { Table2 } from 'lucide-react';
import InfoTip from './InfoTip';
import { ResponseSpectrumChart } from './SeismicCharts';
import { JSHIS_PERIODS, JSHIS_PROB_KEYS, PROB_LABEL, PROB_COLOR_VAR, PROB_RETURN_YEARS } from './jshisApi';
import type { SpectrumResult } from './jshisApi';

interface Props {
  spectrum: SpectrumResult | null;
  spectrumLoading: boolean;
}

const SeismicHazardPanel: React.FC<Props> = ({ spectrum, spectrumLoading }) => {
  const [showTable, setShowTable] = useState(false);

  const sa = spectrum?.available && spectrum.sa ? spectrum.sa : null;
  const pga = spectrum?.available ? spectrum.pga ?? null : null;

  return (
    <div>
      {/* 地震動ハザードの項目は応答スペクトルだけなので、それをセクションの見出しにする */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1">
          加速度応答スペクトル Sa
          <InfoTip>
            J-SHIS 確率論的地震動予測地図 2020年版。工学的基盤（Vs=400m/s）上の加速度応答スペクトル（減衰5%）と
            最大加速度。
          </InfoTip>
        </h3>
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
          <ResponseSpectrumChart sa={sa} />
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
    </div>
  );
};

export default SeismicHazardPanel;
