// J-SHIS 地震動ハザード(確率論的地震動予測地図 2020年版・応答スペクトル)の取得と整形。
// jiban-api /jshis/spectrum を同一オリジン /api/jshis/spectrum で叩く(server.js がプロキシ)。
// 地点を含む250mメッシュの工学的基盤(Vs=400m/s)上の加速度応答スペクトル(減衰5%)と
// 最大加速度。ローカルデータなので即時。

export const JSHIS_PERIODS = [0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 3.0, 5.0] as const;
export const JSHIS_PROB_KEYS = ['0.02', '0.05', '0.10', '0.39'] as const;
export type ProbKey = (typeof JSHIS_PROB_KEYS)[number];
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

export async function fetchSpectrum(lat: number, lng: number, signal?: AbortSignal): Promise<SpectrumResult> {
  const res = await fetch(`/api/jshis/spectrum?lat=${lat}&lng=${lng}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`jshis spectrum error: ${res.status}`);
  return (await res.json()) as SpectrumResult;
}
