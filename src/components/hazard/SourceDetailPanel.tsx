// Hazard Map 左パネルの「震源モデル」。想定地震の無い震源(確率論的地震動予測地図の震源モデル)を
// 地図で踏んだときに、想定地震のパネル(FaultDetailPanel)の代わりに出す。
//
// 想定地震の無い震源は、地点ごとの揺れ(震度・波形)を持たない。出せるのは「どこで・どの規模の
// 地震が・どの確率で起きるか」だけで、その地点への影響は応答スペクトルに確率論的に含まれている。
// その旨をパネルに明記する。
import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import InfoTip from './InfoTip';
import { fetchSourceInfo } from './scenarioApi';
import type { SourceInfo, SourceMember } from './scenarioApi';

/** 地図で踏んだ震源(タイルの src 属性)。 */
export interface SourcePick {
  src: string;
  name: string;
  /** fault=想定地震の無い活断層 / sea=海溝型・海域の地震 */
  kind: 'fault' | 'sea';
}

interface Props {
  pick: SourcePick;
  onClose: () => void;
}

// 発生確率の評価モデル(J-SHIS の proc)。意味が確かな2つだけ言い換え、ほか(SIM/BSI/PSI/COM
// など、元データに定義の無いもの)はコードのまま出す
const PROC_LABEL: Record<string, string> = {
  POI: 'ポアソン過程',
  BPT: 'BPT分布（更新過程）',
};

const pct = (v: number | null) =>
  v == null ? '—' : v === 0 ? 'ほぼ0%' : `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
const num = (v: number | null, unit: string, d = 0) => (v == null ? '—' : `${v.toFixed(d)} ${unit}`);
const range = (vs: (number | null)[], unit: string, d = 1) => {
  const xs = vs.filter((v): v is number => v != null);
  if (!xs.length) return '—';
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? `${lo.toFixed(d)}${unit}` : `${lo.toFixed(d)}〜${hi.toFixed(d)}${unit}`;
};

const SourceDetailPanel: React.FC<Props> = ({ pick, onClose }) => {
  const [info, setInfo] = useState<SourceInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setInfo(null);
    setErr(null);
    fetchSourceInfo(pick.src, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setInfo(r);
      })
      .catch(() => {
        if (!ac.signal.aborted) setErr('震源の情報を取得できませんでした');
      });
    return () => ac.abort();
  }, [pick.src]);

  const isModelSet = info?.kind === 'points'; // 海溝型: 1つの地震に多数の震源域モデル

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{info?.name ?? pick.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            確率論的地震動予測地図の震源（想定地震なし）
            <InfoTip>
              J-SHIS 確率論的地震動予測地図 2024年版の震源モデルです。震源断層を特定した想定地震は作られていないため、
              地点ごとの震度や波形はありません。
            </InfoTip>
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 shrink-0 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="閉じる"
        >
          <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {!info && !err && (
        <div className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
        </div>
      )}
      {err && <p className="p-4 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {info && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-md px-2.5 py-2 leading-relaxed">
            この震源には想定地震が無いため、地点の揺れ（震度・波形）は出せません。
            地点への影響は、左パネルの<span className="font-medium">加速度応答スペクトル</span>に確率論的に含まれています。
          </p>

          <table className="w-full text-xs">
            <tbody className="text-gray-800 dark:text-gray-200">
              <InfoRow k="地震の種類" v={info.layer_name ?? '—'} />
              {isModelSet ? (
                <>
                  <InfoRow k="震源域のモデル" v={`${info.members.length} 通り`} />
                  <InfoRow k="規模" v={`${info.members[0]?.mag_kind ?? 'M'} ${range(info.members.map((m) => m.mag), '', 1)}`} />
                  <InfoRow k="震源域の深さ" v={range(info.members.map((m) => m.z_min).concat(info.members.map((m) => m.z_max)), ' km', 0)} />
                  <InfoRow k="発生確率" v="この元データには含まれません（地震本部の長期評価を参照）" />
                </>
              ) : info.members.length === 1 ? (
                <MemberRows m={info.members[0]} />
              ) : null}
            </tbody>
          </table>

          {!isModelSet && info.members.length > 1 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                構成する断層（{info.members.length}）
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-gray-500 dark:text-gray-400">
                    <th className="text-left font-medium py-0.5">断層</th>
                    <th className="text-right font-medium py-0.5 pr-1">M</th>
                    <th className="text-right font-medium py-0.5 pr-1">30年確率</th>
                    <th className="text-right font-medium py-0.5">長さ</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-200">
                  {info.members.map((m, i) => (
                    <tr key={`${m.code}-${i}`} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-0.5 pr-1 leading-tight">{m.name}</td>
                      <td className="py-0.5 pr-1 text-right tabular-nums">{m.mag ?? '—'}</td>
                      <td className="py-0.5 pr-1 text-right tabular-nums">{pct(m.t30)}</td>
                      <td className="py-0.5 text-right tabular-nums whitespace-nowrap">{num(m.len, 'km')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-400">出典: J-SHIS 確率論的地震動予測地図 震源モデル（P-Y2024）</p>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <tr className="border-t border-gray-100 dark:border-gray-700 first:border-t-0">
    <th className="text-left font-normal text-gray-500 dark:text-gray-400 py-1 pr-2 whitespace-nowrap align-top">{k}</th>
    <td className="py-1">{v}</td>
  </tr>
);

const MemberRows: React.FC<{ m: SourceMember }> = ({ m }) => (
  <>
    <InfoRow k="規模" v={m.mag != null ? `${m.mag_kind ?? 'M'} ${m.mag}` : '—'} />
    <InfoRow k="30年発生確率" v={pct(m.t30)} />
    <InfoRow k="50年発生確率" v={pct(m.t50)} />
    <InfoRow k="確率の評価" v={m.proc ? PROC_LABEL[m.proc] ?? m.proc : '—'} />
    <InfoRow k="長さ × 幅" v={m.len != null && m.wid != null ? `${m.len} km × ${m.wid} km` : '—'} />
    <InfoRow k="走向 / 傾斜" v={m.str != null && m.dip != null ? `${m.str}° / ${m.dip}°` : '—'} />
    <InfoRow k="深さ（上端〜下端）" v={m.z_min != null && m.z_max != null ? `${m.z_min} 〜 ${m.z_max} km` : '—'} />
  </>
);

export default SourceDetailPanel;
