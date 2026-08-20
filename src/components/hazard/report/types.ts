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

  /** 地表面粗度区分（平12建告1454号）。Ⅰ/Ⅳは特定行政庁が規則で定めるため判定対象外。
   *  区分Ⅱは建築物の高さで分かれるので、単一の区分ではなく高さ帯ごとに持つ。 */
  roughness: {
    available: boolean;
    /** 高さの条件（例:「13m 以下」）と区分。height=null は高さで分かれないケース。 */
    bands: { height: string | null; category: string }[];
    /** 判定根拠（都市計画区域の内外・距離の条件） */
    basis: string[];
    /** 都市計画区域の内(true)/外(false)。不明なら null。 */
    urbanInside: boolean | null;
  } | null;

  /** 地震地域係数（昭55建告1793号）＋ J-SHIS地盤値（参考） */
  seismic: {
    usable: boolean;
    zone: number;
    Z: number;
    /** 地盤増幅率(工学的基盤Vs400m/sから地表)。J-SHIS表層地盤。データなしは null */
    amp: number | null;
    /** 工学的基盤(Vs400m/s)深さ[m]。J-SHIS深部地盤。データなしは null */
    vs400DepthM: number | null;
  } | null;

  /** 地図スナップショット（PNG dataURL）。取得失敗時は null。 */
  mapImage: string | null;
}
