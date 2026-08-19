// J-SHIS 地震動ハザード(確率論的地震動予測地図 2020年版・応答スペクトル)の取得と整形。
// jiban-api /jshis/* を同一オリジン /api/jshis/* で叩く(server.js がプロキシ)。
//   spectrum … 地点を含む250mメッシュの工学的基盤(Vs=400m/s)上の加速度応答スペクトル(減衰5%)
//              と最大加速度。ローカルデータなので即時。
//   contrib  … 同メッシュの震源別影響度(周期×50年超過確率ごとの寄与率)。J-SHIS のCGIを
//              jiban-api がバックグラウンド取得する(初回は J-SHIS 側の計算で 60〜120秒)。
//              202 pending の間はポーリングする。震源コードは断層要素(fid)に解決済みで、
//              地図側は fid でハイライトする。

export const JSHIS_PERIODS = [0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 3.0, 5.0] as const;
/** contrib の period キー(J-SHIS API の "period_x.xx" の x.xx 部分)。JSHIS_PERIODS と同順。 */
export const JSHIS_PERIOD_KEYS = ['0.10', '0.20', '0.30', '0.50', '1.00', '2.00', '3.00', '5.00'] as const;
export const JSHIS_PROB_KEYS = ['0.02', '0.05', '0.10', '0.39'] as const;
export type ProbKey = (typeof JSHIS_PROB_KEYS)[number];
export type PeriodKey = (typeof JSHIS_PERIOD_KEYS)[number];
export const PROB_LABEL: Record<ProbKey, string> = {
  '0.02': '2%',
  '0.05': '5%',
  '0.10': '10%',
  '0.39': '39%',
};
// 超過確率(順序尺度)は 1色相の明度段階(index.css の --viz-o1..o4)。2%(稀・大)が最も濃い。
export const PROB_COLOR_VAR: Record<ProbKey, string> = {
  '0.02': 'var(--viz-o4)',
  '0.05': 'var(--viz-o3)',
  '0.10': 'var(--viz-o2)',
  '0.39': 'var(--viz-o1)',
};
// 地震系オーバーレイ(HazardMap の ZoneOverlay のうち、震源断層と影響度ハイライトを重ねるもの)。
// 'faults' は断層だけを見せる variant。
export const SEISMIC_OVERLAYS: ReadonlySet<string> = new Set(['seismic', 'amp', 'vs350', 'faults']);
export function isSeismicOverlay(o: string): boolean {
  return SEISMIC_OVERLAYS.has(o);
}
/** 50年超過確率 → おおよその再現期間(年)。凡例の補足用(2%≈2475年, 5%≈975年, 10%≈475年, 39%≈100年)。 */
export const PROB_RETURN_YEARS: Record<ProbKey, number> = {
  '0.02': 2475,
  '0.05': 975,
  '0.10': 475,
  '0.39': 100,
};

interface JshisBase {
  epoch: string;
  mesh: string;
  mesh_center: { lat: number; lng: number };
  periods: number[];
  probs: string[];
}

export interface SpectrumResult extends JshisBase {
  available: boolean;
  reason?: 'no_data' | 'no_data_file';
  /** prob → 8周期の Sa [cm/s²]（データなしは null） */
  sa?: Record<string, (number | null)[]>;
  /** prob → 工学的基盤上の最大加速度 [cm/s²] */
  pga?: Record<string, number | null>;
}

export type SourceKind = 'fault' | 'areal' | 'aggregate' | 'regional' | 'specified' | 'unknown';
export type FaultCat = 'land' | 'inter' | 'sub';

export interface ContribSource {
  code: string;
  name: string;
  kind: SourceKind;
  /** J-SHIS の地震カテゴリ (1: 海溝型巨大地震, 2: 海溝型震源不特定, 3: 活断層などの浅い地震) */
  category: number | null;
  fids: number[];
  n_faults: number;
  geometry: boolean;
  dist_km?: number;
  depth_km?: number;
  azimuth?: number | null;
  direction?: string;
  mag?: number;
  mag_kind?: 'Mw' | 'M';
  cat?: FaultCat;
  bbox?: [number, number, number, number] | null;
  /** 震源コード→形状の解決方法。'eqcode->layer' はSHAPEレイヤ丸ごと(layer 属性で dissolve 面を塗れる) */
  method?: string;
  layer?: string;
}

export interface ContribResult extends JshisBase {
  available: boolean;
  /** prob → period → code → 寄与率(合計≈1) */
  contrib?: Record<string, Record<string, Record<string, number>>>;
  sources?: Record<string, ContribSource>;
  /** API 側の一様ハザードスペクトル(prob → 8周期)。ローカルCSVと同値。spectrum が無い環境の予備 */
  uhs?: Record<string, (number | null)[]>;
}

export async function fetchSpectrum(lat: number, lng: number, signal?: AbortSignal): Promise<SpectrumResult> {
  const res = await fetch(`/api/jshis/spectrum?lat=${lat}&lng=${lng}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`jshis spectrum error: ${res.status}`);
  return (await res.json()) as SpectrumResult;
}

export interface ContribProgress {
  elapsedS: number | null;
}

/**
 * 震源別影響度を取得。取得完了まで「短時間で返るリクエスト」を繰り返す(ショートポーリング)。
 * onPending で経過秒を通知(UIの進捗表示用)。signal で中断可(地点変更時)。
 * maxTotalMs を超えたら Error('timeout')。
 *
 * **接続を保持しないこと**が重要: `wait` を大きくしてサーバ側で待たせる(ロングポーリング)と、
 * その間ブラウザの同時接続(HTTP/1.1 は 1ホスト6本)を1本占有し続ける。地図タイル(PMTiles の
 * Range 取得)や /api/design/lookup など**同一オリジンの他のリクエストが接続待ちで数十秒詰まる**
 * (実測: long-poll 6本の裏で /api/design/lookup が 19 秒待たされた)。そのため `wait=0` で
 * 即座に 202 を受け取り、接続を解放してから次のポーリングまで待つ。
 */
export async function fetchContrib(
  lat: number,
  lng: number,
  opts: { signal?: AbortSignal; onPending?: (p: ContribProgress) => void; maxTotalMs?: number } = {}
): Promise<ContribResult> {
  const { signal, onPending, maxTotalMs = 6 * 60 * 1000 } = opts;
  const t0 = Date.now();
  for (;;) {
    const res = await fetch(`/api/jshis/contrib?lat=${lat}&lng=${lng}&wait=0`, {
      signal,
      headers: { accept: 'application/json' },
    });
    if (res.status === 202) {
      let elapsed: number | null = null;
      try {
        const j = await res.json();
        elapsed = typeof j?.elapsed_s === 'number' ? j.elapsed_s : null;
      } catch {
        /* noop */
      }
      onPending?.({ elapsedS: elapsed });
      const waited = Date.now() - t0;
      if (waited > maxTotalMs) throw new Error('timeout');
      // 取得は J-SHIS 側の計算待ちで 1〜2 分かかる。序盤は細かく、以降は間隔を空ける。
      await sleep(waited < 30_000 ? 2000 : 4000, signal);
      continue;
    }
    if (!res.ok) throw new Error(`jshis contrib error: ${res.status}`);
    return (await res.json()) as ContribResult;
  }
}

/** signal で中断できる sleep。 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ---------------------------------------------------------------- 系列色
// 震源(系列)の色は dataviz 検証済みのカテゴリカル7色を「順位順に固定割当」する。
// 地図のハイライトも同じ色。ライト/ダークは CSS 変数(--viz-s1..7, index.css)で切替え、
// 地図(常に淡色地図)はライト値を直接使う。
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'] as const;
export const SERIES_VARS = SERIES_LIGHT.map((_, i) => `var(--viz-s${i + 1})`);
export const OTHER_VAR = 'var(--viz-other)';
export const MAX_SLOTS = SERIES_LIGHT.length;

export interface SourceSlot {
  code: string;
  slot: number; // 0..MAX_SLOTS-1
  source: ContribSource;
}

/**
 * 系列色の割当。全 確率×周期 での最大寄与率が大きい順に上位 MAX_SLOTS 件へ色を固定割当する
 * (周期・確率の切替で色が変わらない)。'Others'(集計)と残りは「その他」(灰)に畳む。
 */
export function assignSourceSlots(c: ContribResult): SourceSlot[] {
  if (!c.available || !c.contrib || !c.sources) return [];
  const maxShare = new Map<string, number>();
  for (const perProb of Object.values(c.contrib)) {
    for (const row of Object.values(perProb)) {
      for (const [code, share] of Object.entries(row)) {
        if (code === 'Others') continue;
        maxShare.set(code, Math.max(maxShare.get(code) ?? 0, share));
      }
    }
  }
  const ranked = [...maxShare.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SLOTS);
  return ranked.map(([code], i) => ({ code, slot: i, source: c.sources![code] ?? fallbackSource(code) }));
}

function fallbackSource(code: string): ContribSource {
  return { code, name: code, kind: 'unknown', category: null, fids: [], n_faults: 0, geometry: false };
}

/** 選択した確率・周期の寄与率(code → share)。無ければ空。 */
export function contribAt(c: ContribResult | null, prob: ProbKey, period: PeriodKey): Record<string, number> {
  return c?.contrib?.[prob]?.[period] ?? {};
}

/** 選択した確率・周期で、色割当外(その他+Others)の寄与率合計。 */
export function otherShare(c: ContribResult | null, slots: SourceSlot[], prob: ProbKey, period: PeriodKey): number {
  const row = contribAt(c, prob, period);
  const assigned = new Set(slots.map((s) => s.code));
  let sum = 0;
  for (const [code, share] of Object.entries(row)) if (!assigned.has(code)) sum += share;
  return sum;
}

/** 地図ハイライト用: スロットごとの fid 群と色(ライト値)。ジオメトリの無い震源は含めない。
 *  layer が付く震源(南海トラフ等・レイヤ丸ごと)は、重なり合う多数の面を個別に塗ると濃く飽和するので、
 *  塗りは dissolve 済み groups レイヤ(layer 属性)で行い、fid は輪郭線のハイライトにだけ使う。 */
export interface MapHighlight {
  fids: number[];
  color: string;
  code: string;
  layer?: string;
}
export function highlightsFromSlots(slots: SourceSlot[]): MapHighlight[] {
  return slots
    .filter((s) => s.source.fids.length > 0)
    .map((s) => ({ fids: s.source.fids, color: SERIES_LIGHT[s.slot], code: s.code, layer: s.source.layer }));
}

/** マグニチュード表記("Mw7.5" / "M7.2")。 */
export function fmtMag(s: ContribSource): string | null {
  if (s.mag == null) return null;
  return `${s.mag_kind ?? 'M'}${s.mag.toFixed(1)}`;
}
