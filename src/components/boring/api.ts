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
  keyword?: string,
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

// XMLパーサー: ボーリングデータを解析（DTD version 4.00形式対応）
export function parseBoringXML(xmlString: string, id: string, location: GeoLocation): BoringData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // パースエラーチェック
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    console.error('XML parse error:', parserError.textContent);
    throw new Error('XMLの解析に失敗しました');
  }

  // ヘルパー関数: テキスト取得
  const getText = (tagName: string, parent?: Element): string | undefined => {
    const element = parent
      ? parent.getElementsByTagName(tagName)[0]
      : xmlDoc.getElementsByTagName(tagName)[0];
    return element?.textContent?.trim() || undefined;
  };

  // ヘルパー関数: 数値取得
  const getNumber = (tagName: string, parent?: Element): number | undefined => {
    const text = getText(tagName, parent);
    return text ? parseFloat(text) : undefined;
  };

  // 基本情報の取得（標題情報セクション）
  const title = getText('調査名') || getText('工事名') || `ボーリング ${id}`;
  const depth = getNumber('総掘進長') || getNumber('孔底深度') || 0;
  const surveyEnd = getText('調査期間_終了年月日');
  const surveyStart = getText('調査期間_開始年月日');
  const date = surveyEnd || surveyStart;
  const organization = getText('調査会社_名称') || getText('発注機関_名称');

  // 土質層データの取得（DTD 4.00形式）
  const layers: SoilLayer[] = [];
  const layerElements = xmlDoc.getElementsByTagName('工学的地盤分類による地層');

  for (let i = 0; i < layerElements.length; i++) {
    const layer = layerElements[i];

    const bottomDepth = getNumber('工学的地盤分類による地層_下限深度', layer) || 0;
    const soilName = getText('工学的地盤分類による地層_工学的地盤分類', layer) || '';
    const soilSymbol = getText('工学的地盤分類による地層_工学的地盤分類記号', layer) || '';

    // 前の層の下端を上端とする（最初は0）
    const topDepth = i > 0 ? layers[i - 1].bottomDepth : 0;

    // 土質記号から色を判定
    let color = SOIL_COLORS['デフォルト'];
    for (const [key, c] of Object.entries(SOIL_COLORS)) {
      if (soilName.includes(key) || soilSymbol.includes(key)) {
        color = c;
        break;
      }
    }

    layers.push({
      id: `layer-${i}`,
      topDepth,
      bottomDepth,
      soilType: soilSymbol,
      soilName,
      color,
    });
  }

  // 標準貫入試験データの取得（DTD 4.00形式）
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

  // 地下水位の取得（複数のタグ形式に対応）
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
  };
}

// XMLファイルのフェッチと解析
export async function fetchAndParseBoringData(
  xmlUrl: string,
  id: string,
  location: GeoLocation
): Promise<BoringData> {
  try {
    // 開発環境ではプロキシ経由でフェッチ
    const fetchUrl = import.meta.env.DEV
      ? xmlUrl.replace('https://www.kunijiban.pwri.go.jp', '/api/kunijiban')
      : xmlUrl;

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
