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
//
// 加速度は J-SHIS が公開していないので jiban-api が微分して作る(quantity=acc)。信号処理は
// すべてサーバ側に置いてある。ここでやるのは単位の掛け算と CSV の組み立てだけ。

/** 表示・書き出しの物理量。サーバの quantity パラメータと同じ値。 */
export type WaveQuantity = 'vel' | 'acc';

/** 1成分ぶんの時刻歴。v[i] の時刻は (i+1)*dt 秒(破壊開始が t=0)。 */
export interface WaveComponent {
  /** NS / EW / UD */
  dir: string;
  /** その成分の最大値(絶対値)。単位は WaveResult.unit */
  peak: number;
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
  /** この応答の物理量と単位("cm/s" または "gal") */
  quantity: WaveQuantity;
  unit: string;
  /** 水平2成分のベクトル最大**速度**(cm/s)。想定地震地図の工学的基盤最大速度 BV と同じ値。
      物理量によらず常に入る(地図の色との対応を示すため) */
  pgv_h?: number | null;
  /** この物理量での水平2成分のベクトル最大 */
  peak_h?: number | null;
  /** 主要動の時間窓 [t0,t1](秒)。**速度から**決めてあるので物理量を切り替えても動かない */
  window?: [number, number];
  waves: WaveComponent[];
}

/**
 * その断層・ケースが起こす、指定地点の波形。
 * 速度は J-SHIS から取るので 0.3〜10 秒。加速度はサーバ側のキャッシュから微分するので速い。
 */
export async function fetchWave(
  code: string,
  caseNo: string,
  lat: number,
  lng: number,
  quantity: WaveQuantity = 'vel',
  signal?: AbortSignal
): Promise<WaveResult> {
  const q = new URLSearchParams({
    code, case: caseNo, lat: String(lat), lng: String(lng), quantity,
  });
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

// ------------------------------------------------------- ケース別の地点の揺れ(一覧)
// 波形は1件 0.5〜1.5MB あるので、全ケース取ってから比べるのは重い。先にこの一覧で
// 「どのケースが大きいか」を見る。J-SHIS Map の地点情報ウィンドウと同じ中身(想定地震地図の
// 公表値)で、1ケース 742 バイト・0.3 秒なので全ケースを並列に取れる。

export interface CaseSummary {
  case: string;
  available: boolean;
  reason?: string | null;
  /** 工学的基盤(Vs=600m/s)上の最大速度(cm/s)。波形の水平ベクトル最大と一致する */
  pgv: number | null;
  /** 同・計測震度 */
  si_b: number | null;
  /** 表層地盤による震度増分 */
  si_inc: number | null;
  /** 地表の震度(気象庁震度階級。"7" や "5弱") */
  si_surf: string | null;
  /** 断層モデルの規模。ケースで断層形状が変わるものだけ差が出る */
  L: number;
  area: number;
  /** 断層面の枚数。屈曲モデルは 2 枚以上になる */
  nseg: number;
  nelem: number;
  nasp: number;
}

export interface CaseSummaryResult {
  code: string;
  name: string;
  /** マグニチュード表記。震源パラメータはケース間で共通なので断層に1つ */
  mag: string | null;
  mesh: string | null;
  vs: number | null;
  link: string | null;
  cases: CaseSummary[];
}

/** その断層の全ケースについて、地点の揺れの大きさを一覧で引く。 */
export async function fetchCaseSummary(
  code: string,
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<CaseSummaryResult> {
  const q = new URLSearchParams({ code, lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/jshis/scenario/cases?${q}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`jshis cases error: ${res.status}`);
  return (await res.json()) as CaseSummaryResult;
}

/** 気象庁震度階級 → 色。震度分布図の慣用色に寄せる(5弱以上を暖色に)。 */
export function shindoColor(s: string | null): string {
  if (!s) return 'var(--viz-grid)';
  if (s.startsWith('7')) return '#a50f15';
  if (s.startsWith('6強')) return '#d7301f';
  if (s.startsWith('6弱')) return '#ef6548';
  if (s.startsWith('5強')) return '#fc8d59';
  if (s.startsWith('5弱')) return '#fdbb84';
  if (s.startsWith('4')) return '#fdd49e';
  return 'var(--viz-grid)';
}

// ---------------------------------------------------------------- CSV 書き出し
/**
 * 波形を CSV にする。物理量は取ってきた応答のもの(サーバが quantity=vel|acc で返す)、
 * 単位だけここで掛ける。
 * 1行目からのメタ情報は "#" 始まりのコメント行にして、表計算に読み込んでもデータ部だけ
 * 拾えるようにする。前提(物理量・基準面・単位)を落とすと値を取り違えるので、ヘッダに残す。
 */
export function waveToCsv(w: WaveResult, u: WaveUnit): string {
  const q = w.quantity;
  const unit = unitLabel(q, u);
  const digits = csvDigits(q, u);
  const k = unitScale(q, u);
  const n = Math.max(...w.waves.map((c) => c.v.length), 0);
  const span = w.duration ?? (w.dt ?? 0) * n;
  const lines = [
    '# J-SHIS 想定地震（震源断層を特定した地震動予測地図）の公開波形',
    `# 断層,${w.name},${w.code}`,
    `# ケース,CASE${w.case}`,
    `# メッシュ,${w.mesh},${w.mesh_center.lat},${w.mesh_center.lng}`,
    `# 物理量,${QUANTITY_LABEL[q]},${unit}`,
    '# 基準面,詳細法工学的基盤（S波速度 600 m/s 層の上面）',
    `# サンプリング,${span && n ? (n / span).toFixed(0) : ''},Hz,dt=${span && n ? span / n : ''},s`,
    `# 記録長,${w.duration},s`,
    ...w.waves.map((c) => `# 最大値,${c.dir},${(c.peak * k).toFixed(digits)},${unit}`),
    ...(w.peak_h != null
      ? [`# 最大値,水平ベクトル合成,${(w.peak_h * k).toFixed(digits)},${unit}`]
      : []),
    '# 注記,表層地盤の増幅は含みません（地表の値ではありません）',
    '# 注記,長周期は三次元差分法・短周期は統計的グリーン関数法のハイブリッド合成法。1.5Hz以上はNSとEWが同一波形です',
    ...(q === 'acc'
      ? ['# 注記,加速度はJ-SHISが公開している速度波形を周波数領域で微分した値です（加速度は公開されていません）',
         '# 注記,統計的グリーン関数法のfmax=6Hzより高い成分は元から含まれないため、実観測の加速度記録とは高周波の中身が異なります']
      : []),
    '# 出典,防災科学技術研究所 地震ハザードステーション J-SHIS,https://www.j-shis.bosai.go.jp/',
    ['時刻(s)', ...w.waves.map((c) => `${c.dir}(${unit})`)].join(','),
  ];
  // 時刻は (i+1)*dt ではなく (i+1)*記録長/点数 で出す。dt は丸めた値なので、積むと末尾が
  // 99.999996 のようにずれる(等間隔なのに端数が付くと読み手が dt を疑う)。
  for (let i = 0; i < n; i++) {
    lines.push(
      [(((i + 1) * span) / n).toFixed(6),
       ...w.waves.map((c) => ((c.v[i] ?? 0) * k).toFixed(digits))].join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** CSV をダウンロードさせる。Excel が UTF-8 と分かるよう BOM を付ける。 */
export function downloadWaveCsv(w: WaveResult, u: WaveUnit): void {
  const blob = new Blob(['\ufeff' + waveToCsv(w, u)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jshis_${w.quantity}_${w.code}_CASE${w.case}_${w.mesh}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------- 単位の切り替え
// 微分などの信号処理は jiban-api 側。ここは表示・書き出しの単位を掛けるだけ。

/** 長さの単位。加速度では cm = gal。 */
export type WaveUnit = 'cm' | 'm' | 'mm';

interface UnitSpec {
  /** cm 基準からの倍率 */
  k: number;
  label: string;
  /** CSV に出す小数桁。cm 基準の桁数を保つように決める */
  digits: number;
}

const UNITS: Record<WaveQuantity, Record<WaveUnit, UnitSpec>> = {
  // 速度の元データは 0.01 cm/s 刻み、加速度はサーバが 0.001 gal 刻みで返す。
  // 単位を変えても同じ情報が残る桁を選ぶ。
  vel: {
    cm: { k: 1, label: 'cm/s', digits: 2 },
    m: { k: 0.01, label: 'm/s', digits: 4 },
    mm: { k: 10, label: 'mm/s', digits: 1 },
  },
  acc: {
    cm: { k: 1, label: 'gal', digits: 3 },
    m: { k: 0.01, label: 'm/s²', digits: 5 },
    mm: { k: 10, label: 'mm/s²', digits: 2 },
  },
};

export const QUANTITY_LABEL: Record<WaveQuantity, string> = { vel: '速度', acc: '加速度' };
export const UNIT_CHOICES: WaveUnit[] = ['cm', 'm', 'mm'];

/** 単位の表示名。加速度の cm は gal。 */
export function unitLabel(q: WaveQuantity, u: WaveUnit): string {
  return UNITS[q][u].label;
}

/** cm 基準からの倍率。 */
export function unitScale(q: WaveQuantity, u: WaveUnit): number {
  return UNITS[q][u].k;
}

/** CSV に出す小数桁。単位を変えても元データの情報量が落ちないように決めてある。 */
export function csvDigits(q: WaveQuantity, u: WaveUnit): number {
  return UNITS[q][u].digits;
}
