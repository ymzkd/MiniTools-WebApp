// Hazard Map 左パネルの「想定地震(震源断層を特定した地震動予測地図)」。
// 地図で断層をクリックすると、ボーリング柱状図と同じ要領でこのパネルへ差し替わる。
//   - 同じ震源の想定地震の一覧(この場所に重なるもの / 同じ震源のほか)。ホバーで地図を強調
//   - ケース選択(その断層に用意された CASE1〜n)。**この地点での揺れの大きさを並べて選ばせる**
//   - 断層面の展開図(アスペリティ配置と破壊開始点。FaultPlaneView)
//   - 断層情報(長期評価の確率・活動間隔、断層モデルの諸元、アスペリティの面積、基準面の Vs)
//   - 選択地点の波形(J-SHIS の公開波形。速度⇔加速度を切り替えて見られ、加速度を CSV で
//     書き出せる。両方を先読みしてメモするので切替と書き出しに通信は起きない。WaveSection)
// ケースは「よく分かっていないアスペリティ位置と破壊開始点を両極端に振った直交表」で、
// 平均ではなくばらつきの幅を見るための設定(レシピ2020)。その旨を注記に出す。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ChevronRight, Download, ExternalLink, FileText, Layers, Loader2, Star } from 'lucide-react';
import InfoTip from './InfoTip';
import FaultPlaneView from './FaultPlaneView';
import WaveformView from './WaveformView';
import {
  aspArea,
  aspColor,
  groupColor,
  aspNumbers,
  bgArea,
  caseNumbers,
  depthAt,
  downloadWaveCsv,
  fetchCaseSummary,
  fetchWave,
  fmtStrike,
  pdfUrl,
  shindoColor,
  unitLabel,
  QUANTITY_LABEL,
  UNIT_CHOICES,
} from './scenarioApi';
import type {
  CaseSummaryResult,
  ScenarioFault,
  ScenarioGroup,
  WaveQuantity,
  WaveResult,
  WaveUnit,
} from './scenarioApi';

interface Props {
  /** クリックした断層と、その場所に重なる想定地震(先頭がクリックした断層) */
  faults: ScenarioFault[];
  /** 震源グループ(J-SHIS の震源コードの単位)と、そこに属する想定地震 */
  group: ScenarioGroup | null;
  /** いま開いている想定地震(一覧で選んだもの)。取得中は null */
  fault: ScenarioFault | null;
  /** 一覧で想定地震を選ぶ */
  onSelectFault: (code: string) => void;
  /** 一覧でカーソルを合わせた想定地震(地図で強調する)。外れたら null */
  onHoverFault: (code: string | null) => void;
  /** ハザード情報の選択地点。この地点で揺れがどうなるかを波形で見る */
  point: { lat: number; lng: number };
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const FaultDetailPanel: React.FC<Props> = ({
  faults,
  group,
  fault,
  onSelectFault,
  onHoverFault,
  point,
  loading,
  error,
  onClose,
}) => {
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

  // 想定地震が変わったらケース選択を先頭へ戻す
  const cases = fault ? caseNumbers(fault) : [];
  const current = fault && caseNo && fault.cases[caseNo] ? caseNo : cases[0];
  useEffect(() => {
    setCaseNo(null);
  }, [fault?.code]);

  const kase = fault && current ? fault.cases[current] : null;

  return (
    <div ref={boxRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {fault ? fault.name || fault.code : group?.name || '想定地震'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            想定地震（震源断層を特定した地震動予測地図）
            <InfoTip>その断層でその地震が起きたら、という条件付きの1シナリオです。確率論的地震動予測地図（応答スペクトル）とは別のデータで、再現期間の概念を持ちません。</InfoTip>
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
          <p className="text-sm text-gray-600 dark:text-gray-300">この想定地震は見つかりませんでした。</p>
        </div>
      )}

      {!loading && fault && (
        <div className="p-4 space-y-4">
          {/* 同じ震源の想定地震の一覧。クリックした場所に重なるものを上に分けて出す */}
          {group && group.faults.length > 1 && (
            <GroupSection
              group={group}
              hereCodes={faults.map((f) => f.code)}
              currentCode={fault.code}
              onSelectFault={onSelectFault}
              onHoverFault={onHoverFault}
            />
          )}

          {/* ケース選択。この地点での揺れの大きさを並べて選ばせる */}
          <CaseTable
            code={fault.code}
            cases={cases}
            current={current ?? ''}
            onSelect={setCaseNo}
            point={point}
          />

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

          {/* 選択地点の波形 */}
          {current && (
            <WaveSection code={fault.code} caseNo={current} point={point} width={boxW - 32} />
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
        </div>
      )}
    </div>
  );
};

/**
 * ケースの一覧。**この地点での揺れの大きさを並べて**選ばせる。
 *
 * ケースはアスペリティ配置と破壊開始点を両極端に振った直交表で、断層によっては12通りある。
 * 「Case 1〜12」と番号だけ並べても、どれが大きいのか・どれを見ればいいのかが分からない。
 * 波形は1件 0.5〜1.5MB あって全ケース取ってから比べるのは重いので、先に軽い一覧
 * (1ケース 742 バイト・全ケース並列で 1 秒弱)で大きさを見せる。
 *
 * 値が取れないとき(計算対象範囲の外・旧断層コード)は素の番号リストに落ちる。
 */
const CaseTable: React.FC<{
  code: string;
  cases: string[];
  current: string;
  onSelect: (n: string) => void;
  point: { lat: number; lng: number };
}> = ({ code, cases, current, onSelect, point }) => {
  const [sum, setSum] = useState<CaseSummaryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const ac = new AbortController();
    setBusy(true);
    setSum(null);
    fetchCaseSummary(code, point.lat, point.lng, ac.signal)
      .then((r) => {
        if (id === reqId.current) setSum(r);
      })
      .catch((e) => {
        if (id !== reqId.current || (e instanceof Error && e.name === 'AbortError')) return;
        console.error('Failed to fetch case summary:', e);
      })
      .finally(() => {
        if (id === reqId.current) setBusy(false);
      });
    return () => ac.abort();
  }, [code, point.lat, point.lng]);

  const rows = sum?.cases.filter((c) => c.available) ?? [];
  const maxPgv = Math.max(...rows.map((c) => c.pgv ?? 0), 0);
  const byCase = new Map(rows.map((c) => [c.case, c]));
  // 断層形状に別案があるケース(上町断層帯 CASE5/6 の屈曲モデルなど)だけ規模が変わる
  const shapeVaries = new Set(rows.map((c) => `${c.L}/${c.area}/${c.nseg}`)).size > 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ケース（{cases.length}通り）
          <InfoTip>
            アスペリティの位置と破壊開始点を振った複数ケースが用意されています。どれが正解ということでは
            なく、予測結果のばらつきの幅を見るための設定なので、全ケースを包絡して使うのが本来の用途です
            （強震動予測レシピ 2020）。震源パラメータ（地震モーメント・マグニチュード・短周期レベル）は
            ケース間で共通で、変わるのはアスペリティ配置・破壊開始点と、断層形状に別案があるケースの
            形状だけです。
          </InfoTip>
        </span>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
      </div>

      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto slim-scrollbar">
          <table className="w-full mt-1 text-xs">
            <thead>
              <tr className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                <th className="text-left font-normal pb-0.5">ケース</th>
                <th className="text-right font-normal pb-0.5">
                  基盤最大速度
                  <InfoTip>
                    詳細法工学的基盤{sum?.vs != null && `（Vs = ${sum.vs.toFixed(0)} m/s）`}
                    上の最大速度です。想定地震地図が公表している値で、
                    地表の揺れではありません。棒の長さはこの断層のケース間の相対比です。
                  </InfoTip>
                </th>
                <th className="text-right font-normal pb-0.5">基盤震度</th>
                <th className="text-right font-normal pb-0.5">
                  地表震度
                  <InfoTip>
                    工学的基盤の計測震度に、表層地盤による震度増分を足した地表の震度（気象庁震度階級）です。
                    増分はこの地点の微地形区分から求めた値で、ここでは {rows[0]?.si_inc ?? '—'} でした。
                  </InfoTip>
                </th>
                {shapeVaries && (
                  <th className="text-right font-normal pb-0.5">
                    断層モデル
                    <InfoTip>
                      断層形状そのものに別案があるケースがあると、ここに差が出ます。たとえば上町断層帯の
                      CASE5/6 は全長がほぼ同じでも「直線1枚」ではなく「屈曲2枚」のモデルで、
                      震源パラメータ（すべり量・実効応力）も別に設定されています。
                    </InfoTip>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {cases.map((n) => {
                const c = byCase.get(n);
                const sel = n === current;
                return (
                  <tr
                    key={n}
                    onClick={() => onSelect(n)}
                    className={
                      'cursor-pointer ' +
                      (sel
                        ? 'bg-gray-100 dark:bg-gray-700 font-medium text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50')
                    }
                  >
                    <td className="py-0.5 pl-1 whitespace-nowrap">
                      <span className={sel ? 'text-blue-600 dark:text-blue-400' : 'text-transparent'}>▸</span>{' '}
                      Case {n}
                    </td>
                    <td className="py-0.5 pr-1 text-right tabular-nums whitespace-nowrap">
                      {c?.pgv != null ? (
                        <>
                          <span
                            className="inline-block h-2 rounded-sm mr-1 align-middle"
                            style={{
                              width: `${maxPgv ? Math.max(2, (c.pgv / maxPgv) * 34) : 0}px`,
                              background: 'var(--viz-s1)',
                              opacity: sel ? 0.9 : 0.45,
                            }}
                          />
                          {c.pgv.toFixed(1)}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-0.5 pr-1 text-right tabular-nums">{c?.si_b?.toFixed(1) ?? '—'}</td>
                    <td className="py-0.5 pr-1 text-right whitespace-nowrap">
                      {c?.si_surf ? (
                        <span
                          className="inline-block px-1.5 rounded text-[11px] text-white"
                          style={{ background: shindoColor(c.si_surf) }}
                        >
                          {c.si_surf}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {shapeVaries && (
                      <td className="py-0.5 pr-1 text-right tabular-nums whitespace-nowrap">
                        {c ? `${c.L.toFixed(0)} km` : '—'}
                        {c && c.nseg > 1 && (
                          <span className="text-gray-400"> ({c.nseg}面)</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            速度は cm/s。{sum?.mag && `マグニチュード ${sum.mag.replace(/\((M\w?)\)/, ' $1')}（全ケース共通）／`}
            行をクリックでケースを切り替え
          </p>
        </>
      ) : (
        /* 値が取れない断層(計算対象範囲の外・旧断層コード)は素の番号リストにする */
        <select
          value={current}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5"
        >
          {cases.map((n) => (
            <option key={n} value={n}>
              Case {n}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

/** 1つの(断層・ケース・地点)についての波形メモ。物理量ごとに1本ずつ持つ。 */
interface WaveStore {
  key: string;
  /** この組に対する取得をまとめて止めるための controller(断層を変えたら abort する) */
  ac: AbortController;
  got: Map<WaveQuantity, WaveResult>;
  jobs: Map<WaveQuantity, Promise<WaveResult>>;
}

/**
 * 選択地点の波形。J-SHIS が想定地震地図の元データとして公開している詳細法工学的基盤上の
 * 時刻歴を取ってきて描く(断層モデルからの自前計算ではない)。
 *
 * 断層・ケース・地点が変わるたびに取り直す。上流は 0.5〜1.5MB あって数秒かかることが
 * あるので、待っている間はスピナーを出し、前のケースの波形は消してから差し替える
 * (古い波形が新しいケースの見出しの下に残ると読み違える)。
 *
 * **速度と加速度は (断層・ケース・地点) ごとにメモして使い回す。** サーバ側では両者とも
 * 同じ1本の速度波形から作られる(速度をキャッシュし、加速度はそれを微分して返す)ので、
 * 切り替えのたびに 225〜266KB を取り直すのは無駄でしかない。表示中の波形が届いたら
 * もう片方を裏で先読みしておき、切り替えと CSV 書き出しを通信なしで済ませる。
 * 先読みの失敗は表示に影響しないので握りつぶす。
 */
const WaveSection: React.FC<{
  code: string;
  caseNo: string;
  point: { lat: number; lng: number };
  width: number;
}> = ({ code, caseNo, point, width }) => {
  const [data, setData] = useState<WaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<WaveQuantity>('vel');
  const [dlUnit, setDlUnit] = useState<WaveUnit>('cm');
  const [dlBusy, setDlBusy] = useState(false);
  const reqId = useRef(0);
  const store = useRef<WaveStore | null>(null);

  const key = `${code}|${caseNo}|${point.lat}|${point.lng}`;

  /**
   * その物理量の波形を返す。メモにあれば即座に、無ければ取りに行く。
   * 同じ物理量への同時要求は1本にまとめる(表示と先読みが競合しても2回投げない)。
   */
  const load = useCallback(
    (q: WaveQuantity): Promise<WaveResult> => {
      if (store.current?.key !== key) {
        // 断層・ケース・地点が変わった。前の組の取得はもう要らないので止めてから捨てる
        store.current?.ac.abort();
        store.current = { key, ac: new AbortController(), got: new Map(), jobs: new Map() };
      }
      const st = store.current;
      const hit = st.got.get(q);
      if (hit) return Promise.resolve(hit);
      let job = st.jobs.get(q);
      if (!job) {
        job = fetchWave(code, caseNo, point.lat, point.lng, q, st.ac.signal)
          .then((r) => {
            st.got.set(q, r);
            return r;
          })
          .finally(() => {
            st.jobs.delete(q);
          });
        st.jobs.set(q, job);
      }
      return job;
    },
    [key, code, caseNo, point.lat, point.lng]
  );

  // パネルを閉じたら走っている取得を止める(切り替えでは止めない。メモに入れたいので)
  useEffect(() => () => store.current?.ac.abort(), []);

  useEffect(() => {
    const id = ++reqId.current;
    const hit = store.current?.key === key ? store.current.got.get(quantity) : undefined;
    setErr(null);
    // メモにあるならスピナーを出さずに差し替える(切り替えが引っかからないように)
    setData(hit ?? null);
    setBusy(!hit);
    load(quantity)
      .then((r) => {
        if (id !== reqId.current) return;
        setData(r);
        setBusy(false);
        // 表示できたら、もう片方の物理量を裏で温めておく。
        // 範囲外(available=false)は中身が無いので取りに行かない。
        if (r.available) load(quantity === 'vel' ? 'acc' : 'vel').catch(() => {});
      })
      .catch((e) => {
        if (id !== reqId.current || (e instanceof Error && e.name === 'AbortError')) return;
        console.error('Failed to fetch wave:', e);
        setErr('波形の取得に失敗しました');
        setBusy(false);
      });
  }, [load, key, quantity]);

  // 書き出すのは加速度だけ(解析ソフトの入力に使うのは加速度なので)。速度を表示していても
  // 加速度は先読み済みなので、ふつうは通信が起きない。微分は jiban-api 側にある。
  const onDownload = async () => {
    if (!data?.available) return;
    setDlBusy(true);
    try {
      const w = data.quantity === 'acc' ? data : await load('acc');
      downloadWaveCsv(w, dlUnit);
    } catch (e) {
      console.error('Failed to download wave:', e);
      setErr('波形の取得に失敗しました');
    } finally {
      setDlBusy(false);
    }
  };

  // dt は丸めた値なので、時間軸には記録長/点数を使う
  const dt = data?.duration && data.n ? data.duration / data.n : (data?.dt ?? 0);

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
        この地点の波形
        <InfoTip>
          J-SHIS が想定地震地図の元データとして公開している、詳細法工学的基盤
          {data?.vs != null && `（S波速度 ${data.vs.toFixed(0)} m/s 層の上面）`}
          上の速度波形です。長周期成分を三次元差分法、短周期成分を統計的グリーン関数法で
          計算し接続周期1秒で合成した（ハイブリッド合成法）もので、1.5 Hz
          以上の帯域は NS と EW に同じ波形が使われています。その帯域で成分間の方向性は読み取れません。
        </InfoTip>
      </h4>
      <p className="text-[11px] text-gray-400 mb-1.5">
        選択地点 {point.lat.toFixed(4)}, {point.lng.toFixed(4)} を含む 1 km メッシュ
        {data?.mesh && `（${data.mesh}）`}
      </p>

      {busy && (
        <div className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            J-SHIS から波形を読み込み中…
          </p>
        </div>
      )}

      {!busy && err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      {!busy && data && !data.available && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          この地点の波形は公開されていません。
          <span className="block text-gray-400 mt-0.5">
            公開されているのは、その断層の計算対象範囲内のメッシュだけです（断層からおおむね
            100 km 圏内）。旧い断層コードでのみ公開されている断層にも波形はありません。
          </span>
        </p>
      )}

      {!busy && data && data.available && data.dt && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1">
            <div className="text-xs text-gray-600 dark:text-gray-300">
              {data.pgv_h != null && (
                <>
                  水平最大速度 <span className="tabular-nums font-medium">{data.pgv_h.toFixed(1)}</span> cm/s
                  <InfoTip>
                    NS と EW をベクトル合成した最大値です。想定地震地図が「工学的基盤の最大速度」として
                    公表しているのはこの値なので、地図の色と対応します。成分ごとの最大（各段の見出し）
                    とは別物です。
                  </InfoTip>
                  <span className="text-gray-400"> ／ </span>
                </>
              )}
              <span className="text-gray-400">記録長 {data.duration} 秒 ／ 120 Hz</span>
            </div>
            {/* 速度⇔加速度の切替。加速度は公開されていないので速度を微分して作る */}
            <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-[11px]">
              {(['vel', 'acc'] as WaveQuantity[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantity(q)}
                  className={
                    'px-2 py-0.5 transition-colors ' +
                    (quantity === q
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700')
                  }
                >
                  {QUANTITY_LABEL[q]}
                </button>
              ))}
            </div>
          </div>

          <WaveformView
            waves={data.waves}
            dt={dt}
            unit={data.unit}
            width={width}
          />

          {/* 書き出しは加速度だけ。解析ソフトの入力に使うのは加速度なので、速度を表示中でも
              加速度で取り直して出す。単位だけ選べるようにしてある。 */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">加速度を書き出し</span>
            <select
              value={dlUnit}
              onChange={(e) => setDlUnit(e.target.value as WaveUnit)}
              className="text-[11px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-1"
              aria-label="書き出す単位"
            >
              {UNIT_CHOICES.map((u) => (
                <option key={u} value={u}>
                  {unitLabel('acc', u)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onDownload}
              disabled={dlBusy}
              className="inline-flex items-center gap-1 text-[11px] rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {dlBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              CSV（{data.waves.map((w) => w.dir).join('/')}・{data.n} 点）
            </button>
          </div>

          {/* 基準面は断層で変わる。ARV(Vs=400基準)との関係も基準面で向きが変わるので、
              どちらも J-SHIS が 600→400 の換算に使う (Vs比)^0.852 で係数を示す。 */}
          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5">
            詳細法工学的基盤{data.vs != null && `（Vs = ${data.vs.toFixed(0)} m/s）`}
            上の値で、地表の揺れではありません。
            <InfoTip>
              表層地盤による増幅は含みません。J-SHIS の表層地盤増幅率 ARV は Vs = 400 m/s
              基準なので、基準面を合わせずに掛けることはできません。
              {data.vs != null && data.vs > 400 && (
                <>
                  {' '}この波形は Vs = {data.vs.toFixed(0)} m/s 上の値なので、ARV
                  をそのまま掛けると 400 m/s までの増幅が抜け、過小評価になります
                  （Vs = 600 m/s では約 1.41 倍の過小）。
                </>
              )}
              {data.vs != null && data.vs < 400 && (
                <>
                  {' '}この波形は Vs = {data.vs.toFixed(0)} m/s
                  上の値で、ARV の基準面（400 m/s）より浅い側にあります。ARV
                  をそのまま掛けると、400 m/s の層から {data.vs.toFixed(0)} m/s
                  の層までの増幅を二重に数えることになります（同じ換算式なら ARV を約{' '}
                  {Math.pow(400 / data.vs, 0.852).toFixed(2)} で割る）。
                </>
              )}
            </InfoTip>
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            加速度は公開されていないため、速度波形を微分した値です。
            <InfoTip>
              周波数領域で iω を掛けて求めています（差分近似より高周波の落ちが小さく、微分 → 積分で
              元の速度に戻ることを確認しています）。ただし短周期側は統計的グリーン関数法の
              fmax = 6 Hz より高い成分が元から入っていないため、実観測の加速度記録とは高周波の
              中身が違います。また 1.5 Hz 以上は NS と EW が同一波形なので、加速度では成分間の差が
              ほとんど消えます（加速度で方向性は議論できません）。
            </InfoTip>
          </p>
        </div>
      )}
    </div>
  );
};

// 「同じ震源のほか」をはじめから開いておく上限。中央構造線(39本)のように多い震源では
// 畳んでおき、クリックした場所に重なるものだけを見せる。
const OTHERS_OPEN_MAX = 6;

/**
 * 同じ震源の想定地震の一覧。クリックした場所に重なるもの(傾斜角モデル違い・同時活動)を
 * 「この場所に重なる」として上に、残りを「同じ震源のほか」として下に出す。
 * 行にカーソルを合わせると地図でその断層面を強調し、クリックでその想定地震に切り替える。
 * 左罫のグループ色は、地図で同じ震源の断層を括る破線と同じ色。
 */
const GroupSection: React.FC<{
  group: ScenarioGroup;
  hereCodes: string[];
  currentCode: string;
  onSelectFault: (code: string) => void;
  onHoverFault: (code: string | null) => void;
}> = ({ group, hereCodes, currentCode, onSelectFault, onHoverFault }) => {
  const color = groupColor(group.src);
  const byCode = new Map(group.faults.map((f) => [f.code, f]));
  const here = hereCodes.map((c) => byCode.get(c)).filter((f): f is ScenarioGroup['faults'][number] => !!f);
  const hereSet = new Set(here.map((f) => f.code));
  const others = group.faults.filter((f) => !hereSet.has(f.code));
  const [othersOpen, setOthersOpen] = useState(others.length <= OTHERS_OPEN_MAX);
  // 一覧が消えるとき(断層を閉じた・別の震源へ移った)にホバーの強調を残さない
  useEffect(() => () => onHoverFault(null), [onHoverFault]);

  const row = (f: ScenarioGroup['faults'][number]) => (
    <li key={f.code}>
      <button
        type="button"
        onClick={() => onSelectFault(f.code)}
        onMouseEnter={() => onHoverFault(f.code)}
        onMouseLeave={() => onHoverFault(null)}
        onFocus={() => onHoverFault(f.code)}
        onBlur={() => onHoverFault(null)}
        className={
          'w-full text-left text-xs leading-snug px-1.5 py-1 rounded ' +
          (f.code === currentCode
            ? 'bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100 font-medium'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60')
        }
      >
        {f.combo && <span className="text-gray-400">［同時活動］</span>}
        {f.name || f.code}
      </button>
    </li>
  );

  return (
    <div className="rounded-lg border-l-4 pl-2 py-1" style={{ borderColor: color }}>
      <div className="flex items-start gap-1.5">
        <Layers className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color }} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-gray-700 dark:text-gray-200">{group.name}</span>
          <span className="block text-[11px] text-gray-400">
            同じ震源の想定地震 {group.faults.length} 件
            <InfoTip>
              想定地震は「区間 × 傾斜角のモデル × 単独か複数区間の同時活動か」ごとに定義されていて、同じ場所に何件も重なることがあります。
              カーソルを合わせると地図でその断層面を強調します。
            </InfoTip>
          </span>
        </span>
      </div>
      {here.length > 0 && (
        <>
          <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">この場所に重なる</div>
          <ul className="mt-0.5 space-y-0.5">{here.map(row)}</ul>
        </>
      )}
      {others.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOthersOpen((v) => !v)}
            className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            {othersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            同じ震源のほか（{others.length}件）
          </button>
          {othersOpen && <ul className="mt-0.5 space-y-0.5">{others.map(row)}</ul>}
        </>
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
          {/* 波形と想定地震地図が乗っている基準面。600 決め打ちにできない（関東の13断層は
              350）ので、断層ごとの実データを出す。 */}
          <Row
            k={
              <>
                詳細法工学的基盤
                <InfoTip>
                  この断層の波形・想定地震地図が定義されている基準面（S波速度がこの値の層の上面）です。
                  多くの断層は 600 m/s ですが、2020年版の深部地盤モデル改訂で再計算された関東の
                  13断層（立川・深谷・綾瀬川・伊勢原・三浦半島・関谷ほか）は 350 m/s
                  の上面で計算されています。基準面が違うと、表層地盤の増幅率をそのまま掛けられません。
                </InfoTip>
              </>
            }
            v={i.vs != null ? `Vs = ${i.vs.toFixed(0)} m/s` : '—'}
          />
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
