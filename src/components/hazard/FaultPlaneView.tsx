// 想定地震の断層面展開図(インライン SVG)。
// 断層面を走向方向 × 傾斜方向に開いた図で、要素断層(2kmメッシュ)をアスペリティ番号で塗り分け、
// アスペリティの外形と破壊開始点(★)を重ねる。ケースの違い(アスペリティ配置・破壊開始点)は
// この図の差として現れるので、ケースを切り替えて見比べるのが本来の使い方。
//
// 面・要素・アスペリティの外形はどれも多角形で描く。屈曲部の面は長方形とは限らず(台形・三角形)、
// 甑断層帯のつなぎ目の面のように要素が 2km 格子に乗らない面もある(jiban-api の
// build_scenario_faults.py が面の外形 outline と要素のタイル tiles を出す)。
//
// 屈曲断層はセグメントごとに縦積みする。全セグメントを同じスケールで描き、パネル幅には
// 最長セグメントを合わせる(セグメントごとに伸縮させると長さの比較ができなくなるため)。
// 実データの最大は中央構造線の全区間同時活動で 11セグメント・全長456km・要素2025個。
import React, { useId } from 'react';
import { aspColor, depthAt, fmtStrike, planeCells, planeExtent, planeHasElements, planeOutline } from './scenarioApi';
import type { ScenarioCase, ScenarioPlane } from './scenarioApi';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const BG_FILL = 'var(--viz-grid)';
const INK = 'var(--viz-ink)';
const INK2 = 'var(--viz-ink2)';
const AXIS = 'var(--viz-axis)';
// 断層外のマス(屈曲部で切り落とされたマス)。J-SHIS のパラメータ表の図のグレーにあたる。
// 背景領域(断層の一部)と取り違えないよう、中間のグレーに斜線を重ねる
const OUT_FILL = 'var(--viz-muted)';

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
  // 斜線パターンの id。useId の ":" は url(#…) で扱いにくいので落とす
  const hatchId = `fpv-out-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // 要素断層の乗らない面は描かない。ただし asp.p / des.p は kase.planes の元の番号なので、
  // 間引いた後の並び順で照合すると後ろの面へ1枚ずつずれる(点線のアスペリティ外形が別セグメントに
  // はみ出し、破壊開始点が消える)。元の番号を持ち回る
  const shown = kase.planes
    .map((plane, idx) => ({ plane, idx }))
    .filter(({ plane }) => planeHasElements(plane));
  const planes = shown.map((s) => s.plane);
  if (!planes.length) return null;

  // 大きさは面の外形と要素の格子を合わせた範囲で取る(台形の面では格子が外形からはみ出す)。
  // 走向方向の原点(s=0)は全セグメントでそろえ、手前にはみ出す格子のぶんだけ右へ寄せる
  const exts = planes.map(planeExtent);
  const left = Math.min(...exts.map((e) => e.s0));
  const spanL = Math.max(...exts.map((e) => e.s1)) - left;
  const inner = Math.max(120, width - PAD_L - PAD_R);
  // 全セグメント共通のスケール。最長セグメントが収まる倍率にし、細かすぎるときだけ下限で止める
  const scale = Math.max(inner / spanL, MIN_PX_PER_KM);
  const svgW = PAD_L + spanL * scale + PAD_R;
  const ox = -left * scale;

  const heights = exts.map((e) => (e.w1 - e.w0) * scale);
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
        <defs>
          <pattern id={hatchId} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={5} height={5} fill={OUT_FILL} fillOpacity={0.45} />
            <line x1={0} y1={0} x2={0} y2={5} stroke="var(--viz-surface)" strokeWidth={1.4} strokeOpacity={0.55} />
          </pattern>
        </defs>
        {shown.map(({ plane, idx }, pi) => (
          <PlaneBlock
            key={idx}
            plane={plane}
            index={idx}
            label={pi + 1}
            showIndex={multi}
            top={tops[pi]}
            ox={ox}
            scale={scale}
            kase={kase}
            hatchId={hatchId}
          />
        ))}
      </svg>
    </div>
  );
};

const PlaneBlock: React.FC<{
  plane: ScenarioPlane;
  /** kase.planes での番号(asp.p / des.p と照合する) */
  index: number;
  /** 見出しに出すセグメント番号(描いた面だけを1から数える) */
  label: number;
  showIndex: boolean;
  /** 描画範囲の上端の y(px) */
  top: number;
  /** 面内座標 s=0 の x(px, PAD_L から) */
  ox: number;
  scale: number;
  kase: ScenarioCase;
  /** 断層外のマスの斜線パターンの id */
  hatchId: string;
}> = ({ plane, index, label, showIndex, top, ox, scale, kase, hatchId }) => {
  const h = plane.W * scale;
  const ext = planeExtent(plane);
  const pts = (ps: [number, number][]) => ps.map(([s, w]) => `${s * scale},${w * scale}`).join(' ');
  // w=0(面の上端)の y。格子が上にはみ出す面ではそのぶん下げる
  const oy = -ext.w0 * scale;
  // 走向方向の目盛りは、外形からはみ出した格子にかぶらないよう描画範囲の下端に置く
  const hb = ext.w1 * scale;
  const cells = planeCells(plane);
  const asps = kase.asp.filter((a) => a.p === index);
  const des = kase.des && kase.des.p === index ? kase.des : null;
  // 走向方向の目盛り。10km 刻みを基本に、短い断層は 5km 刻み
  const step = plane.L > 60 ? 20 : plane.L > 24 ? 10 : 5;
  const ticks: number[] = [];
  for (let s = 0; s <= plane.L + 1e-6; s += step) ticks.push(s);

  return (
    <g transform={`translate(${PAD_L + ox}, ${top + oy})`}>
      {/* 見出し: セグメント諸元 */}
      <text x={-ox} y={-oy - 4} fontSize={9.5} fill={INK2}>
        {showIndex ? `セグメント${label} ／ ` : ''}
        L {plane.L.toFixed(0)} km ／ W {plane.W.toFixed(0)} km ／ 走向 {fmtStrike(plane.strike)} ／ 傾斜 {plane.dip.toFixed(0)}°
      </text>

      {/* 要素断層。背景領域は薄いグレー、アスペリティは番号ごとの色、断層外のマスは斜線入りのグレー */}
      {cells.map((c, i) => (
        <polygon
          key={i}
          points={pts(c.pts)}
          fill={c.out ? `url(#${hatchId})` : c.asp ? aspColor(c.asp) : BG_FILL}
          fillOpacity={c.out ? 1 : c.asp ? 0.75 : 0.55}
          stroke="var(--viz-surface)"
          strokeWidth={0.4}
        />
      ))}

      {/* アスペリティの外形。同じ番号の要素を合わせた形(jiban-api が作る)で、塗りと一致する。
          塗りだけだと同じ色が続いて境界が見えにくいので明示する */}
      {asps.map((a, i) => (
        <polygon
          key={i}
          points={pts(a.s.map((s, k) => [s, a.w[k]] as [number, number]))}
          fill="none"
          stroke={INK}
          strokeWidth={1.1}
          strokeDasharray="3 2"
          strokeLinejoin="round"
        />
      ))}

      {/* 断層面の外形 */}
      <polygon points={pts(planeOutline(plane))} fill="none" stroke={AXIS} strokeWidth={1} />

      {/* 破壊開始点。レシピではアスペリティの外側の隅・深部側に置かれる */}
      {des && <Star x={des.s * scale} y={des.w * scale} />}

      {/* 走向方向の目盛り(km) */}
      {ticks.map((s) => (
        <g key={s}>
          <line x1={s * scale} y1={hb} x2={s * scale} y2={hb + 3} stroke={AXIS} strokeWidth={0.8} />
          <text x={s * scale} y={hb + 12} fontSize={9} fill={INK2} textAnchor="middle">
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
        x={-PAD_L - ox + 9}
        y={h / 2}
        fontSize={8.5}
        fill={INK2}
        textAnchor="middle"
        transform={`rotate(-90, ${-PAD_L - ox + 9}, ${h / 2})`}
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
