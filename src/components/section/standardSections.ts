import type { StandardSection, SectionShapeType } from '../../types';
import { calculateSectionProperties } from '../../hooks/useSectionCalculator';

// ヘルパー関数：寸法から規格断面を生成
function createStandardSection(
  id: string,
  name: string,
  type: SectionShapeType,
  dimensions: StandardSection['dimensions']
): StandardSection | null {
  const properties = calculateSectionProperties(type, dimensions);
  if (!properties) return null;
  return { id, name, type, dimensions, properties };
}

// 丸鋼（円形断面）
export const circleStandards: StandardSection[] = [
  { diameter: 10 },
  { diameter: 13 },
  { diameter: 16 },
  { diameter: 19 },
  { diameter: 22 },
  { diameter: 25 },
  { diameter: 28 },
  { diameter: 32 },
  { diameter: 38 },
  { diameter: 44 },
  { diameter: 50 },
  { diameter: 60 },
  { diameter: 70 },
  { diameter: 80 },
  { diameter: 90 },
  { diameter: 100 },
].map((dims, i) => createStandardSection(
  `circle-${i}`,
  `φ${dims.diameter}`,
  'circle',
  dims
)).filter((s): s is StandardSection => s !== null);

// 丸パイプ（SGP鋼管相当）
export const pipeStandards: StandardSection[] = [
  { outerDiameter: 21.7, innerDiameter: 15.9 },   // 15A
  { outerDiameter: 27.2, innerDiameter: 21.4 },   // 20A
  { outerDiameter: 34.0, innerDiameter: 27.6 },   // 25A
  { outerDiameter: 42.7, innerDiameter: 35.5 },   // 32A
  { outerDiameter: 48.6, innerDiameter: 41.2 },   // 40A
  { outerDiameter: 60.5, innerDiameter: 52.7 },   // 50A
  { outerDiameter: 76.3, innerDiameter: 67.9 },   // 65A
  { outerDiameter: 89.1, innerDiameter: 80.1 },   // 80A
  { outerDiameter: 101.6, innerDiameter: 92.0 },  // 90A
  { outerDiameter: 114.3, innerDiameter: 105.3 }, // 100A
  { outerDiameter: 139.8, innerDiameter: 130.0 }, // 125A
  { outerDiameter: 165.2, innerDiameter: 154.8 }, // 150A
  { outerDiameter: 216.3, innerDiameter: 204.7 }, // 200A
].map((dims, i) => createStandardSection(
  `pipe-${i}`,
  `φ${dims.outerDiameter}×${((dims.outerDiameter - dims.innerDiameter) / 2).toFixed(1)}t`,
  'pipe',
  dims
)).filter((s): s is StandardSection => s !== null);

// 角パイプ（一般構造用角形鋼管 STKR相当）
export const boxStandards: StandardSection[] = [
  { outerWidth: 50, outerHeight: 50, thickness: 2.3 },
  { outerWidth: 50, outerHeight: 50, thickness: 3.2 },
  { outerWidth: 60, outerHeight: 60, thickness: 2.3 },
  { outerWidth: 60, outerHeight: 60, thickness: 3.2 },
  { outerWidth: 75, outerHeight: 75, thickness: 2.3 },
  { outerWidth: 75, outerHeight: 75, thickness: 3.2 },
  { outerWidth: 75, outerHeight: 75, thickness: 4.5 },
  { outerWidth: 100, outerHeight: 100, thickness: 3.2 },
  { outerWidth: 100, outerHeight: 100, thickness: 4.5 },
  { outerWidth: 100, outerHeight: 100, thickness: 6.0 },
  { outerWidth: 125, outerHeight: 125, thickness: 4.5 },
  { outerWidth: 125, outerHeight: 125, thickness: 6.0 },
  { outerWidth: 150, outerHeight: 150, thickness: 4.5 },
  { outerWidth: 150, outerHeight: 150, thickness: 6.0 },
  { outerWidth: 150, outerHeight: 150, thickness: 9.0 },
  { outerWidth: 200, outerHeight: 200, thickness: 6.0 },
  { outerWidth: 200, outerHeight: 200, thickness: 9.0 },
  { outerWidth: 250, outerHeight: 250, thickness: 6.0 },
  { outerWidth: 250, outerHeight: 250, thickness: 9.0 },
  // 矩形パイプ
  { outerWidth: 100, outerHeight: 50, thickness: 3.2 },
  { outerWidth: 100, outerHeight: 50, thickness: 4.5 },
  { outerWidth: 150, outerHeight: 75, thickness: 4.5 },
  { outerWidth: 150, outerHeight: 100, thickness: 4.5 },
  { outerWidth: 200, outerHeight: 100, thickness: 4.5 },
  { outerWidth: 200, outerHeight: 100, thickness: 6.0 },
].map((dims, i) => createStandardSection(
  `box-${i}`,
  `□${dims.outerWidth}×${dims.outerHeight}×${dims.thickness}`,
  'box',
  dims
)).filter((s): s is StandardSection => s !== null);

// H形鋼（JIS G 3192 熱間圧延H形鋼）
// 表記: H × B × t1 × t2 (高さ × フランジ幅 × ウェブ厚 × フランジ厚)
export const hBeamStandards: StandardSection[] = [
  // 細幅系列 (H x B where B is narrow)
  { webHeight: 100, flangeWidth: 50, webThickness: 5, flangeThickness: 7 },
  { webHeight: 100, flangeWidth: 100, webThickness: 6, flangeThickness: 8 },
  { webHeight: 125, flangeWidth: 60, webThickness: 6, flangeThickness: 8 },
  { webHeight: 125, flangeWidth: 125, webThickness: 6.5, flangeThickness: 9 },
  { webHeight: 150, flangeWidth: 75, webThickness: 5, flangeThickness: 7 },
  { webHeight: 150, flangeWidth: 100, webThickness: 6, flangeThickness: 9 },
  { webHeight: 150, flangeWidth: 150, webThickness: 7, flangeThickness: 10 },
  { webHeight: 175, flangeWidth: 90, webThickness: 5, flangeThickness: 8 },
  { webHeight: 175, flangeWidth: 175, webThickness: 7.5, flangeThickness: 11 },
  { webHeight: 198, flangeWidth: 99, webThickness: 4.5, flangeThickness: 7 },
  { webHeight: 200, flangeWidth: 100, webThickness: 5.5, flangeThickness: 8 },
  { webHeight: 194, flangeWidth: 150, webThickness: 6, flangeThickness: 9 },
  { webHeight: 200, flangeWidth: 200, webThickness: 8, flangeThickness: 12 },
  { webHeight: 248, flangeWidth: 124, webThickness: 5, flangeThickness: 8 },
  { webHeight: 250, flangeWidth: 125, webThickness: 6, flangeThickness: 9 },
  { webHeight: 244, flangeWidth: 175, webThickness: 7, flangeThickness: 11 },
  { webHeight: 250, flangeWidth: 250, webThickness: 9, flangeThickness: 14 },
  { webHeight: 298, flangeWidth: 149, webThickness: 5.5, flangeThickness: 8 },
  { webHeight: 300, flangeWidth: 150, webThickness: 6.5, flangeThickness: 9 },
  { webHeight: 294, flangeWidth: 200, webThickness: 8, flangeThickness: 12 },
  { webHeight: 300, flangeWidth: 300, webThickness: 10, flangeThickness: 15 },
  { webHeight: 346, flangeWidth: 174, webThickness: 6, flangeThickness: 9 },
  { webHeight: 350, flangeWidth: 175, webThickness: 7, flangeThickness: 11 },
  { webHeight: 340, flangeWidth: 250, webThickness: 9, flangeThickness: 14 },
  { webHeight: 350, flangeWidth: 350, webThickness: 12, flangeThickness: 19 },
  // 400シリーズ
  { webHeight: 396, flangeWidth: 199, webThickness: 7, flangeThickness: 11 },
  { webHeight: 400, flangeWidth: 200, webThickness: 8, flangeThickness: 13 },
  { webHeight: 390, flangeWidth: 300, webThickness: 10, flangeThickness: 16 },
  { webHeight: 400, flangeWidth: 400, webThickness: 13, flangeThickness: 21 },
  { webHeight: 414, flangeWidth: 405, webThickness: 18, flangeThickness: 28 },
  { webHeight: 428, flangeWidth: 407, webThickness: 20, flangeThickness: 35 },
  { webHeight: 458, flangeWidth: 417, webThickness: 30, flangeThickness: 50 },
  { webHeight: 498, flangeWidth: 432, webThickness: 45, flangeThickness: 70 },
  // 450シリーズ
  { webHeight: 446, flangeWidth: 199, webThickness: 8, flangeThickness: 12 },
  { webHeight: 450, flangeWidth: 200, webThickness: 9, flangeThickness: 14 },
  { webHeight: 440, flangeWidth: 300, webThickness: 11, flangeThickness: 18 },
  // 500シリーズ
  { webHeight: 496, flangeWidth: 199, webThickness: 9, flangeThickness: 14 },
  { webHeight: 500, flangeWidth: 200, webThickness: 10, flangeThickness: 16 },
  { webHeight: 482, flangeWidth: 300, webThickness: 11, flangeThickness: 15 },
  { webHeight: 488, flangeWidth: 300, webThickness: 11, flangeThickness: 18 },
  // 600シリーズ
  { webHeight: 596, flangeWidth: 199, webThickness: 10, flangeThickness: 15 },
  { webHeight: 600, flangeWidth: 200, webThickness: 11, flangeThickness: 17 },
  { webHeight: 582, flangeWidth: 300, webThickness: 12, flangeThickness: 17 },
  { webHeight: 588, flangeWidth: 300, webThickness: 12, flangeThickness: 20 },
  // 700シリーズ
  { webHeight: 594, flangeWidth: 302, webThickness: 14, flangeThickness: 23 },
  { webHeight: 692, flangeWidth: 300, webThickness: 13, flangeThickness: 20 },
  { webHeight: 700, flangeWidth: 300, webThickness: 13, flangeThickness: 24 },
  // 800シリーズ
  { webHeight: 792, flangeWidth: 300, webThickness: 14, flangeThickness: 22 },
  { webHeight: 800, flangeWidth: 300, webThickness: 14, flangeThickness: 26 },
  // 900シリーズ
  { webHeight: 890, flangeWidth: 299, webThickness: 15, flangeThickness: 23 },
  { webHeight: 900, flangeWidth: 300, webThickness: 16, flangeThickness: 28 },
  { webHeight: 912, flangeWidth: 302, webThickness: 18, flangeThickness: 34 },
  { webHeight: 918, flangeWidth: 303, webThickness: 19, flangeThickness: 37 },
].map((dims, i) => createStandardSection(
  `h-beam-${i}`,
  `H${dims.webHeight}×${dims.flangeWidth}×${dims.webThickness}×${dims.flangeThickness}`,
  'h-beam',
  dims
)).filter((s): s is StandardSection => s !== null);

// 等辺山形鋼（JIS G 3192相当）
export const lAngleStandards: StandardSection[] = [
  // 等辺
  { legA: 25, legB: 25, legThickness: 3 },
  { legA: 30, legB: 30, legThickness: 3 },
  { legA: 40, legB: 40, legThickness: 3 },
  { legA: 40, legB: 40, legThickness: 5 },
  { legA: 50, legB: 50, legThickness: 4 },
  { legA: 50, legB: 50, legThickness: 6 },
  { legA: 60, legB: 60, legThickness: 5 },
  { legA: 60, legB: 60, legThickness: 6 },
  { legA: 65, legB: 65, legThickness: 6 },
  { legA: 70, legB: 70, legThickness: 6 },
  { legA: 75, legB: 75, legThickness: 6 },
  { legA: 75, legB: 75, legThickness: 9 },
  { legA: 80, legB: 80, legThickness: 6 },
  { legA: 90, legB: 90, legThickness: 7 },
  { legA: 90, legB: 90, legThickness: 10 },
  { legA: 100, legB: 100, legThickness: 7 },
  { legA: 100, legB: 100, legThickness: 10 },
  { legA: 100, legB: 100, legThickness: 13 },
  { legA: 120, legB: 120, legThickness: 8 },
  { legA: 130, legB: 130, legThickness: 9 },
  { legA: 130, legB: 130, legThickness: 12 },
  { legA: 150, legB: 150, legThickness: 12 },
  { legA: 150, legB: 150, legThickness: 15 },
  // 不等辺
  { legA: 75, legB: 50, legThickness: 6 },
  { legA: 90, legB: 75, legThickness: 6 },
  { legA: 100, legB: 75, legThickness: 7 },
  { legA: 125, legB: 75, legThickness: 7 },
  { legA: 150, legB: 90, legThickness: 9 },
  { legA: 150, legB: 100, legThickness: 9 },
].map((dims, i) => createStandardSection(
  `l-angle-${i}`,
  `L${dims.legA}×${dims.legB}×${dims.legThickness}`,
  'l-angle',
  dims
)).filter((s): s is StandardSection => s !== null);

// 溝形鋼（JIS G 3192相当）
export const channelStandards: StandardSection[] = [
  { channelWidth: 40, channelHeight: 75, channelFlangeThickness: 5, channelWebThickness: 5 },
  { channelWidth: 45, channelHeight: 100, channelFlangeThickness: 6, channelWebThickness: 5 },
  { channelWidth: 50, channelHeight: 125, channelFlangeThickness: 6.5, channelWebThickness: 5.5 },
  { channelWidth: 53, channelHeight: 150, channelFlangeThickness: 7.5, channelWebThickness: 6.5 },
  { channelWidth: 58, channelHeight: 180, channelFlangeThickness: 8, channelWebThickness: 7 },
  { channelWidth: 65, channelHeight: 200, channelFlangeThickness: 9, channelWebThickness: 7.5 },
  { channelWidth: 75, channelHeight: 250, channelFlangeThickness: 11, channelWebThickness: 9 },
  { channelWidth: 80, channelHeight: 300, channelFlangeThickness: 12, channelWebThickness: 9 },
  { channelWidth: 85, channelHeight: 380, channelFlangeThickness: 13.5, channelWebThickness: 10.5 },
].map((dims, i) => createStandardSection(
  `channel-${i}`,
  `[${dims.channelHeight}×${dims.channelWidth}×${dims.channelWebThickness}×${dims.channelFlangeThickness}`,
  'channel',
  dims
)).filter((s): s is StandardSection => s !== null);

// 全規格断面を形状タイプごとに取得
export function getStandardSections(type: SectionShapeType): StandardSection[] {
  switch (type) {
    case 'circle':
      return circleStandards;
    case 'pipe':
      return pipeStandards;
    case 'rectangle':
      return []; // 矩形は規格断面なし
    case 'box':
      return boxStandards;
    case 'h-beam':
      return hBeamStandards;
    case 'l-angle':
      return lAngleStandards;
    case 'channel':
      return channelStandards;
    default:
      return [];
  }
}
