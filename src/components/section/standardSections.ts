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

// H形鋼（JIS G 3192相当）
export const hBeamStandards: StandardSection[] = [
  // 細幅H形鋼
  { flangeWidth: 100, webHeight: 100, flangeThickness: 6, webThickness: 6 },
  { flangeWidth: 100, webHeight: 200, flangeThickness: 8, webThickness: 5.5 },
  { flangeWidth: 125, webHeight: 250, flangeThickness: 9, webThickness: 6 },
  { flangeWidth: 150, webHeight: 300, flangeThickness: 9, webThickness: 6.5 },
  { flangeWidth: 150, webHeight: 350, flangeThickness: 12, webThickness: 7 },
  { flangeWidth: 175, webHeight: 400, flangeThickness: 11, webThickness: 8 },
  { flangeWidth: 175, webHeight: 450, flangeThickness: 11, webThickness: 9 },
  { flangeWidth: 200, webHeight: 500, flangeThickness: 14, webThickness: 10 },
  { flangeWidth: 200, webHeight: 600, flangeThickness: 15, webThickness: 11 },
  // 中幅H形鋼
  { flangeWidth: 150, webHeight: 150, flangeThickness: 7, webThickness: 7 },
  { flangeWidth: 175, webHeight: 175, flangeThickness: 7.5, webThickness: 7.5 },
  { flangeWidth: 200, webHeight: 200, flangeThickness: 8, webThickness: 8 },
  { flangeWidth: 200, webHeight: 200, flangeThickness: 12, webThickness: 12 },
  { flangeWidth: 250, webHeight: 250, flangeThickness: 9, webThickness: 9 },
  { flangeWidth: 250, webHeight: 250, flangeThickness: 14, webThickness: 14 },
  { flangeWidth: 300, webHeight: 300, flangeThickness: 10, webThickness: 10 },
  { flangeWidth: 300, webHeight: 300, flangeThickness: 15, webThickness: 15 },
  { flangeWidth: 350, webHeight: 350, flangeThickness: 12, webThickness: 12 },
  { flangeWidth: 400, webHeight: 400, flangeThickness: 13, webThickness: 13 },
  // 広幅H形鋼
  { flangeWidth: 200, webHeight: 100, flangeThickness: 10, webThickness: 6 },
  { flangeWidth: 300, webHeight: 150, flangeThickness: 12, webThickness: 6.5 },
  { flangeWidth: 300, webHeight: 200, flangeThickness: 16, webThickness: 10 },
  { flangeWidth: 300, webHeight: 300, flangeThickness: 20, webThickness: 12 },
  { flangeWidth: 400, webHeight: 200, flangeThickness: 16, webThickness: 10 },
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
