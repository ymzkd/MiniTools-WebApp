// DTD 2.10 パーサー

import type { SoilLayer } from '../types';
import type { BoringXMLParser, SoilLayerTagMapping } from './types';
import { getText, getNumber, determineSoilColor } from './base';

// DTD 2.10 の土質層タグマッピング
const V2_1_SOIL_TAGS: SoilLayerTagMapping = {
  parentTag: '土質岩種区分',
  bottomDepthTag: '土質岩種区分_下端深度',
  soilNameTag: '土質岩種区分_土質岩種区分1',
  soilSymbolTag: '土質岩種区分_土質岩種記号1',
};

/**
 * DTD 2.10 形式のボーリングXMLパーサー
 */
export class V2_1Parser implements BoringXMLParser {
  /**
   * 土質層データを解析
   * @param xmlDoc XMLドキュメント
   * @returns 土質層の配列
   */
  parseSoilLayers(xmlDoc: Document): SoilLayer[] {
    const layers: SoilLayer[] = [];
    const layerElements = xmlDoc.getElementsByTagName(V2_1_SOIL_TAGS.parentTag);

    for (let i = 0; i < layerElements.length; i++) {
      const layer = layerElements[i];

      const bottomDepth = getNumber(V2_1_SOIL_TAGS.bottomDepthTag, layer) || 0;
      const soilName = getText(V2_1_SOIL_TAGS.soilNameTag, layer) || '';
      const soilSymbol = V2_1_SOIL_TAGS.soilSymbolTag
        ? getText(V2_1_SOIL_TAGS.soilSymbolTag, layer) || ''
        : '';

      // 前の層の下端を上端とする（最初は0）
      const topDepth = i > 0 ? layers[i - 1].bottomDepth : 0;

      // 土質記号または土質名から色を判定
      const color = determineSoilColor(soilName, soilSymbol);

      layers.push({
        id: `layer-${i}`,
        topDepth,
        bottomDepth,
        soilType: soilSymbol,
        soilName,
        color,
      });
    }

    return layers;
  }
}
