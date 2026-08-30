// 想定地震の断層面展開図(インライン SVG)。
// 断層面を走向方向 × 傾斜方向に開いた図で、要素断層(2kmメッシュ)をアスペリティ番号で塗り分け、
// アスペリティの外形と破壊開始点(★)を重ねる。ケースの違い(アスペリティ配置・破壊開始点)は
// この図の差として現れるので、ケースを切り替えて見比べるのが本来の使い方。
//
// 屈曲断層はセグメントごとに縦積みする。全セグメントを同じスケールで描き、パネル幅には
// 最長セグメントを合わせる(セグメントごとに伸縮させると長さの比較ができなくなるため)。
// 実データの最大は中央構造線の全区間同時活動で 11セグメント・全長456km・要素2025個。
import React from 'react';
import { aspColor, depthAt, fmtStrike, planeCells } from './scenarioApi';
import type { ScenarioCase, ScenarioPlane } from './scenarioApi';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const BG_FILL = 'var(--viz-grid)';
const INK = 'var(--viz-ink)';
const INK2 = 'var(--viz-ink2)';
const AXIS = 'var(--viz-axis)';

// 図の余白。左は深さ目盛り、下は走向方向の目盛り、上はセグメント見出しに使う。
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 15;
const PAD_B = 18;
const GAP = 14;             // セグメント間の余白
const MIN_PX_PER_KM = 1.6;  // これを下回るなら横スクロールに逃がす(中央構造線級の全長対策)

interface Props {
  kase: ScenarioCase;
  /** 描画に使える幅(px)。パネル幅から算出して渡す */
  width: number;
}

const FaultPlaneView: React.FC<Props> = ({ kase, width }) => {
  const planes = kase.planes.filter((p) => p.nx > 0 && p.ny > 0);
  if (!planes.length) return null;

  const maxL = Math.max(...planes.map((p) => p.L));
  const inner = Math.max(120, width - PAD_L - PAD_R);
  // 全セグメント共通のスケール。最長セグメントが収まる倍率にし、細かすぎるときだけ下限で止める
  const scale = Math.max(inner / maxL, MIN_PX_PER_KM);
  const svgW = PAD_L + maxL * scale + PAD_R;

  const heights = planes.map((p) => p.W * scale);
  const svgH = PAD_T + heights.reduce((a, b) => a + b + GAP + PAD_B, 0);

  // セグメントの縦位置(見出しぶんの PAD_T と目盛りぶんの PAD_B を挟む)
  const tops: number[] = [];
  let y = PAD_T;
  for (const h of heights) {
    tops.push(y);
    y += h + PAD_B + GAP;
  }

  const multi = planes.length > 1;
  return (
    <div className="overflow-x-auto slim-scrollbar">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ fontFamily: FONT, display: 'block' }}
        role="img"
        aria-label="断層面の展開図"
      >
        {planes.map((plane, pi) => (
          <PlaneBlock
            key={pi}
            plane={plane}
            index={pi}
            showIndex={multi}
            top={tops[pi]}
            scale={scale}
            kase={kase}
          />
        ))}
      </svg>
    </div>
  );
};

const PlaneBlock: React.FC<{
  plane: ScenarioPlane;
  index: number;
  showIndex: boolean;
  top: number;
  scale: number;
  kase: ScenarioCase;
}> = ({ plane, index, showIndex, top, scale, kase }) => {
  const w = plane.L * scale;
  const h = plane.W * scale;
  const cells = planeCells(plane);
  const asps = kase.asp.filter((a) => a.p === index);
  const des = kase.des && kase.des.p === index ? kase.des : null;
  // 走向方向の目盛り。10km 刻みを基本に、短い断層は 5km 刻み
  const step = plane.L > 60 ? 20 : plane.L > 24 ? 10 : 5;
  const ticks: number[] = [];
  for (let s = 0; s <= plane.L + 1e-6; s += step) ticks.push(s);

  return (
    <g transform={`translate(${PAD_L}, ${top})`}>
      {/* 見出し: セグメント諸元 */}
      <text x={0} y={-4} fontSize={9.5} fill={INK2}>
        {showIndex ? `セグメント${index + 1} ／ ` : ''}
        L {plane.L.toFixed(0)} km ／ W {plane.W.toFixed(0)} km ／ 走向 {fmtStrike(plane.strike)} ／ 傾斜 {plane.dip.toFixed(0)}°
      </text>

      {/* 要素断層。背景領域は薄いグレー、アスペリティは番号ごとの色 */}
      {cells.map((c, i) => (
        <rect
          key={i}
          x={c.x * scale}
          y={c.y * scale}
          width={c.w * scale}
          height={c.h * scale}
          fill={c.asp ? aspColor(c.asp) : BG_FILL}
          fillOpacity={c.asp ? 0.75 : 0.55}
          stroke="var(--viz-surface)"
          strokeWidth={0.4}
        />
      ))}

      {/* アスペリティの外形(CSV の ASP 矩形。要素の塗りと一致するが、境界を明示する) */}
      {asps.map((a, i) => {
        const x0 = Math.min(...a.s) * scale;
        const x1 = Math.max(...a.s) * scale;
        const y0 = Math.min(...a.w) * scale;
        const y1 = Math.max(...a.w) * scale;
        return (
          <rect
            key={i}
            x={x0}
            y={y0}
            width={x1 - x0}
            height={y1 - y0}
            fill="none"
            stroke={INK}
            strokeWidth={1.1}
            strokeDasharray="3 2"
          />
        );
      })}

      {/* 断層面の外形 */}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke={AXIS} strokeWidth={1} />

      {/* 破壊開始点。レシピではアスペリティの外側の隅・深部側に置かれる */}
      {des && <Star x={des.s * scale} y={des.w * scale} />}

      {/* 走向方向の目盛り(km) */}
      {ticks.map((s) => (
        <g key={s}>
          <line x1={s * scale} y1={h} x2={s * scale} y2={h + 3} stroke={AXIS} strokeWidth={0.8} />
          <text x={s * scale} y={h + 12} fontSize={9} fill={INK2} textAnchor="middle">
            {s.toFixed(0)}
          </text>
        </g>
      ))}
      {/* 深さ目盛り(上端・下端)。展開図の縦軸は傾斜方向距離だが、読みたいのは深さなので併記する */}
      <text x={-5} y={4} fontSize={9} fill={INK2} textAnchor="end">
        {depthAt(plane, 0).toFixed(0)}
      </text>
      <text x={-5} y={h} fontSize={9} fill={INK2} textAnchor="end">
        {depthAt(plane, plane.W).toFixed(0)}
      </text>
      <text
        x={-PAD_L + 9}
        y={h / 2}
        fontSize={8.5}
        fill={INK2}
        textAnchor="middle"
        transform={`rotate(-90, ${-PAD_L + 9}, ${h / 2})`}
      >
        深さ km
      </text>
    </g>
  );
};

/** 破壊開始点の★。白フチを付けてアスペリティの色の上でも見えるようにする。 */
const Star: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const r = 6;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${x + rr * Math.cos(a)},${y + rr * Math.sin(a)}`);
  }
  const d = pts.join(' ');
  return (
    <>
      <polygon points={d} fill="#ffffff" stroke="#ffffff" strokeWidth={2.5} strokeLinejoin="round" />
      <polygon points={d} fill={INK} />
    </>
  );
};

export default FaultPlaneView;
