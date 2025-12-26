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
const MLIT_API_ENDPOINT = 'https://www.mlit-data.jp/api/v1/graphql';

// GraphQL クエリ: 位置情報による検索
const SEARCH_BY_LOCATION_QUERY = `
  query SearchByLocation($lat: Float!, $lon: Float!, $distance: String!, $term: String, $size: Int!) {
    search(
      term: $term
      phraseMatch: true
      first: 0
      size: $size
      locationFilter: {
        geoDistance: {
          lat: $lat
          lon: $lon
          distance: $distance
        }
      }
    ) {
      totalNumber
      searchResults {
        id
        title
        description
        datasetName
        catalogName
        location {
          lat
          lon
        }
        resources {
          id
          name
          url
          format
        }
      }
    }
  }
`;

// GraphQL クエリ: キーワード検索
const SEARCH_BY_KEYWORD_QUERY = `
  query SearchByKeyword($term: String!, $size: Int!) {
    search(
      term: $term
      phraseMatch: true
      first: 0
      size: $size
    ) {
      totalNumber
      searchResults {
        id
        title
        description
        datasetName
        catalogName
        location {
          lat
          lon
        }
        resources {
          id
          name
          url
          format
        }
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
async function callMLITAPI<T>(
  query: string,
  variables: Record<string, unknown>,
  apiKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(MLIT_API_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
  }

  return result.data;
}

// 位置情報による検索
export async function searchByLocation(
  area: SearchArea,
  keyword?: string,
  size: number = 50,
  apiKey?: string
): Promise<MLITSearchResult[]> {
  const variables = {
    lat: area.center.lat,
    lon: area.center.lng,
    distance: `${area.radius}m`,
    term: keyword || 'ボーリング',
    size,
  };

  interface SearchResponse {
    search: {
      totalNumber: number;
      searchResults: Array<{
        id: string;
        title: string;
        description?: string;
        datasetName?: string;
        catalogName?: string;
        location?: { lat: number; lon: number };
        resources?: Array<{
          id: string;
          name: string;
          url: string;
          format: string;
        }>;
      }>;
    };
  }

  const data = await callMLITAPI<SearchResponse>(
    SEARCH_BY_LOCATION_QUERY,
    variables,
    apiKey
  );

  return data.search.searchResults.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    datasetName: item.datasetName,
    catalogName: item.catalogName,
    location: item.location ? { lat: item.location.lat, lng: item.location.lon } : undefined,
    resources: item.resources?.map(r => ({
      id: r.id,
      name: r.name,
      url: r.url,
      format: r.format,
    })),
  }));
}

// キーワード検索
export async function searchByKeyword(
  keyword: string,
  size: number = 50,
  apiKey?: string
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
        description?: string;
        datasetName?: string;
        catalogName?: string;
        location?: { lat: number; lon: number };
        resources?: Array<{
          id: string;
          name: string;
          url: string;
          format: string;
        }>;
      }>;
    };
  }

  const data = await callMLITAPI<SearchResponse>(
    SEARCH_BY_KEYWORD_QUERY,
    variables,
    apiKey
  );

  return data.search.searchResults.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    datasetName: item.datasetName,
    catalogName: item.catalogName,
    location: item.location ? { lat: item.location.lat, lng: item.location.lon } : undefined,
    resources: item.resources?.map(r => ({
      id: r.id,
      name: r.name,
      url: r.url,
      format: r.format,
    })),
  }));
}

// XMLパーサー: ボーリングデータを解析
export function parseBoringXML(xmlString: string, id: string, location: GeoLocation): BoringData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // 基本情報の取得
  const getTextContent = (tagName: string): string | undefined => {
    const element = xmlDoc.getElementsByTagName(tagName)[0];
    return element?.textContent?.trim() || undefined;
  };

  const getNumberContent = (tagName: string): number | undefined => {
    const text = getTextContent(tagName);
    return text ? parseFloat(text) : undefined;
  };

  // タイトル取得
  const title = getTextContent('調査名') ||
                getTextContent('件名') ||
                getTextContent('工事名') ||
                `ボーリングデータ ${id}`;

  // 掘削深度
  const depth = getNumberContent('掘削深度') ||
                getNumberContent('最大深度') ||
                getNumberContent('孔底深度') ||
                0;

  // 調査日
  const date = getTextContent('調査開始日') ||
               getTextContent('調査年月日') ||
               getTextContent('調査日');

  // 調査機関
  const organization = getTextContent('調査者') ||
                       getTextContent('調査機関') ||
                       getTextContent('会社名');

  // 地下水位
  const waterLevel = getNumberContent('地下水位') ||
                     getNumberContent('初期水位');

  // 土質層データの取得
  const layers: SoilLayer[] = [];
  const layerElements = xmlDoc.getElementsByTagName('地層');

  for (let i = 0; i < layerElements.length; i++) {
    const layer = layerElements[i];
    const getLayerText = (tagName: string): string | undefined => {
      const element = layer.getElementsByTagName(tagName)[0];
      return element?.textContent?.trim() || undefined;
    };
    const getLayerNumber = (tagName: string): number | undefined => {
      const text = getLayerText(tagName);
      return text ? parseFloat(text) : undefined;
    };

    const topDepth = getLayerNumber('上端深度') || getLayerNumber('深度自') || 0;
    const bottomDepth = getLayerNumber('下端深度') || getLayerNumber('深度至') || 0;
    const soilType = getLayerText('土質区分') || getLayerText('地質区分') || '';
    const soilName = getLayerText('土質名') || getLayerText('地質名') || soilType;

    // 土質から色を決定
    let color = SOIL_COLORS['デフォルト'];
    for (const [key, c] of Object.entries(SOIL_COLORS)) {
      if (soilName.includes(key) || soilType.includes(key)) {
        color = c;
        break;
      }
    }

    layers.push({
      id: `layer-${i}`,
      topDepth,
      bottomDepth,
      soilType,
      soilName,
      description: getLayerText('土質説明') || getLayerText('備考'),
      color,
      nValue: getLayerNumber('N値'),
    });
  }

  // 標準貫入試験データの取得
  const sptTests: SPTData[] = [];
  const sptElements = xmlDoc.getElementsByTagName('標準貫入試験');

  for (let i = 0; i < sptElements.length; i++) {
    const spt = sptElements[i];
    const getSptNumber = (tagName: string): number => {
      const element = spt.getElementsByTagName(tagName)[0];
      return element?.textContent ? parseFloat(element.textContent) : 0;
    };

    const testDepth = getSptNumber('試験深度') || getSptNumber('深度');
    const nValue = getSptNumber('N値') || getSptNumber('標準貫入試験_合計打撃回数');
    const penetration = getSptNumber('貫入量');
    const blowCount = getSptNumber('打撃回数') || nValue;

    if (testDepth > 0) {
      sptTests.push({
        depth: testDepth,
        nValue,
        penetration,
        blowCount,
      });
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
    standardPenetrationTests: sptTests,
    waterLevel,
  };
}

// XMLファイルのフェッチと解析
export async function fetchAndParseBoringData(
  xmlUrl: string,
  id: string,
  location: GeoLocation
): Promise<BoringData> {
  const response = await fetch(xmlUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch XML: ${response.status}`);
  }
  const xmlString = await response.text();
  return parseBoringXML(xmlString, id, location);
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
