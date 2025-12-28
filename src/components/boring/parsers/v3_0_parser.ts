// DTD 3.00 パーサー

import type { SoilLayer } from '../types';
import type { BoringXMLParser, SoilLayerTagMapping } from './types';
import { getText, getNumber, determineSoilColor } from './base';

// DTD 3.00 の土質層タグマッピング
const V3_SOIL_TAGS: SoilLayerTagMapping = {
  parentTag: '岩石土区分',
  bottomDepthTag: '岩石土区分_下端深度',
  soilNameTag: '岩石土区分_岩石土名',
  soilSymbolTag: '岩石土区分_岩石土記号',
};

/**
 * DTD 3.00 形式のボーリングXMLパーサー
 */
export class V3Parser implements BoringXMLParser {
  /**
   * 土質層データを解析
   * @param xmlDoc XMLドキュメント
   * @returns 土質層の配列
   */
  parseSoilLayers(xmlDoc: Document): SoilLayer[] {
    const layers: SoilLayer[] = [];
    const layerElements = xmlDoc.getElementsByTagName(V3_SOIL_TAGS.parentTag);

    for (let i = 0; i < layerElements.length; i++) {
      const layer = layerElements[i];

      const bottomDepth = getNumber(V3_SOIL_TAGS.bottomDepthTag, layer) || 0;
      const soilName = getText(V3_SOIL_TAGS.soilNameTag, layer) || '';
      const soilSymbol = V3_SOIL_TAGS.soilSymbolTag
        ? getText(V3_SOIL_TAGS.soilSymbolTag, layer) || ''
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
