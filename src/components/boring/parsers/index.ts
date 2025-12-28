// パーサーファクトリ

import type { DTDVersion, BoringXMLParser } from './types';
import { V2_1Parser } from './v2_1_parser';
import { V3Parser } from './v3_0_parser';
import { V4Parser } from './v4_0_parser';

/**
 * DTDバージョンに応じたパーサーを取得
 * @param version DTDバージョン
 * @returns 対応するパーサーインスタンス
 */
export function getParserForVersion(version: DTDVersion): BoringXMLParser {
  switch (version) {
    case '2.10':
      return new V2_1Parser();
    case '3.00':
      return new V3Parser();
    case '4.00':
      return new V4Parser();
  }
}

// 他のモジュールから使用するため、必要な関数と型をエクスポート
export { detectDTDVersion, getText, getNumber } from './base';
export type { DTDVersion, BoringXMLParser } from './types';
