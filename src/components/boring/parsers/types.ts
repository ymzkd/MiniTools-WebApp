// パーサー用の型定義

import type { SoilLayer } from '../types';

// DTDVersionはtypes.tsで定義され、ここでre-exportする
export type { DTDVersion } from '../types';

// 土質層タグマッピング
export interface SoilLayerTagMapping {
  parentTag: string;          // 親タグ名
  bottomDepthTag: string;     // 下端深度タグ
  soilNameTag: string;        // 土質名タグ
  soilSymbolTag?: string;     // 土質記号タグ（オプション）
}

// ボーリングXMLパーサーインターフェース
export interface BoringXMLParser {
  parseSoilLayers(xmlDoc: Document): SoilLayer[];
}
