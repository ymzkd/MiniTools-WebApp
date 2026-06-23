// PDFレポートに渡す確定済みデータ。HazardMapApp がクリック時点の state を
// このスナップショットに整形して渡す。react-pdf には依存しないので、アプリ本体から
// 安全に import できる（重い react-pdf は generate.ts 側で動的 import する）。

export interface HazardReportData {
  /** 出力日時（表示用にフォーマット済みの文字列） */
  generatedAt: string;
  point: { lat: number; lng: number };
  placeName: string | null;
  elevation: number | null;
  seaRatio: number | null;
  landRatio: number | null;
  radiusKm: number;

  /** 設計用積雪量（平12建告1455号）。usable=false は海上/区域外。 */
  snow: {
    usable: boolean;
    noSnow: boolean; // 第0区（積雪なし）
    zone: number;
    alpha: number;
    beta: number;
    gamma: number;
    R: number;
    depthCm: number | null;
  } | null;

  /** 設計基準風速（平12建告1454号） */
  wind: {
    usable: boolean;
    zone: number;
    Vo: number;
  } | null;

  /** 海岸線・湖岸線までの距離（地表面粗度区分の判定用） */
  shore: {
    nearestM: number | null;
    nearestKind: 'coast' | 'lake' | null;
  } | null;

  /** 地震地域係数（昭55建告1793号） */
  seismic: {
    usable: boolean;
    zone: number;
    Z: number;
  } | null;

  /** 地図スナップショット（PNG dataURL）。取得失敗時は null。 */
  mapImage: string | null;
}
