// MLIT DPF GraphQL API 連携モジュール

import type {
  GeoLocation,
  SearchArea,
  MLITSearchResult,
  BoringData,
  SoilLayer,
  SPTData,
} from './types';
import { SOIL_COLORS } from './types';
import { detectDTDVersion, getParserForVersion, getText, getNumber } from './parsers';

// API設定
// Vercelサーバーレス関数経由でAPIを呼び出す
// APIキーはサーバー側で管理され、クライアントには露呈しない
const MLIT_API_ENDPOINT = '/api/mlit';

// GraphQL クエリ: 位置情報による検索
const SEARCH_BY_LOCATION_QUERY = `
  query SearchByLocation($topLat: Float!, $topLon: Float!, $bottomLat: Float!, $bottomLon: Float!, $size: Int!) {
    search(
      first: 0
      size: $size
      attributeFilter: {
        AND: [
          { attributeName: "DPF:catalog_id", is: "ngi" }
          { attributeName: "DPF:dataset_id", is: "ngi" }
        ]
      }
      locationFilter: {
        rectangle: {
          topLeft: {
            lat: $topLat
            lon: $topLon
          }
          bottomRight: {
            lat: $bottomLat
            lon: $bottomLon
          }
        }
      }
    ) {
      totalNumber
      searchResults {
        id
        title
        metadata
      }
    }
  }
`;

// GraphQL クエリ: キーワード検索
const SEARCH_BY_KEYWORD_QUERY = `
  query SearchByKeyword($term: String!, $size: Int!) {
    search(
      term: $term
      first: 0
      size: $size
      attributeFilter: {
        AND: [
          { attributeName: "DPF:catalog_id", is: "ngi" }
          { attributeName: "DPF:dataset_id", is: "ngi" }
        ]
      }
    ) {
      totalNumber
      searchResults {
        id
        title
        metadata
      }
    }
  }
`;

// GraphQL クエリ: データ詳細取得（将来の拡張用）
// const GET_DATA_QUERY = `
//   query GetData($id: String!) {
//     data(id: $id) {
//       id
//       title
//       description
//       datasetName
//       catalogName
//       location {
//         lat
//         lon
//       }
//       attributes
//       resources {
//         id
//         name
//         url
//         format
//         size
//       }
//     }
//   }
// `;

// API呼び出しのラッパー
// サーバーレス関数経由でAPIを呼び出すため、APIキーは不要
async function callMLITAPI<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(MLIT_API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500),
      });
      throw new Error(
        `MLIT API エラー: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL Errors:', result.errors);
      const messages = result.errors.map((e: { message: string }) => e.message).join(', ');
      throw new Error(`GraphQL エラー: ${messages}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('APIリクエストに失敗しました');
  }
}

// 位置情報による検索
export async function searchByLocation(
  area: SearchArea,
  _keyword?: string,
  size: number = 50
): Promise<MLITSearchResult[]> {
  // メートルを度に変換（概算: 1度 ≈ 111.32km）
  const rangeDeg = area.radius / 111320;

  const variables = {
    topLat: area.center.lat + rangeDeg,
    topLon: area.center.lng - rangeDeg,
    bottomLat: area.center.lat - rangeDeg,
    bottomLon: area.center.lng + rangeDeg,
    size,
  };

  interface SearchResponse {
    search: {
      totalNumber: number;
      searchResults: Array<{
        id: string;
        title: string;
        metadata?: Record<string, string>;
      }>;
    };
  }

  const data = await callMLITAPI<SearchResponse>(
    SEARCH_BY_LOCATION_QUERY,
    variables
  );

  return data.search.searchResults.map(item => {
    // metadataから緯度経度を取得
    const lat = item.metadata?.['NGI:latitude']
      ? parseFloat(item.metadata['NGI:latitude'])
      : undefined;
    const lng = item.metadata?.['NGI:longitude']
      ? parseFloat(item.metadata['NGI:longitude'])
      : undefined;

    // XMLリンクのドメイン置き換え
    let xmlUrl = item.metadata?.['NGI:link_boring_xml'];
    if (xmlUrl) {
      xmlUrl = xmlUrl.replace('publicweb.ngic.or.jp', 'www.kunijiban.pwri.go.jp');
    }

    return {
      id: item.id,
      title: item.title,
      metadata: {
        ...item.metadata,
        'NGI:link_boring_xml': xmlUrl,  // 置き換え後のURLを格納
      },
      location: lat && lng ? { lat, lng } : undefined,
    };
  });
}

// キーワード検索
export async function searchByKeyword(
  keyword: string,
  size: number = 50
): Promise<MLITSearchResult[]> {
  const variables = {
    term: keyword,
    size,
  };

  interface SearchResponse {
    search: {
      totalNumber: number;
      searchResults: Array<{
        id: string;
        title: string;
        metadata?: Record<string, string>;
      }>;
    };
  }

  const data = await callMLITAPI<SearchResponse>(
    SEARCH_BY_KEYWORD_QUERY,
    variables
  );

  return data.search.searchResults.map(item => {
    // metadataから緯度経度を取得
    const lat = item.metadata?.['NGI:latitude']
      ? parseFloat(item.metadata['NGI:latitude'])
      : undefined;
    const lng = item.metadata?.['NGI:longitude']
      ? parseFloat(item.metadata['NGI:longitude'])
      : undefined;

    // XMLリンクのドメイン置き換え
    let xmlUrl = item.metadata?.['NGI:link_boring_xml'];
    if (xmlUrl) {
      xmlUrl = xmlUrl.replace('publicweb.ngic.or.jp', 'www.kunijiban.pwri.go.jp');
    }

    return {
      id: item.id,
      title: item.title,
      metadata: {
        ...item.metadata,
        'NGI:link_boring_xml': xmlUrl,  // 置き換え後のURLを格納
      },
      location: lat && lng ? { lat, lng } : undefined,
    };
  });
}

// ============================================================
// 東京の地盤(GIS版) ローカル地盤API 連携
// ローカルDokployの jiban-api を minitools 同一オリジンの
// /api/tokyo/* プロキシ経由で叩く（Mixed Content/CORS回避）。
// 検索結果は MLITSearchResult 形に正規化して MLIT と横断マージする。
// ============================================================
const TOKYO_API_BASE = '/api/tokyo';

interface TokyoSearchItem {
  id: string;            // 地点ID（例: TKY-12345）
  title: string;         // 調査名/地点名
  lat: number;           // 十進緯度（取り込み時に度分秒→十進変換済み）
  lng: number;           // 十進経度
  xml_url: string;       // bed.xml の配信パス（同一オリジン /api/tokyo/files/...）
  pdf_url?: string;      // bed.pdf の配信パス（任意）
  address?: string;
  survey_finish?: string;
}

interface TokyoSearchResponse {
  total: number;
  results: TokyoSearchItem[];
}

// 東京データの位置検索（jiban-api /search）
export async function searchTokyo(
  area: SearchArea,
  size: number = 50
): Promise<MLITSearchResult[]> {
  const params = new URLSearchParams({
    lat: String(area.center.lat),
    lng: String(area.center.lng),
    radius: String(area.radius),
    size: String(size),
  });

  const response = await fetch(`${TOKYO_API_BASE}/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`東京地盤API エラー: ${response.status} ${response.statusText}`);
  }

  const data: TokyoSearchResponse = await response.json();

  return data.results.map(item => ({
    id: item.id,
    title: item.title,
    source: 'tokyo' as const,
    metadata: {
      'NGI:code': item.id,
      'NGI:latitude': String(item.lat),
      'NGI:longitude': String(item.lng),
      'NGI:address': item.address,
      'NGI:survey_finish': item.survey_finish,
      // 詳細取得は共通の link_boring_xml 経路に乗せる（同一オリジンの配信パス）
      'NGI:link_boring_xml': item.xml_url,
      'NGI:link_boring_pdf': item.pdf_url,
    },
    location: { lat: item.lat, lng: item.lng },
    datasetName: '東京の地盤(GIS版)',
    catalogName: 'CC BY 2.1 JP',
  }));
}

// MLIT + 東京を横断検索してマージ
// どちらか一方が失敗しても、もう一方の結果は返す（部分成功を許容）。
export async function searchAllSources(
  area: SearchArea,
  _keyword?: string,
  size: number = 50
): Promise<{ results: MLITSearchResult[]; errors: string[] }> {
  const errors: string[] = [];

  // 国土地盤(MLIT)はローカルNGI DB(/api/ngi/search)へ移行。keyword は現状ローカル未対応。
  const [mlitSettled, tokyoSettled] = await Promise.allSettled([
    searchNgi(area, size),
    searchTokyo(area, size),
  ]);

  const results: MLITSearchResult[] = [];

  if (mlitSettled.status === 'fulfilled') {
    results.push(...mlitSettled.value);
  } else {
    errors.push(`国土地盤: ${mlitSettled.reason?.message ?? mlitSettled.reason}`);
  }

  if (tokyoSettled.status === 'fulfilled') {
    results.push(...tokyoSettled.value);
  } else {
    errors.push(`東京: ${tokyoSettled.reason?.message ?? tokyoSettled.reason}`);
  }

  return { results, errors };
}

// ============================================================
// ビューポート(bbox)連動の検索 — 地図表示範囲の地点をリアルタイム描画する用
// ============================================================
export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// MLIT検索結果アイテム → MLITSearchResult への正規化（searchByLocation等と共通）
function mapMLITItem(item: {
  id: string;
  title: string;
  metadata?: Record<string, string>;
}): MLITSearchResult {
  const lat = item.metadata?.['NGI:latitude'] ? parseFloat(item.metadata['NGI:latitude']) : undefined;
  const lng = item.metadata?.['NGI:longitude'] ? parseFloat(item.metadata['NGI:longitude']) : undefined;
  let xmlUrl = item.metadata?.['NGI:link_boring_xml'];
  if (xmlUrl) {
    xmlUrl = xmlUrl.replace('publicweb.ngic.or.jp', 'www.kunijiban.pwri.go.jp');
  }
  return {
    id: item.id,
    title: item.title,
    source: 'mlit' as const,
    metadata: { ...item.metadata, 'NGI:link_boring_xml': xmlUrl },
    location: lat && lng ? { lat, lng } : undefined,
  };
}

// MLIT(国土地盤)を bbox で検索
export async function searchMLITWithinBounds(
  bounds: MapBounds,
  size: number = 500
): Promise<MLITSearchResult[]> {
  const variables = {
    topLat: bounds.maxLat,
    topLon: bounds.minLng,
    bottomLat: bounds.minLat,
    bottomLon: bounds.maxLng,
    size,
  };
  interface SearchResponse {
    search: {
      totalNumber: number;
      searchResults: Array<{ id: string; title: string; metadata?: Record<string, string> }>;
    };
  }
  const data = await callMLITAPI<SearchResponse>(SEARCH_BY_LOCATION_QUERY, variables);
  return data.search.searchResults.map(mapMLITItem).filter(r => r.location);
}

interface TokyoWithinResponse {
  total: number;
  truncated: boolean;
  results: TokyoSearchItem[];
}

// 東京の地盤を bbox で検索（/api/tokyo/within）
export async function searchTokyoWithin(
  bounds: MapBounds,
  limit: number = 2000
): Promise<{ results: MLITSearchResult[]; total: number; truncated: boolean }> {
  const params = new URLSearchParams({
    minLat: String(bounds.minLat),
    maxLat: String(bounds.maxLat),
    minLng: String(bounds.minLng),
    maxLng: String(bounds.maxLng),
    limit: String(limit),
  });
  const response = await fetch(`${TOKYO_API_BASE}/within?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`東京地盤API エラー: ${response.status} ${response.statusText}`);
  }
  const data: TokyoWithinResponse = await response.json();
  const results = data.results.map(item => ({
    id: item.id,
    title: item.title,
    source: 'tokyo' as const,
    metadata: {
      'NGI:code': item.id,
      'NGI:latitude': String(item.lat),
      'NGI:longitude': String(item.lng),
      'NGI:address': item.address,
      'NGI:survey_finish': item.survey_finish,
      'NGI:link_boring_xml': item.xml_url,
      'NGI:link_boring_pdf': item.pdf_url,
    },
    location: { lat: item.lat, lng: item.lng },
    datasetName: '東京の地盤(GIS版)',
    catalogName: 'CC BY 2.1 JP',
  }));
  return { results, total: data.total, truncated: data.truncated };
}

export interface DensityCell {
  gy: number;
  gx: number;
  n?: number; // 件数（存在表示には不要なので任意）
}

export interface DensityResult {
  cell: number;
  maxN: number;
  cells: DensityCell[];
}

// 東京データの密度（グリッド集計）。ズームアウト時にどこにデータがあるか可視化する用。
export async function searchTokyoDensity(
  bounds: MapBounds,
  cell: number
): Promise<DensityResult> {
  const params = new URLSearchParams({
    minLat: String(bounds.minLat),
    maxLat: String(bounds.maxLat),
    minLng: String(bounds.minLng),
    maxLng: String(bounds.maxLng),
    cell: String(cell),
  });
  const response = await fetch(`${TOKYO_API_BASE}/density?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`東京地盤API(密度) エラー: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ============================================================
// 全国 国土地盤情報(NGI) ローカルDB 連携（/api/ngi/* → jiban-api ngi.sqlite）
// 旧来はMLIT DPF GraphQL(/api/mlit)をライブで叩いていたが、アクセス回数・速度の
// 問題があるため、全件メタを取り込んだローカルDB(ngi.sqlite)へ全面移行する。
// 「国土地盤」は MLIT と同一データセットなので、UI互換のため source:'mlit' に正規化する。
// 柱状図XML/PDFは Referer 必須のためサーバ側中継プロキシ /api/ngi/proxy/* を指す。
// （DPF GraphQL 連携関数 searchByLocation / searchMLITWithinBounds はフォールバックとして残置）
// ============================================================
const NGI_API_BASE = '/api/ngi';

interface NgiSearchItem {
  id: string;
  source_name: string;
  code: string;
  ngi_id: number | null;
  title: string;
  lat: number;
  lng: number;
  address?: string;
  survey_finish?: string;
  pref_code?: number;
  boring_length?: number;
  xml_url: string | null;   // 同一オリジン中継 /api/ngi/proxy/boring/xml/<id>（無い場合 null）
  log_url: string | null;   // 柱状図(PDF/PNG)中継、または港湾の直リンクPDF
  has_soiltest: boolean;
  soiltest_xml_url?: string;
  soiltest_log_url?: string;
}

function mapNgiItem(item: NgiSearchItem): MLITSearchResult {
  return {
    id: item.id,
    title: item.title || item.code || item.id,
    source: 'mlit' as const,
    metadata: {
      'NGI:code': item.code,
      'NGI:id': item.ngi_id != null ? String(item.ngi_id) : undefined,
      'NGI:latitude': String(item.lat),
      'NGI:longitude': String(item.lng),
      'NGI:address': item.address,
      'NGI:survey_finish': item.survey_finish,
      'NGI:source_name': item.source_name,
      'NGI:boring_length': item.boring_length != null ? String(item.boring_length) : undefined,
      // 詳細取得は共通の link_boring_xml 経路（同一オリジンの中継プロキシ）に乗せる。
      'NGI:link_boring_xml': item.xml_url ?? undefined,
      'NGI:link_boring_pdf': item.log_url ?? undefined,
    },
    location: { lat: item.lat, lng: item.lng },
    datasetName: '国土地盤情報(NGI)',
  };
}

// 全国NGIの位置検索（/api/ngi/search）
export async function searchNgi(
  area: SearchArea,
  size: number = 50
): Promise<MLITSearchResult[]> {
  const params = new URLSearchParams({
    lat: String(area.center.lat),
    lng: String(area.center.lng),
    radius: String(area.radius),
    size: String(size),
  });
  const response = await fetch(`${NGI_API_BASE}/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`全国地盤API エラー: ${response.status} ${response.statusText}`);
  }
  const data: { total: number; results: NgiSearchItem[] } = await response.json();
  return data.results.map(mapNgiItem);
}

// 全国NGIを bbox で検索（/api/ngi/within）
export async function searchNgiWithin(
  bounds: MapBounds,
  limit: number = 2000
): Promise<{ results: MLITSearchResult[]; total: number; truncated: boolean }> {
  const params = new URLSearchParams({
    minLat: String(bounds.minLat),
    maxLat: String(bounds.maxLat),
    minLng: String(bounds.minLng),
    maxLng: String(bounds.maxLng),
    limit: String(limit),
  });
  const response = await fetch(`${NGI_API_BASE}/within?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`全国地盤API エラー: ${response.status} ${response.statusText}`);
  }
  const data: { total: number; truncated: boolean; results: NgiSearchItem[] } =
    await response.json();
  return {
    results: data.results.map(mapNgiItem),
    total: data.total,
    truncated: data.truncated,
  };
}

// 全国NGIの密度（サーバ側グリッド集計 /api/ngi/density）。
// 旧実装(searchMLITWithinBounds でbbox取得→フロントで集計)を置換し、件数上限なく高速。
export async function searchNgiDensity(
  bounds: MapBounds,
  cell: number
): Promise<DensityResult> {
  const params = new URLSearchParams({
    minLat: String(bounds.minLat),
    maxLat: String(bounds.maxLat),
    minLng: String(bounds.minLng),
    maxLng: String(bounds.maxLng),
    cell: String(cell),
  });
  const response = await fetch(`${NGI_API_BASE}/density?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`全国地盤API(密度) エラー: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export interface ViewportSearchResult {
  results: MLITSearchResult[];
  errors: string[];
  tokyoTotal: number;
  tokyoTruncated: boolean;
  mlitCount: number;
}

// MLIT + 東京 を bbox で横断取得（ビューポート描画用）。部分成功を許容。
export async function searchAllSourcesInBounds(
  bounds: MapBounds,
  opts: { tokyoLimit?: number; mlitSize?: number } = {}
): Promise<ViewportSearchResult> {
  const errors: string[] = [];
  // 国土地盤(MLIT)はライブGraphQLではなくローカルNGI DB(/api/ngi/within)へ移行。
  const [mlitSettled, tokyoSettled] = await Promise.allSettled([
    searchNgiWithin(bounds, opts.mlitSize ?? 2000),
    searchTokyoWithin(bounds, opts.tokyoLimit ?? 2000),
  ]);

  const results: MLITSearchResult[] = [];
  let mlitCount = 0;
  let tokyoTotal = 0;
  let tokyoTruncated = false;

  if (mlitSettled.status === 'fulfilled') {
    results.push(...mlitSettled.value.results);
    mlitCount = mlitSettled.value.total;
  } else {
    errors.push(`国土地盤: ${mlitSettled.reason?.message ?? mlitSettled.reason}`);
  }
  if (tokyoSettled.status === 'fulfilled') {
    results.push(...tokyoSettled.value.results);
    tokyoTotal = tokyoSettled.value.total;
    tokyoTruncated = tokyoSettled.value.truncated;
  } else {
    errors.push(`東京: ${tokyoSettled.reason?.message ?? tokyoSettled.reason}`);
  }

  return { results, errors, tokyoTotal, tokyoTruncated, mlitCount };
}

// XMLパーサー: ボーリングデータを解析（DTD version 2.10/3.00/4.00対応）
export function parseBoringXML(xmlString: string, id: string, location: GeoLocation): BoringData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // パースエラーチェック
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    console.error('XML parse error:', parserError.textContent);
    throw new Error('XMLの解析に失敗しました');
  }

  // DTDバージョン検出
  const dtdVersion = detectDTDVersion(xmlDoc);
  if (!dtdVersion) {
    console.error('Unsupported or missing DTD version');
    throw new Error('サポートされていないDTDバージョンです');
  }

  // バージョンに応じたパーサーを取得
  const soilLayerParser = getParserForVersion(dtdVersion);

  // 基本情報の取得（標題情報セクション - 全バージョン共通）
  const title = getText('調査名', undefined, xmlDoc) || getText('工事名', undefined, xmlDoc) || `ボーリング ${id}`;
  // 掘削深度: KuniJibanは総掘進長/孔底深度、東京の地盤(BED0400)は総削孔長
  const depth = getNumber('総掘進長', undefined, xmlDoc) || getNumber('孔底深度', undefined, xmlDoc) || getNumber('総削孔長', undefined, xmlDoc) || 0;
  const surveyEnd = getText('調査期間_終了年月日', undefined, xmlDoc);
  const surveyStart = getText('調査期間_開始年月日', undefined, xmlDoc);
  const date = surveyEnd || surveyStart;
  const organization = getText('調査会社_名称', undefined, xmlDoc) || getText('発注機関_名称', undefined, xmlDoc) || getText('発注機関名称', undefined, xmlDoc);
  const groundElevation = getNumber('孔口標高', undefined, xmlDoc);
  const purpose = getText('調査目的', undefined, xmlDoc);

  // 土質層データの取得（バージョン別パーサーを使用）
  const layers = soilLayerParser.parseSoilLayers(xmlDoc);

  // 標準貫入試験データの取得（全バージョン共通）
  const sptTests: SPTData[] = [];
  const sptElements = xmlDoc.getElementsByTagName('標準貫入試験');

  for (let i = 0; i < sptElements.length; i++) {
    const spt = sptElements[i];

    const testDepth = getNumber('標準貫入試験_開始深度', spt) || 0;
    const totalBlowCount = getNumber('標準貫入試験_合計打撃回数', spt) || 0;
    const totalPenetration = getNumber('標準貫入試験_合計貫入量', spt) || 30;

    if (testDepth > 0 && totalBlowCount > 0) {
      sptTests.push({
        depth: testDepth,
        nValue: totalBlowCount,
        penetration: totalPenetration,
        blowCount: totalBlowCount,
      });
    }
  }

  // 地下水位の取得（複数のタグ形式に対応 - 全バージョン共通）
  let waterLevel: number | undefined;

  // 形式1: <孔内水位> タグ
  const waterLevelElement1 = xmlDoc.getElementsByTagName('孔内水位')[0];
  if (waterLevelElement1) {
    waterLevel = getNumber('孔内水位_孔内水位', waterLevelElement1);
  }

  // 形式2: <孔内水位記録> タグ（フォールバック）
  if (waterLevel === undefined) {
    const waterLevelElement2 = xmlDoc.getElementsByTagName('孔内水位記録')[0];
    if (waterLevelElement2) {
      waterLevel = getNumber('孔内水位記録_孔内水位', waterLevelElement2);
    }
  }

  return {
    id,
    title,
    location,
    depth,
    date,
    organization,
    layers,
    standardPenetrationTests: sptTests.length > 0 ? sptTests : undefined,
    waterLevel,
    groundElevation: groundElevation || undefined,
    purpose: purpose || undefined,
    dtdVersion,
  };
}

// XMLファイルのフェッチと解析
export async function fetchAndParseBoringData(
  xmlUrl: string,
  id: string,
  location: GeoLocation
): Promise<BoringData> {
  try {
    // ローカル配信(東京 /api/tokyo/files, 全国NGI中継 /api/ngi/proxy)は同一オリジンなので直fetch。
    // KuniJiban(外部https)はCORS回避のためサーバーレス関数経由で取得。
    const isLocal = xmlUrl.startsWith('/api/tokyo/') || xmlUrl.startsWith('/api/ngi/');
    const fetchUrl = isLocal
      ? xmlUrl
      : `/api/kunijiban?url=${encodeURIComponent(xmlUrl)}`;

    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`XMLファイルの取得に失敗: ${response.status} ${response.statusText}`);
    }

    // Shift_JIS エンコーディングで読み込み
    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder('shift-jis');
    const xmlString = decoder.decode(arrayBuffer);

    return parseBoringXML(xmlString, id, location);
  } catch (error) {
    console.error('XML fetch error:', error);
    throw error;
  }
}

// デモ用のモックデータ生成
export function generateMockBoringData(
  id: string,
  location: GeoLocation,
  title?: string
): BoringData {
  const layers: SoilLayer[] = [
    { id: 'l1', topDepth: 0, bottomDepth: 1.5, soilType: '盛土', soilName: '盛土（砂質土）', color: SOIL_COLORS['盛土'] },
    { id: 'l2', topDepth: 1.5, bottomDepth: 3.0, soilType: '粘土', soilName: '粘土（シルト混じり）', color: SOIL_COLORS['粘土'], nValue: 3 },
    { id: 'l3', topDepth: 3.0, bottomDepth: 6.5, soilType: '砂', soilName: '細砂', color: SOIL_COLORS['砂'], nValue: 8 },
    { id: 'l4', topDepth: 6.5, bottomDepth: 10.0, soilType: '砂礫', soilName: '砂礫（密実）', color: SOIL_COLORS['砂礫'], nValue: 25 },
    { id: 'l5', topDepth: 10.0, bottomDepth: 15.0, soilType: '粘土', soilName: '粘性土', color: SOIL_COLORS['粘性土'], nValue: 12 },
    { id: 'l6', topDepth: 15.0, bottomDepth: 20.0, soilType: '砂岩', soilName: '風化砂岩', color: SOIL_COLORS['砂岩'], nValue: 50 },
  ];

  const sptTests: SPTData[] = [
    { depth: 2.0, nValue: 3, penetration: 30, blowCount: 3 },
    { depth: 4.0, nValue: 8, penetration: 30, blowCount: 8 },
    { depth: 6.0, nValue: 12, penetration: 30, blowCount: 12 },
    { depth: 8.0, nValue: 25, penetration: 30, blowCount: 25 },
    { depth: 10.0, nValue: 18, penetration: 30, blowCount: 18 },
    { depth: 12.0, nValue: 15, penetration: 30, blowCount: 15 },
    { depth: 14.0, nValue: 22, penetration: 30, blowCount: 22 },
    { depth: 16.0, nValue: 35, penetration: 30, blowCount: 35 },
    { depth: 18.0, nValue: 50, penetration: 25, blowCount: 50 },
  ];

  return {
    id,
    title: title || `ボーリング調査 No.${id}`,
    location,
    depth: 20.0,
    date: '2024-03-15',
    organization: '○○地質調査株式会社',
    layers,
    standardPenetrationTests: sptTests,
    waterLevel: 3.5,
  };
}

// デモ用のモック検索結果生成
export function generateMockSearchResults(
  center: GeoLocation,
  count: number = 10
): MLITSearchResult[] {
  const results: MLITSearchResult[] = [];

  for (let i = 0; i < count; i++) {
    // 中心から500m以内のランダムな位置を生成
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lngOffset = (Math.random() - 0.5) * 0.01;

    results.push({
      id: `boring-${i + 1}`,
      title: `ボーリング調査 BH-${i + 1}`,
      description: `調査地点 ${i + 1}`,
      datasetName: 'KuniJiban',
      catalogName: '国土地盤情報',
      location: {
        lat: center.lat + latOffset,
        lng: center.lng + lngOffset,
      },
      resources: [
        {
          id: `xml-${i + 1}`,
          name: `BH-${i + 1}.xml`,
          url: `https://example.com/data/BH-${i + 1}.xml`,
          format: 'XML',
        },
        {
          id: `pdf-${i + 1}`,
          name: `BH-${i + 1}.pdf`,
          url: `https://example.com/data/BH-${i + 1}.pdf`,
          format: 'PDF',
        },
      ],
    });
  }

  return results;
}
