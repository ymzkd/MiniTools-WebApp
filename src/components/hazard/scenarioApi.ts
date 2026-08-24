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
  info: ScenarioInfo;
  cases: Record<string, ScenarioCase>;
}

const JSHIS_ORIGIN = 'https://www.j-shis.bosai.go.jp';

/** DEF.pdf の絶対URL。パスが無ければ null。 */
export function pdfUrl(info: ScenarioInfo): string | null {
  return info.pdf ? JSHIS_ORIGIN + info.pdf : null;
}

/** 震源コード(地図タイルの src)に紐づく想定地震。無ければ空配列。 */
export async function fetchScenario(src: string, signal?: AbortSignal): Promise<ScenarioFault[]> {
  const res = await fetch(`/api/jshis/scenario?src=${encodeURIComponent(src)}`, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`jshis scenario error: ${res.status}`);
  const j = (await res.json()) as { faults: ScenarioFault[] };
  return j.faults ?? [];
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
