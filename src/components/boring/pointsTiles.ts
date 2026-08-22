// ボーリング調査地点タイル(points.pmtiles)の共有定義。
// Boring Data タブ(MapView)と Hazard Map の両方が同じタイル・色・変換を使うため、
// URLのキャッシュバストや featureToResult の仕様がずれないようここに集約する。
import type { MLITSearchResult } from './types';

// 近接ピック(クリック周辺の地点をリスト化)のピクセル閾値
export const PICK_PX = 12;
export const TOKYO_COLOR = '#f59e0b';
export const NGI_COLOR = '#ef4444';        // 国土地盤のうち KuniJiban 掲載分
export const NGI_ONLY_COLOR = '#7c3aed';   // NGIC(publicweb)にしか無い分
export const SELECTED_COLOR = '#2563eb';

// 全地点を単一PMTilesから描画する。?v= はタイル再生成時のキャッシュバスト用。
export const PMTILES_URL = '/api/ngi/tiles/points.pmtiles?v=5';
export const POINTS_LAYER = 'points'; // tippecanoe -l points

export interface TileProps {
  source?: string; // 'tokyo' | 'ngi'
  source_name?: string; // NGIの提供元(KuniJiban / 岐阜県 / 水戸市 等)
  id?: string;
  title?: string;
  kj?: number; // 1=KuniJiban掲載 / 0=NGIC(publicweb)にしか無い
  xml_url?: string;
  log_url?: string; // PDF型柱状図のときだけ存在(画像型は無し)
  view_url?: string; // 外部ビューアで柱状図を開くURL
  soil_xml_url?: string;
  soil_log_url?: string;
}

// データソースの表示名。東京 / 国土地盤 / 自治体提供ならその名称。
export function sourceLabel(source?: string, sourceName?: string): string {
  if (source === 'tokyo') return '東京の地盤(GIS版)';
  const s = (sourceName ?? '').trim();
  if (!s || s === 'KuniJiban') return '国土地盤(KuniJiban)';
  if (s.includes('港湾')) return '国土地盤(港湾)';
  // 自治体提供(岐阜県 / 水戸市 等)は提供元を明示。県市区町村を含むものを採用。
  if (/[都道府県市区町村]/.test(s)) return `国土地盤 / ${s}`;
  return '国土地盤';
}

// タイルの feature → アプリ共通の MLITSearchResult に変換（クリック→柱状図表示用）。
export function featureToResult(p: TileProps, lng: number, lat: number): MLITSearchResult {
  const isTokyo = p.source === 'tokyo';
  // NGIビューア由来のID(プロキシURL末尾)を抽出（BoringLogViewerのビューアリンク用）。
  const ngiId = (p.xml_url || p.log_url || '').match(/\/(\d+)$/)?.[1];
  return {
    id: p.id ?? `${lng},${lat}`,
    // publicweb 固有の点は調査名を持たない。XMLを取得した時点で本来の調査名に置き換わる。
    title: p.title ?? '(調査名未取得)',
    source: isTokyo ? ('tokyo' as const) : ('mlit' as const),
    metadata: {
      'NGI:link_boring_xml': p.xml_url,
      // log_url は PDF型のみ存在。画像型では undefined になり「PDF柱状図を表示」は出さない。
      'NGI:link_boring_pdf': p.log_url,
      'NGI:link_boring_view': p.view_url,
      ...(p.source_name ? { 'NGI:source_name': p.source_name } : {}),
      ...(ngiId ? { 'NGI:id': ngiId } : {}),
    },
    location: { lat, lng },
    datasetName: sourceLabel(p.source, p.source_name),
  };
}
