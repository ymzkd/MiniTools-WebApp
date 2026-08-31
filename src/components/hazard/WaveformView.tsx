// 想定地震の波形(インライン SVG)。J-SHIS が想定地震地図の元データとして公開している
// 詳細法工学的基盤上の時刻歴を、成分(NS/EW/UD)ごとに縦に並べて描く(基準面の Vs は断層ごと)。
// 速度と加速度(jiban-api が微分して返す)のどちらも同じ描き方で扱う(単位だけ差し替える)。
//
// 振幅の縦軸は**全成分で共通**にする。成分ごとに正規化すると上下動が水平動と同じ大きさに
// 見えてしまい、比較の意味が失われるため。
//
// 12,000〜36,000点をそのまま <path> にすると重いので、1px 列ごとに最小値と最大値を取って
// 縦線を積む(包絡線)。間引きではないのでピークが消えない。
import React from 'react';
import { waveColor } from './scenarioApi';
import type { WaveComponent } from './scenarioApi';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const INK2 = 'var(--viz-ink2)';
const AXIS = 'var(--viz-axis)';
const GRID = 'var(--viz-grid)';

const PAD_L = 40;   // 振幅目盛り
const PAD_R = 6;
const PAD_T = 12;   // 成分名
const PAD_B = 18;   // 時間軸
const TRACE_H = 54; // 1成分の高さ
const GAP = 10;

interface Props {
  waves: WaveComponent[];
  dt: number;
  /** 見出しに出す単位("cm/s" や "gal") */
  unit: string;
  /** 描画に使える幅(px) */
  width: number;
}

const WaveformView: React.FC<Props> = ({ waves, dt, unit, width }) => {
  const n = Math.max(...waves.map((w) => w.v.length), 0);
  if (!n || !dt) return null;

  // 記録全体を描く。主要動だけ切り出すと揺れの前後が見えず、記録の長さも掴めないため
  const [t0, t1] = [0, n * dt];
  const i0 = 0;
  const i1 = n;

  const plotW = Math.max(160, width - PAD_L - PAD_R);
  const svgW = PAD_L + plotW + PAD_R;
  const svgH = PAD_T + waves.length * (TRACE_H + GAP + PAD_T) - PAD_T + PAD_B;

  // 表示区間での最大振幅。全成分共通の縦軸にする
  let amp = 0;
  for (const w of waves) {
    for (let i = i0; i < i1; i++) amp = Math.max(amp, Math.abs(w.v[i] ?? 0));
  }
  amp = amp || 1;

  const ticks = timeTicks(t0, t1);

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ fontFamily: FONT, display: 'block' }}
      role="img"
      aria-label={`工学的基盤上の波形（${unit}）`}
    >
      {waves.map((w, wi) => {
        const top = PAD_T + wi * (TRACE_H + GAP + PAD_T);
        const mid = top + TRACE_H / 2;
        const last = wi === waves.length - 1;
        return (
          <g key={w.dir}>
            <text x={PAD_L} y={top - 3} fontSize={9.5} fill={INK2}>
              {w.dir} ／ 最大 {fmtPeak(w.peak)} {unit}
            </text>
            {/* 目盛り: 0 と ±最大 */}
            <line x1={PAD_L} y1={mid} x2={PAD_L + plotW} y2={mid} stroke={GRID} strokeWidth={0.8} />
            <text x={PAD_L - 4} y={top + 4} fontSize={8.5} fill={INK2} textAnchor="end">
              {fmtAxis(amp)}
            </text>
            <text x={PAD_L - 4} y={mid + 3} fontSize={8.5} fill={INK2} textAnchor="end">
              0
            </text>
            <text x={PAD_L - 4} y={top + TRACE_H} fontSize={8.5} fill={INK2} textAnchor="end">
              −{fmtAxis(amp)}
            </text>
            <path
              d={envelope(w.v, i0, i1, plotW, TRACE_H / 2, amp)}
              transform={`translate(${PAD_L}, ${mid})`}
              stroke={waveColor(w.dir)}
              strokeWidth={0.9}
              fill="none"
              shapeRendering="crispEdges"
            />
            <rect
              x={PAD_L}
              y={top}
              width={plotW}
              height={TRACE_H}
              fill="none"
              stroke={AXIS}
              strokeWidth={0.7}
            />
            {/* 時間軸は一番下の成分にだけ付ける(3段に3本引くと目がうるさい) */}
            {last &&
              ticks.map((t) => {
                const x = PAD_L + ((t - t0) / (t1 - t0)) * plotW;
                return (
                  <g key={t}>
                    <line x1={x} y1={top + TRACE_H} x2={x} y2={top + TRACE_H + 3} stroke={AXIS} strokeWidth={0.8} />
                    <text x={x} y={top + TRACE_H + 12} fontSize={9} fill={INK2} textAnchor="middle">
                      {t}
                    </text>
                  </g>
                );
              })}
          </g>
        );
      })}
      <text x={svgW - PAD_R} y={svgH - 8} fontSize={8.5} fill={INK2} textAnchor="end">
        破壊開始からの経過 秒
      </text>
    </svg>
  );
};

/**
 * 1px 列ごとの [min, max] を縦線で積んだパス。
 * 点数が幅の何倍もあるので、折れ線にすると描けない量になるうえピークが間引きで消える。
 */
function envelope(v: number[], i0: number, i1: number, w: number, half: number, amp: number): string {
  const cols = Math.max(1, Math.round(w));
  const per = (i1 - i0) / cols;
  const k = half / amp;
  const out: string[] = [];
  for (let c = 0; c < cols; c++) {
    const a = i0 + Math.floor(c * per);
    const b = Math.min(i1, i0 + Math.floor((c + 1) * per) + 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = a; i < b; i++) {
      const x = v[i];
      if (x === undefined) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    if (lo === Infinity) continue;
    const x = c + 0.5;
    out.push(`M${x} ${(-hi * k).toFixed(2)}V${(-lo * k).toFixed(2)}`);
  }
  return out.join('');
}

/** 最大値の表記。単位を変えると桁が大きく振れる(gal で3桁、m/s² で小数)ので有効数字で出す。 */
function fmtPeak(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}

/** 振幅目盛りの表記。ラベル幅(PAD_L)に収まるよう短く。 */
function fmtAxis(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(a >= 10 ? 0 : 1);
  return v.toPrecision(2);
}

/** 時間軸の目盛り。表示区間の長さから 1/2/5/10/20/30/60 秒刻みを選ぶ。 */
function timeTicks(t0: number, t1: number): number[] {
  const span = t1 - t0;
  const step = [1, 2, 5, 10, 20, 30, 60].find((s) => span / s <= 8) ?? 60;
  const out: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-6; t += step) out.push(Math.round(t));
  return out;
}

export default WaveformView;
