// DTD 4.00 パーサー

import type { SoilLayer } from '../types';
import type { BoringXMLParser, SoilLayerTagMapping } from './types';
import { getText, getNumber, determineSoilColor } from './base';

// DTD 4.00 の土質層タグマッピング
const V4_SOIL_TAGS: SoilLayerTagMapping = {
  parentTag: '工学的地質区分名現場土質名',
  bottomDepthTag: '工学的地質区分名現場土質名_下端深度',
  soilNameTag: '工学的地質区分名現場土質名_工学的地質区分名現場土質名',
  soilSymbolTag: '工学的地質区分名現場土質名_工学的地質区分名現場土質名記号',
};

/**
 * DTD 4.00 形式のボーリングXMLパーサー
 */
export class V4Parser implements BoringXMLParser {
  /**
   * 土質層データを解析
   * @param xmlDoc XMLドキュメント
   * @returns 土質層の配列
   */
  parseSoilLayers(xmlDoc: Document): SoilLayer[] {
    const layers: SoilLayer[] = [];
    const layerElements = xmlDoc.getElementsByTagName(V4_SOIL_TAGS.parentTag);

    for (let i = 0; i < layerElements.length; i++) {
      const layer = layerElements[i];

      const bottomDepth = getNumber(V4_SOIL_TAGS.bottomDepthTag, layer) || 0;
      const soilName = getText(V4_SOIL_TAGS.soilNameTag, layer) || '';
      const soilSymbol = V4_SOIL_TAGS.soilSymbolTag
        ? getText(V4_SOIL_TAGS.soilSymbolTag, layer) || ''
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
