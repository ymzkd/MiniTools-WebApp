// ボーリングデータ関連の型定義

// 地点座標
export interface GeoLocation {
  lat: number;
  lng: number;
}

// 検索範囲設定
export interface SearchArea {
  center: GeoLocation;
  radius: number; // メートル単位
}

// MLIT DPF API レスポンスの検索結果
export interface MLITSearchResult {
  id: string;
  title: string;
  metadata?: {
    'NGI:id'?: string;
    'NGI:code'?: string;
    'DPF:year'?: string;
    'NGI:latitude'?: string;
    'NGI:longitude'?: string;
    'NGI:client_name'?: string;
    'NGI:source_name'?: string;
    'NGI:address'?: string;
    'NGI:survey_finish'?: string;
    'NGI:link_boring_xml'?: string;
    'NGI:boring_xml_version'?: string;
    'NGI:boring_elevation'?: string;
    [key: string]: string | undefined;  // 他のメタデータフィールド
  };
  location?: GeoLocation;
  // 以下は後方互換性のため残すがoptional
  description?: string;
  datasetName?: string;
  catalogName?: string;
  attributes?: Record<string, unknown>;
  resources?: MLITResource[];
}

// リソース情報
export interface MLITResource {
  id: string;
  name: string;
  url: string;
  format: string; // 'XML', 'PDF', etc.
  size?: number;
}

// ボーリング柱状図データ（XMLから解析）
export interface BoringData {
  id: string;
  title: string;
  location: GeoLocation;
  depth: number; // 掘削深度（メートル）
  date?: string; // 調査日
  organization?: string; // 調査機関
  layers: SoilLayer[];
  standardPenetrationTests?: SPTData[];
  waterLevel?: number; // 地下水位
  pdfUrl?: string; // PDF柱状図のURL
  xmlUrl?: string; // XMLデータのURL
}

// 土質層データ
export interface SoilLayer {
  id: string;
  topDepth: number; // 上端深度
  bottomDepth: number; // 下端深度
  soilType: string; // 土質区分
  soilName: string; // 土質名
  description?: string; // 土質説明
  color?: string; // 表示色
  nValue?: number; // N値（ある場合）
}

// 標準貫入試験データ
export interface SPTData {
  depth: number; // 試験深度
  nValue: number; // N値
  penetration: number; // 貫入量（cm）
  blowCount: number; // 打撃回数
}

// 土質試験結果
export interface SoilTestResult {
  depth: number;
  testType: string; // 試験種別
  result: Record<string, number | string>;
}

// 検索パラメータ
export interface SearchParams {
  keyword?: string;
  location?: SearchArea;
  dateFrom?: string;
  dateTo?: string;
  dataType?: 'boring' | 'all';
}

// API設定
export interface APIConfig {
  endpoint: string;
  apiKey?: string;
}

// 検索状態
export type SearchStatus = 'idle' | 'searching' | 'success' | 'error';

// アプリケーション状態
export interface BoringAppState {
  searchStatus: SearchStatus;
  searchResults: MLITSearchResult[];
  selectedResult: MLITSearchResult | null;
  boringData: BoringData | null;
  mapCenter: GeoLocation;
  searchArea: SearchArea | null;
  error: string | null;
}

// 土質区分と表示色のマッピング
export const SOIL_COLORS: Record<string, string> = {
  '盛土': '#8B4513',
  '表土': '#A0522D',
  '砂': '#F4A460',
  '細砂': '#DEB887',
  '粗砂': '#D2B48C',
  '礫': '#CD853F',
  '砂礫': '#DAA520',
  '粘土': '#6B8E23',
  '粘性土': '#808000',
  'シルト': '#9ACD32',
  'ローム': '#BDB76B',
  '泥岩': '#696969',
  '砂岩': '#A9A9A9',
  '凝灰岩': '#778899',
  '岩盤': '#2F4F4F',
  '玉石': '#C0C0C0',
  'デフォルト': '#D3D3D3',
};

// 土質区分から色を取得
export function getSoilColor(soilType: string): string {
  for (const [key, color] of Object.entries(SOIL_COLORS)) {
    if (soilType.includes(key)) {
      return color;
    }
  }
  return SOIL_COLORS['デフォルト'];
}
