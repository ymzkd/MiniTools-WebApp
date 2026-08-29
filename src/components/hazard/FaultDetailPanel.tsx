// Hazard Map 左パネルの「想定地震(震源断層を特定した地震動予測地図)」。
// 地図で断層をクリックすると、ボーリング柱状図と同じ要領でこのパネルへ差し替わる。
//   - ケース選択(その断層に用意された CASE1〜n)
//   - 断層面の展開図(アスペリティ配置と破壊開始点。FaultPlaneView)
//   - 断層情報(長期評価の確率・活動間隔、断層モデルの諸元、アスペリティの面積)
// ケースは「よく分かっていないアスペリティ位置と破壊開始点を両極端に振った直交表」で、
// 平均ではなくばらつきの幅を見るための設定(レシピ2020)。その旨を注記に出す。
import React, { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, FileText, Layers, Loader2, Star } from 'lucide-react';
import InfoTip from './InfoTip';
import FaultPlaneView from './FaultPlaneView';
import {
  aspArea,
  aspColor,
  groupColor,
  aspNumbers,
  bgArea,
  caseNumbers,
  depthAt,
  fmtStrike,
  pdfUrl,
} from './scenarioApi';
import type { ScenarioFault, ScenarioGroup } from './scenarioApi';

interface Props {
  /** 踏んだ場所に重なる想定地震。同じ場所に複数重なることがある */
  faults: ScenarioFault[];
  /** 地図のホバー等で表示した震源名(想定地震が無いときの見出しに使う) */
  srcName: string;
  /** 震源グループ(＝影響度パネルが1行として並べる単位)と、そこに属する断層 */
  group: ScenarioGroup | null;
  /** グループ内の別の断層へ切り替える */
  onSelectFault: (code: string, name: string, src: string) => void;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const FaultDetailPanel: React.FC<Props> = ({ faults, srcName, group, onSelectFault, loading, error, onClose }) => {
  const [faultIdx, setFaultIdx] = useState(0);
  const [caseNo, setCaseNo] = useState<string | null>(null);
  // 展開図の幅はパネル幅に追従させる(左パネルは画面幅で伸縮するため)
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(320);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [faults.length]);

  // 断層が変わったらケース選択を先頭へ戻す
  const fault = faults[Math.min(faultIdx, faults.length - 1)];
  useEffect(() => {
    setFaultIdx(0);
  }, [faults]);
  const cases = fault ? caseNumbers(fault) : [];
  const current = fault && caseNo && fault.cases[caseNo] ? caseNo : cases[0];
  useEffect(() => {
    setCaseNo(null);
  }, [faultIdx, faults]);

  const kase = fault && current ? fault.cases[current] : null;

  return (
    <div ref={boxRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {fault ? fault.name || fault.code : srcName || '震源断層'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            想定地震（震源断層を特定した地震動予測地図）
            <InfoTip>その断層でその地震が起きたら、という条件付きの1シナリオです。確率論的地震動予測地図（応答スペクトル・震源別影響度）とは別のデータで、再現期間の概念を持ちません。</InfoTip>
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

      {loading && (
        <div className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">想定地震を読み込み中…</p>
        </div>
      )}

      {!loading && error && <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && !fault && (
        <div className="p-4 space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            この震源には想定地震が公開されていません。
          </p>
          <p className="text-xs text-gray-400">
            想定地震が用意されているのは主要活断層帯を中心とした一部の断層で、海溝型地震や
            「震源をあらかじめ特定しにくい地震」（領域震源）にはありません。
          </p>
        </div>
      )}

      {!loading && fault && (
        <div className="p-4 space-y-4">
          {/* 同じ場所に重なる想定地震の切替。地図では選び分けられないのでここで選ぶ。
              単独区間(傾斜角モデル違い・ケース違いのコードを含む)と、複数区間が同時に
              活動するシナリオは性質が違うので分ける。 */}
          {faults.length > 1 && (
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                この場所の想定地震（{faults.length}件）
                <InfoTip>同じ断層でも、傾斜角の違うモデル・別ケースとして登録された断層・複数区間が同時に活動するシナリオが同じ場所に重なります。地図では選び分けられないのでここで切り替えます。</InfoTip>
              </span>
              <select
                value={faultIdx}
                onChange={(e) => setFaultIdx(Number(e.target.value))}
                className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
              >
                {['single', 'combo'].map((g) => {
                  const items = faults
                    .map((f, i) => ({ f, i }))
                    .filter(({ f }) => (g === 'combo' ? f.combo : !f.combo));
                  if (!items.length) return null;
                  return (
                    <optgroup key={g} label={g === 'combo' ? '複数区間が同時に活動' : 'この区間の断層'}>
                      {items.map(({ f, i }) => (
                        <option key={f.code} value={i}>
                          {f.name || f.code}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          )}
          {/* 震源グループ。断層はデータとしてまとめず、同じ震源であることを色で示す。
              影響度パネルが1行として並べる単位でもある。 */}
          {group && group.faults.length > 1 && (
            <GroupSection
              group={group}
              currentCode={fault.code}
              onSelectFault={onSelectFault}
            />
          )}

          {/* ケース選択 */}
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ケース（{cases.length}通り）
              <InfoTip>アスペリティの位置と破壊開始点を振った複数ケースが用意されています。どれが正解ということではなく、予測結果のばらつきの幅を見るための設定なので、全ケースを包絡して使うのが本来の用途です（強震動予測レシピ 2020）。</InfoTip>
            </span>
            <select
              value={current ?? ''}
              onChange={(e) => setCaseNo(e.target.value)}
              className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
            >
              {cases.map((n) => (
                <option key={n} value={n}>
                  Case {n}
                </option>
              ))}
            </select>
          </label>

          {/* 展開図 */}
          {kase && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                断層面の展開図
                <InfoTip>断層面を走向方向×傾斜方向に開いた図です。マス目が要素断層（2kmメッシュ）、色付きがアスペリティ（すべりの大きい領域）、★が破壊開始点。屈曲した断層はセグメントごとに縦に並べています。</InfoTip>
              </h4>
              <FaultPlaneView kase={kase} width={boxW - 32} />
              <Legend kase={kase} />
              <p className="text-[11px] text-gray-400 mt-1">
                要素断層 {kase.nelem} 個
                {kase.date && ` ／ 断層モデル ${kase.date}`}
              </p>
            </div>
          )}

          {/* 断層情報 */}
          {kase && <FaultInfoTable fault={fault} caseNo={current ?? ''} />}

          {/* 出典・関連リンク */}
          <div className="flex flex-wrap gap-3 pt-1 border-t border-gray-100 dark:border-gray-700">
            {pdfUrl(fault.info) && (
              <a
                href={pdfUrl(fault.info)!}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                特性化震源モデル（PDF）
              </a>
            )}
            {fault.info.link && (
              <a
                href={fault.info.link}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                長期評価（地震本部）
              </a>
            )}
          </div>
          {fault.legacy && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              この断層の想定地震は旧い断層コード（{fault.code}・{fault.ver}）でのみ公開されているデータです。
              現在の震源モデルの区間区分とは一致しない場合があります。
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 震源グループ。同じ震源に属する断層を、まとめずに一覧で見せる。
 * 見出しとリストの左罫にグループ色を敷いて「同じ震源のもの」であることを示す
 * (地図側でも同じ色でこれらの断層を括っている)。
 */
const GroupSection: React.FC<{
  group: ScenarioGroup;
  currentCode: string;
  onSelectFault: (code: string, name: string, src: string) => void;
}> = ({ group, currentCode, onSelectFault }) => {
  const [open, setOpen] = useState(false);
  const color = groupColor(group.src);
  const singles = group.faults.filter((f) => !f.combo);
  const combos = group.faults.filter((f) => f.combo);
  return (
    <div className="rounded-lg border-l-4 pl-2 py-1" style={{ borderColor: color }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-start gap-1.5"
      >
        <Layers className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-gray-700 dark:text-gray-200 truncate">{group.name}</span>
          <span className="block text-[11px] text-gray-400">
            同じ震源の断層 {group.faults.length} 本
            {combos.length > 0 && `（うち同時活動 ${combos.length}）`}
            ・{open ? '閉じる' : '一覧'}
          </span>
        </span>
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {[...singles, ...combos].map((f) => (
            <li key={f.code}>
              <button
                type="button"
                onClick={() => onSelectFault(f.code, f.name, group.src)}
                className={
                  'w-full text-left text-[11px] leading-snug px-1 py-0.5 rounded ' +
                  (f.code === currentCode
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50')
                }
              >
                {f.combo && <span className="text-gray-400">［同時活動］</span>}
                {f.name || f.code}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** 展開図の凡例。アスペリティ番号と面積、背景領域。 */
const Legend: React.FC<{ kase: import('./scenarioApi').ScenarioCase }> = ({ kase }) => {
  const nums = aspNumbers(kase.planes);
  const area = aspArea(kase.planes);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-600 dark:text-gray-300">
      {nums.map((n) => (
        <span key={n} className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: aspColor(n), opacity: 0.75 }}
          />
          第{n}アスペリティ {Math.round(area.get(n) ?? 0)} km²
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--viz-grid)' }} />
        背景領域 {Math.round(bgArea(kase.planes))} km²
      </span>
      {kase.des && (
        <span className="inline-flex items-center gap-1">
          <Star className="w-3 h-3" fill="currentColor" />
          破壊開始点
        </span>
      )}
    </div>
  );
};

const Row: React.FC<{ k: React.ReactNode; v: React.ReactNode }> = ({ k, v }) => (
  <tr className="border-b border-gray-100 dark:border-gray-700 last:border-0">
    <td className="py-1 pr-2 text-gray-500 dark:text-gray-400 align-top whitespace-nowrap">{k}</td>
    <td className="py-1 text-gray-900 dark:text-gray-100 tabular-nums">{v}</td>
  </tr>
);

const FaultInfoTable: React.FC<{ fault: ScenarioFault; caseNo: string }> = ({ fault, caseNo }) => {
  const kase = fault.cases[caseNo];
  const i = fault.info;
  const planes = kase.planes;
  const totalL = planes.reduce((a, p) => a + p.L, 0);
  const area = planes.reduce((a, p) => a + p.L * p.W, 0);
  const zTop = Math.min(...planes.map((p) => p.ztop));
  const zBot = Math.max(...planes.map((p) => depthAt(p, p.W)));
  const pct = (v: number | null) =>
    v == null ? '—' : v === 0 ? 'ほぼ 0 %' : `${v.toFixed(v < 1 ? 2 : 1)} %`;
  const yrs = (v: number | null) => (v == null ? '—' : `${Math.round(v).toLocaleString('ja-JP')} 年`);

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">断層情報</h4>
      <table className="w-full text-sm">
        <tbody>
          <Row k="断層コード" v={`${fault.code}（${fault.ver}）`} />
          {i.mag && <Row k="マグニチュード" v={i.mag.replace(/\((M\w?)\)/, ' $1')} />}
          <Row k="断層モデル長さ" v={`${totalL.toFixed(0)} km${planes.length > 1 ? `（${planes.length}セグメント）` : ''}`} />
          <Row k="断層モデル幅" v={`${planes.map((p) => p.W.toFixed(0)).join(' / ')} km`} />
          <Row k="断層モデル面積" v={`${Math.round(area).toLocaleString('ja-JP')} km²`} />
          <Row k="走向" v={planes.map((p) => fmtStrike(p.strike)).join(' / ')} />
          <Row k="傾斜角" v={`${planes.map((p) => p.dip.toFixed(0)).join(' / ')}°`} />
          <Row k="上端／下端深さ" v={`${zTop.toFixed(1)} ／ ${zBot.toFixed(1)} km`} />
          {kase.des && (
            <Row
              k={
                <>
                  破壊開始点
                  <InfoTip>レシピではアスペリティの内部を避け、断層の深部側に置くとされています。ケースごとに断層の両端×深さで振られます。</InfoTip>
                </>
              }
              v={`深さ ${(kase.des.dep / 1000).toFixed(1)} km（${kase.des.lat.toFixed(3)}, ${kase.des.lng.toFixed(3)}）`}
            />
          )}
          <Row k="平均活動間隔" v={yrs(i.avract)} />
          <Row k="最新活動からの経過" v={yrs(i.newact)} />
          <Row
            k={
              <>
                30年発生確率
                {i.proc && <span className="text-[10px] ml-1">（{i.proc}）</span>}
              </>
            }
            v={pct(i.t30p)}
          />
          <Row k="50年発生確率" v={pct(i.t50p)} />
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400 mt-1">
        すべり量・実効応力・地震モーメントなどの震源パラメータは特性化震源モデル（下のPDF）にあります。
      </p>
    </div>
  );
};

export default FaultDetailPanel;
