// J-SHIS 地震動ハザードのグラフ(インライン SVG)。
//   ResponseSpectrumChart … 加速度応答スペクトル(周期 log軸 × Sa、50年超過確率4本の折れ線)
//   ContributionChart     … 周期ごとの震源別寄与率(100%積み上げ棒)
// 色は index.css の CSS 変数(--viz-*)で、ライト/ダークを切替える。系列色は jshisApi.ts の
// スロット割当(順位順固定)に従い、地図のハイライトと一致させる。
import React, { useMemo, useRef, useState } from 'react';
import {
  JSHIS_PERIODS,
  JSHIS_PERIOD_KEYS,
  JSHIS_PROB_KEYS,
  PROB_LABEL,
  PROB_COLOR_VAR,
  SERIES_VARS,
  OTHER_VAR,
  contribAt,
} from './jshisApi';
import type { ContribResult, PeriodKey, ProbKey, SourceSlot } from './jshisApi';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function niceLogTicks(lo: number, hi: number): number[] {
  // 1-2-5 系列で lo..hi をカバー
  const out: number[] = [];
  const e0 = Math.floor(Math.log10(lo));
  const e1 = Math.ceil(Math.log10(hi));
  for (let e = e0; e <= e1; e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

function fmtNum(v: number): string {
  if (v >= 1000) return v.toLocaleString('ja-JP', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(0);
  return v.toFixed(1);
}

// ---------------------------------------------------------------- 応答スペクトル
interface SpectrumChartProps {
  sa: Record<string, (number | null)[]>;
  selectedPeriod: PeriodKey;
  onSelectPeriod?: (p: PeriodKey) => void;
}

// 縦軸は対数固定。Sa は周期と超過確率で1桁以上開くため、線形だと短周期側に潰れて読めない。
export const ResponseSpectrumChart: React.FC<SpectrumChartProps> = ({ sa, selectedPeriod, onSelectPeriod }) => {
  const W = 340;
  const H = 210;
  const ML = 44;
  const MR = 34;
  const MT = 10;
  const MB = 26;
  const PW = W - ML - MR;
  const PH = H - MT - MB;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const xs = useMemo(() => {
    const lx0 = Math.log10(0.1) - 0.06;
    const lx1 = Math.log10(5) + 0.06;
    return JSHIS_PERIODS.map((t) => ML + ((Math.log10(t) - lx0) / (lx1 - lx0)) * PW);
  }, [PW]);

  const { yOf, yTicks, yMin, yMax } = useMemo(() => {
    const vals: number[] = [];
    for (const pk of JSHIS_PROB_KEYS) for (const v of sa[pk] ?? []) if (v != null && v > 0) vals.push(v);
    let lo = vals.length ? Math.min(...vals) : 10;
    let hi = vals.length ? Math.max(...vals) : 1000;
    // 下は 1-2-5 の一段下、上は一段上に丸める
    const down = (v: number) => {
      const e = Math.floor(Math.log10(v));
      const m = v / 10 ** e;
      const b = m >= 5 ? 5 : m >= 2 ? 2 : 1;
      return b * 10 ** e;
    };
    const up = (v: number) => {
      const e = Math.floor(Math.log10(v));
      const m = v / 10 ** e;
      const b = m > 5 ? 10 : m > 2 ? 5 : m > 1 ? 2 : 1;
      return b * 10 ** e;
    };
    lo = down(lo);
    hi = up(hi);
    if (hi <= lo) hi = lo * 10;
    const l0 = Math.log10(lo);
    const l1 = Math.log10(hi);
    return {
      yOf: (v: number) => MT + PH - ((Math.log10(v) - l0) / (l1 - l0)) * PH,
      yTicks: niceLogTicks(lo, hi),
      yMin: lo,
      yMax: hi,
    };
  }, [sa, PH]);

  const series = JSHIS_PROB_KEYS.map((pk) => {
    const vals = sa[pk] ?? [];
    const pts = vals.map((v, i) => (v != null && v > 0 ? { x: xs[i], y: yOf(v), v, i } : null));
    const d = pts
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const last = [...pts].reverse().find((p) => p != null) ?? null;
    return { pk, pts, d, last };
  });

  // 右端の直接ラベル: 重なりを 11px 以上に離す
  const labels = useMemo(() => {
    const ls = series
      .filter((s) => s.last)
      .map((s) => ({ pk: s.pk, y: s.last!.y }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 11) ls[i].y = ls[i - 1].y + 11;
    for (let i = ls.length - 2; i >= 0; i--) if (ls[i + 1].y - ls[i].y < 11) ls[i].y = ls[i + 1].y - 11;
    return ls;
  }, [series]);

  const idxFromClientX = (clientX: number): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(x - vx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  const selIdx = JSHIS_PERIOD_KEYS.indexOf(selectedPeriod);
  const hi = hoverIdx;

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label="加速度応答スペクトル（周期と50年超過確率ごとの応答加速度）"
        onMouseMove={(e) => setHoverIdx(idxFromClientX(e.clientX))}
        onMouseLeave={() => setHoverIdx(null)}
        onClick={(e) => onSelectPeriod?.(JSHIS_PERIOD_KEYS[idxFromClientX(e.clientX)])}
        style={{ cursor: onSelectPeriod ? 'pointer' : 'default', fontFamily: FONT }}
      >
        {/* 目盛線 */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={ML} x2={ML + PW} y1={yOf(t)} y2={yOf(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={ML - 5} y={yOf(t) + 3} fontSize={8.5} textAnchor="end" fill="var(--viz-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {xs.map((x, i) => (
          <g key={`x${i}`}>
            <line x1={x} x2={x} y1={MT} y2={MT + PH} stroke="var(--viz-grid)" strokeWidth={1} />
            <text
              x={x}
              y={MT + PH + 12}
              fontSize={8.5}
              textAnchor="middle"
              fill={i === selIdx ? 'var(--viz-ink)' : 'var(--viz-muted)'}
              fontWeight={i === selIdx ? 700 : 400}
            >
              {JSHIS_PERIODS[i]}
            </text>
          </g>
        ))}
        {/* 軸 */}
        <line x1={ML} x2={ML + PW} y1={MT + PH} y2={MT + PH} stroke="var(--viz-axis)" strokeWidth={1} />
        <line x1={ML} x2={ML} y1={MT} y2={MT + PH} stroke="var(--viz-axis)" strokeWidth={1} />
        <text x={ML + PW / 2} y={H - 2} fontSize={8.5} textAnchor="middle" fill="var(--viz-ink2)">
          周期 T (s)
        </text>
        <text
          x={9}
          y={MT + PH / 2}
          fontSize={8.5}
          textAnchor="middle"
          fill="var(--viz-ink2)"
          transform={`rotate(-90 9 ${MT + PH / 2})`}
        >
          Sa (cm/s²)
        </text>
        {/* 選択中の周期(影響度グラフと連動) */}
        {selIdx >= 0 && (
          <line
            x1={xs[selIdx]}
            x2={xs[selIdx]}
            y1={MT}
            y2={MT + PH}
            stroke="var(--viz-ink2)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />
        )}
        {/* 系列 */}
        {series.map((s) => (
          <path key={s.pk} d={s.d} fill="none" stroke={PROB_COLOR_VAR[s.pk]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* ホバー: 十字線と各系列のマーカー */}
        {hi != null && (
          <g>
            <line x1={xs[hi]} x2={xs[hi]} y1={MT} y2={MT + PH} stroke="var(--viz-ink2)" strokeWidth={1} opacity={0.5} />
            {series.map((s) => {
              const p = s.pts[hi];
              return p ? (
                <circle key={s.pk} cx={p.x} cy={p.y} r={4} fill={PROB_COLOR_VAR[s.pk]} stroke="var(--viz-surface)" strokeWidth={2} />
              ) : null;
            })}
          </g>
        )}
        {/* 直接ラベル(右端) */}
        {labels.map((l) => (
          <text key={l.pk} x={ML + PW + 5} y={l.y + 3} fontSize={8.5} fill="var(--viz-ink2)" fontWeight={600}>
            {PROB_LABEL[l.pk]}
          </text>
        ))}
      </svg>
      {hi != null && (
        <div
          className="absolute top-1 pointer-events-none rounded-md shadow px-2 py-1 text-[11px] leading-snug bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700"
          style={{
            left: (xs[hi] / W) * 100 < 55 ? `${(xs[hi] / W) * 100 + 3}%` : undefined,
            right: (xs[hi] / W) * 100 >= 55 ? `${100 - (xs[hi] / W) * 100 + 3}%` : undefined,
          }}
        >
          <div className="font-semibold text-gray-900 dark:text-gray-100">T = {JSHIS_PERIODS[hi]} s</div>
          {JSHIS_PROB_KEYS.map((pk) => {
            const v = sa[pk]?.[hi];
            return (
              <div key={pk} className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 tabular-nums">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PROB_COLOR_VAR[pk] }} />
                <span className="w-7">{PROB_LABEL[pk]}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{v != null ? fmtNum(v) : '—'}</span>
                <span className="text-gray-400">cm/s²</span>
              </div>
            );
          })}
        </div>
      )}
      <span className="sr-only">
        縦軸範囲 {fmtNum(yMin)}〜{fmtNum(yMax)} cm/s²
      </span>
    </div>
  );
};

// ---------------------------------------------------------------- 震源別寄与率
interface ContributionChartProps {
  contrib: ContribResult;
  slots: SourceSlot[];
  prob: ProbKey;
  selectedPeriod: PeriodKey;
  onSelectPeriod: (p: PeriodKey) => void;
}

export const ContributionChart: React.FC<ContributionChartProps> = ({ contrib, slots, prob, selectedPeriod, onSelectPeriod }) => {
  const W = 340;
  const H = 168;
  const ML = 34;
  const MR = 6;
  const MT = 8;
  const MB = 24;
  const PW = W - ML - MR;
  const PH = H - MT - MB;
  const colW = PW / JSHIS_PERIODS.length;
  const barW = colW * 0.62;
  const GAP = 2; // 積み上げ区間の隙間(表面色)
  const [hover, setHover] = useState<{ pi: number; code: string; share: number; x: number; y: number } | null>(null);

  const columns = JSHIS_PERIOD_KEYS.map((pk, pi) => {
    const row = contribAt(contrib, prob, pk);
    const assigned = new Set(slots.map((s) => s.code));
    let other = 0;
    for (const [code, share] of Object.entries(row)) if (!assigned.has(code)) other += share;
    const segs: { code: string; share: number; color: string; name: string }[] = slots.map((s) => ({
      code: s.code,
      share: row[s.code] ?? 0,
      color: SERIES_VARS[s.slot],
      name: s.source.name,
    }));
    if (other > 0.0005) segs.push({ code: '__other', share: other, color: OTHER_VAR, name: 'その他' });
    // 下から積む(スロット順)。合計 1 に正規化(丸め誤差対策)
    const total = segs.reduce((a, b) => a + b.share, 0) || 1;
    let acc = 0;
    const rects = segs
      .filter((s) => s.share > 0)
      .map((s) => {
        const h = (s.share / total) * PH;
        const y1 = MT + PH - acc - h;
        acc += h;
        return { ...s, y: y1, h };
      });
    return { pk, pi, x: ML + colW * pi + (colW - barW) / 2, rects };
  });

  const selIdx = JSHIS_PERIOD_KEYS.indexOf(selectedPeriod);

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label="周期ごとの震源別寄与率（100%積み上げ棒）"
        style={{ fontFamily: FONT }}
        onMouseLeave={() => setHover(null)}
      >
        {/* 選択列の帯 */}
        {selIdx >= 0 && <rect x={ML + colW * selIdx} y={MT - 4} width={colW} height={PH + 4} fill="var(--viz-grid)" opacity={0.55} rx={3} />}
        {/* 目盛 */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={ML} x2={ML + PW} y1={MT + PH - t * PH} y2={MT + PH - t * PH} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={ML - 5} y={MT + PH - t * PH + 3} fontSize={8.5} textAnchor="end" fill="var(--viz-muted)">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line x1={ML} x2={ML + PW} y1={MT + PH} y2={MT + PH} stroke="var(--viz-axis)" strokeWidth={1} />
        {/* 棒 */}
        {columns.map((c) => (
          <g key={c.pk} style={{ cursor: 'pointer' }} onClick={() => onSelectPeriod(c.pk)}>
            {/* 列全体のヒット領域 */}
            <rect x={ML + colW * c.pi} y={MT} width={colW} height={PH + MB} fill="transparent" />
            {c.rects.map((r, k) => {
              const isTop = k === c.rects.length - 1;
              const y = r.y + (isTop ? 0 : GAP / 2);
              const h = Math.max(0, r.h - (isTop ? GAP / 2 : GAP));
              const rad = Math.min(3, h / 2, barW / 2);
              const d = isTop
                ? `M${c.x},${y + h} V${y + rad} Q${c.x},${y} ${c.x + rad},${y} H${c.x + barW - rad} Q${c.x + barW},${y} ${c.x + barW},${y + rad} V${y + h} Z`
                : `M${c.x},${y} H${c.x + barW} V${y + h} H${c.x} Z`;
              return (
                <path
                  key={r.code}
                  d={d}
                  fill={r.color}
                  opacity={hover && (hover.code !== r.code) ? 0.45 : 1}
                  onMouseEnter={() => setHover({ pi: c.pi, code: r.code, share: r.share, x: c.x + barW / 2, y })}
                  onMouseMove={() => setHover({ pi: c.pi, code: r.code, share: r.share, x: c.x + barW / 2, y })}
                >
                  <title>
                    {r.name}: {(r.share * 100).toFixed(1)}%
                  </title>
                </path>
              );
            })}
            <text
              x={ML + colW * c.pi + colW / 2}
              y={MT + PH + 12}
              fontSize={8.5}
              textAnchor="middle"
              fill={c.pi === selIdx ? 'var(--viz-ink)' : 'var(--viz-muted)'}
              fontWeight={c.pi === selIdx ? 700 : 400}
            >
              {JSHIS_PERIODS[c.pi]}
            </text>
          </g>
        ))}
        <text x={ML + PW / 2} y={H - 2} fontSize={8.5} textAnchor="middle" fill="var(--viz-ink2)">
          周期 T (s) ・ クリックで周期を選択
        </text>
      </svg>
      {hover && (
        <div
          className="absolute pointer-events-none rounded-md shadow px-2 py-1 text-[11px] leading-snug bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700 max-w-[70%]"
          style={{
            top: `${(hover.y / H) * 100}%`,
            left: (hover.x / W) * 100 < 55 ? `${(hover.x / W) * 100 + 4}%` : undefined,
            right: (hover.x / W) * 100 >= 55 ? `${100 - (hover.x / W) * 100 + 4}%` : undefined,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="text-gray-500 dark:text-gray-400">T = {JSHIS_PERIODS[hover.pi]} s</div>
          <div className="text-gray-900 dark:text-gray-100">
            {columns[hover.pi].rects.find((r) => r.code === hover.code)?.name}
            <span className="ml-1 font-semibold tabular-nums">{(hover.share * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
