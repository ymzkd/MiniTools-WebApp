// J-SHIS「震源断層を特定した地震動予測地図」(想定地震) の取得と、展開図を描くための整形。
// jiban-api /jshis/scenario を同一オリジン /api/jshis/scenario で叩く(server.js がプロキシ)。
//
// データは jiban-api にビルド時同梱された静的バンドル(全国253断層・908ケースで 0.7MB)なので
// 即時に返る。震源別影響度(contrib)のような取得待ちは無い。
//
// 1ケースは「断層面(planes) × アスペリティ(asp) × 破壊開始点(des)」で、屈曲断層は面が複数になる。
// 要素断層の座標は持たず、面ごとの nx×ny グリッドとアスペリティ番号列(aspn)だけを持つ
// (要素は面上の 2km 等間隔格子なので、これで元の配置が完全に復元できる)。

/** 断層面1枚。corners は [経度, 緯度, 深さm] の4頂点(上端2点 → 下端2点)。 */
export interface ScenarioPlane {
  corners: [number, number, number][];
  /** 走向方向の長さ / 傾斜方向の幅 (km) */
  L: number;
  W: number;
  /** 走向(度・北から時計回り) / 傾斜角(度) / 上端深さ(km) */
  strike: number;
  dip: number;
  ztop: number;
  /** 要素断層グリッドの列数(走向方向)・行数(傾斜方向) */
  nx: number;
  ny: number;
  /** 行優先のアスペリティ番号列。'0'=背景領域、'1'以上=アスペリティ番号(36進1桁) */
  aspn: string;
}

/** アスペリティ矩形。p=断層面の番号、s/w=面内座標(走向方向km / 傾斜方向km)の4頂点。 */
export interface ScenarioAsp {
  p: number;
  s: number[];
  w: number[];
}

/** 破壊開始点。面内座標(p/s/w)と実座標(緯度経度・深さm)。 */
export interface ScenarioDes {
  p: number;
  s: number;
  w: number;
  lat: number;
  lng: number;
  dep: number;
}

export interface ScenarioCase {
  /** 断層モデルの作成日(CSV の DATE) */
  date: string;
  /** 要素断層の数 */
  nelem: number;
  planes: ScenarioPlane[];
  asp: ScenarioAsp[];
  des: ScenarioDes | null;
  /** 要素断層が断層面から離れている最大距離(km)。品質の目安で、通常 0 */
  fit: number;
}

/** getLteInfo 由来の断層情報。旧コードの断層では確率などが空になる。 */
export interface ScenarioInfo {
  /** 30年 / 50年発生確率 (%) */
  t30p: number | null;
  t50p: number | null;
  /** 平均活動間隔(年) / 最新活動からの経過年 */
  avract: number | null;
  newact: number | null;
  /** 発生確率の評価モデル(BPT / POI) */
  proc: string | null;
  /** マグニチュード表記("7(Mw)" のような生の文字列) */
  mag: string | null;
  /** 地震本部の長期評価ページ */
  link: string | null;
  /** 特性化震源モデル一覧表(DEF.pdf)のパス。J-SHIS のドメイン相対 */
  pdf: string | null;
}

export interface ScenarioFault {
  code: string;
  /** データのバージョン(V1〜V4) */
  ver: string;
  name: string;
  /** 地図の震源コード。地図に無い断層は "S:<断層コード>" */
  src: string;
  /** 旧断層コードのデータか(2024年版の震源モデルにこのコードが無い) */
  legacy: boolean;
  /** 複数区間が同時に活動するシナリオか。地図には描かず、重なりとして選択肢に出る */
  combo: boolean;
  /** 区間キー "断層帯番号-区間コード"。傾斜角モデル違いは同じ区間キーになる */
  seg: string;
  info: ScenarioInfo;
  cases: Record<string, ScenarioCase>;
}

const JSHIS_ORIGIN = 'https://www.j-shis.bosai.go.jp';

/** DEF.pdf の絶対URL。パスが無ければ null。 */
export function pdfUrl(info: ScenarioInfo): string | null {
  return info.pdf ? JSHIS_ORIGIN + info.pdf : null;
}

/** 震源グループ。断層はまとめず、「どれが同じ震源か」だけを持つ。 */
export interface ScenarioGroup {
  /** 震源コード。影響度パネルの行と同じ単位 */
  src: string;
  name: string;
  faults: { code: string; name: string; seg: string | null; combo: boolean }[];
}

export interface ScenarioResult {
  /** 踏んだ断層と、同じ場所に重なっていて地図では選び分けられない断層 */
  faults: ScenarioFault[];
  group: ScenarioGroup | null;
  /** その震源グループに属する想定地震の総数 */
  total: number;
}

async function getScenario(params: URLSearchParams, signal?: AbortSignal): Promise<ScenarioResult> {
  const res = await fetch(`/api/jshis/scenario?${params}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`jshis scenario error: ${res.status}`);
  const j = (await res.json()) as { faults?: ScenarioFault[]; total?: number; group?: ScenarioGroup };
  return { faults: j.faults ?? [], group: j.group ?? null, total: j.total ?? (j.faults?.length ?? 0) };
}

/**
 * 断層コードで引く(地図で個別の断層を踏んだとき)。
 *
 * 先頭が踏んだ断層で、続くのは**同じ場所に重なっている断層**。想定地震は
 * 「区間 × 傾斜角モデル × 単独/同時活動」の積で、傾斜角モデル違い・ケース違いのコード・
 * 同時活動の組合せは同じ場所に重なるため、地図では選び分けられずパネルの選択肢になる。
 */
export function fetchScenarioByCode(code: string, signal?: AbortSignal): Promise<ScenarioResult> {
  return getScenario(new URLSearchParams({ code }), signal);
}

/** 震源＋座標で引く(震源ハイライトなど dissolve 済みの面を踏んだとき)。 */
export function fetchScenarioAt(
  src: string,
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ScenarioResult> {
  return getScenario(new URLSearchParams({ src, lat: String(lat), lng: String(lng) }), signal);
}

// 震源グループの色。断層をデータとしてまとめない代わりに、同じ震源であることをこの色で示す。
// アスペリティの色(ASP_VARS)とは別系統にする(同じパネルに並ぶので、混ざると別の意味に読める)。
const GROUP_COLORS = ['#0f766e', '#9333ea', '#b45309', '#0369a1', '#a21caf', '#4d7c0f'] as const;

/** 震源コード → グループ色。コードから決まるので、開き直しても色が変わらない。 */
export function groupColor(src: string): string {
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

/** ケース番号を数値順に並べる(オブジェクトのキー順に依存しない)。 */
export function caseNumbers(f: ScenarioFault): string[] {
  return Object.keys(f.cases).sort((a, b) => Number(a) - Number(b));
}

// ---------------------------------------------------------------- 展開図の下ごしらえ
/** 展開図のセル。面内座標(km)とアスペリティ番号。 */
export interface PlaneCell {
  x: number;
  y: number;
  w: number;
  h: number;
  asp: number;
}

/** aspn の1文字 → アスペリティ番号(0=背景領域)。 */
export function aspnAt(plane: ScenarioPlane, col: number, row: number): number {
  const ch = plane.aspn[row * plane.nx + col];
  if (!ch || ch === '0') return 0;
  return parseInt(ch, 36);
}

/**
 * 断層面 → 展開図のセル一覧(走向方向 x km、傾斜方向 y km)。
 * セル寸法は L/nx × W/ny（J-SHIS は 2km メッシュだが、端数の面があるので実測値から出す）。
 */
export function planeCells(plane: ScenarioPlane): PlaneCell[] {
  if (!plane.nx || !plane.ny) return [];
  const cw = plane.L / plane.nx;
  const ch = plane.W / plane.ny;
  const out: PlaneCell[] = [];
  for (let row = 0; row < plane.ny; row++) {
    for (let col = 0; col < plane.nx; col++) {
      out.push({ x: col * cw, y: row * ch, w: cw, h: ch, asp: aspnAt(plane, col, row) });
    }
  }
  return out;
}

/** その面に現れるアスペリティ番号(昇順)。凡例用。 */
export function aspNumbers(planes: ScenarioPlane[]): number[] {
  const set = new Set<number>();
  for (const p of planes) {
    for (const chr of p.aspn) {
      if (chr !== '0') set.add(parseInt(chr, 36));
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** アスペリティ番号 → 面積(km²)。要素断層のセル数から数える。 */
export function aspArea(planes: ScenarioPlane[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of planes) {
    if (!p.nx || !p.ny) continue;
    const cell = (p.L / p.nx) * (p.W / p.ny);
    for (const chr of p.aspn) {
      if (chr === '0') continue;
      const n = parseInt(chr, 36);
      out.set(n, (out.get(n) ?? 0) + cell);
    }
  }
  return out;
}

/** 背景領域の面積(km²)。 */
export function bgArea(planes: ScenarioPlane[]): number {
  let sum = 0;
  for (const p of planes) {
    if (!p.nx || !p.ny) continue;
    const cell = (p.L / p.nx) * (p.W / p.ny);
    for (const chr of p.aspn) if (chr === '0') sum += cell;
  }
  return sum;
}

/** 面内の傾斜方向距離 w(km) → 深さ(km)。 */
export function depthAt(plane: ScenarioPlane, w: number): number {
  return plane.ztop + w * Math.sin((plane.dip * Math.PI) / 180);
}

// アスペリティの色。震源の系列色(--viz-s*)を使い回す。アスペリティが7を超える断層
// (中央構造線の全区間同時活動で23)は巡回させる。
const ASP_VARS = ['var(--viz-s2)', 'var(--viz-s1)', 'var(--viz-s4)', 'var(--viz-s3)',
                  'var(--viz-s7)', 'var(--viz-s5)', 'var(--viz-s6)'];

/** アスペリティ番号(1始まり) → 色。 */
export function aspColor(n: number): string {
  return ASP_VARS[(n - 1) % ASP_VARS.length];
}

/** 走向(度) → 方位の表記("N8.2°E")。 */
export function fmtStrike(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return d <= 180 ? `N${d.toFixed(1)}°E` : `N${(360 - d).toFixed(1)}°W`;
}

// ---------------------------------------------------------------- 公開波形(時刻歴)
// J-SHIS は想定地震地図の元になった**工学的基盤上の速度波形**をメッシュ単位で公開している。
// jiban-api が中継し、時刻列を落として「dt ＋ 値の配列」に詰め直したものを受け取る。
// 断層モデルからの自前計算ではないので、地図の色(工学的基盤最大速度)と必ず整合する。

/** 1成分ぶんの時刻歴。v[i] の時刻は (i+1)*dt 秒(破壊開始が t=0)。 */
export interface WaveComponent {
  /** NS / EW / UD */
  dir: string;
  /** その成分の最大速度(cm/s) */
  pgv: number;
  v: number[];
}

export interface WaveResult {
  code: string;
  name: string;
  case: string;
  /** 波形が引かれた3次メッシュ(1km)のコードと中心 */
  mesh: string;
  mesh_center: { lat: number; lng: number };
  available: boolean;
  /** available=false の理由。"out_of_area" = 断層の計算対象範囲の外 */
  reason?: string;
  /** サンプリング間隔(秒)。J-SHIS は 120Hz */
  dt?: number;
  n?: number;
  /** 記録長(秒)。通常100秒だが、中央構造線の全区間同時活動は300秒 */
  duration?: number;
  /** 水平2成分のベクトル最大(cm/s)。想定地震地図の工学的基盤最大速度 BV と同じ値 */
  pgv_h?: number | null;
  waves: WaveComponent[];
}

/** その断層・ケースが起こす、指定地点の速度波形。取得に 0.3〜10 秒かかる。 */
export async function fetchWave(
  code: string,
  caseNo: string,
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<WaveResult> {
  const q = new URLSearchParams({ code, case: caseNo, lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/jshis/scenario/wave?${q}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`jshis wave error: ${res.status}`);
  return (await res.json()) as WaveResult;
}

// 成分の色。アスペリティ(ASP_VARS)や震源グループとは別系統にする。
const WAVE_VARS: Record<string, string> = {
  NS: 'var(--viz-s1)',
  EW: 'var(--viz-s2)',
  UD: 'var(--viz-s3)',
};

/** 成分名 → 色。 */
export function waveColor(dir: string): string {
  return WAVE_VARS[dir] ?? 'var(--viz-ink2)';
}

/**
 * 主要動の時間窓 [t0, t1] 秒。累積二乗速度(Arias強度に相当)の 1%〜99% の区間。
 *
 * 記録は 100 秒あるが揺れているのは十数秒で、全体を出すとパネル幅では潰れて読めない。
 * 全成分をまとめて1つの窓にする(成分ごとに違う窓だと並べて比較できないため)。
 */
export function strongMotionWindow(waves: WaveComponent[], dt: number): [number, number] {
  const n = Math.max(...waves.map((w) => w.v.length));
  if (!n || !dt) return [0, 0];
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (const w of waves) {
      const x = w.v[i] ?? 0;
      e += x * x;
    }
    cum[i + 1] = cum[i] + e;
  }
  const total = cum[n];
  if (!total) return [0, n * dt];
  const at = (frac: number) => {
    const target = total * frac;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo * dt;
  };
  // 立ち上がりが切れないよう前後に余裕を持たせる
  const t0 = Math.max(0, at(0.01) - 2);
  const t1 = Math.min(n * dt, at(0.99) + 2);
  return t1 > t0 ? [t0, t1] : [0, n * dt];
}
