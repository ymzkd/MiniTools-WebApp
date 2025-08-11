/**
 * PDF page size detection and format utilities
 */

export interface PageFormat {
  format: string | [number, number]; // 標準サイズ名 または [width, height] in mm
  orientation: 'portrait' | 'landscape' | 'p' | 'l';
  width: number; // in mm
  height: number; // in mm
  name: string; // 表示用の名前
}

// 標準用紙サイズ定義（ポイント単位: 1pt = 0.352778mm）
const STANDARD_SIZES = {
  'a3': { w: 842, h: 1191, name: 'A3' },
  'a4': { w: 595, h: 842, name: 'A4' },
  'a5': { w: 420, h: 595, name: 'A5' },
  'letter': { w: 612, h: 792, name: 'Letter' },
  'legal': { w: 612, h: 1008, name: 'Legal' },
  'tabloid': { w: 792, h: 1224, name: 'Tabloid' }, // 11x17
  'ledger': { w: 1224, h: 792, name: 'Ledger' }, // 17x11
} as const;

// ポイントからミリメートルへの変換係数
const PT_TO_MM = 0.352778;

/**
 * 2つのサイズが許容誤差内で一致するかチェック
 */
function matchesSize(
  width: number, 
  height: number, 
  standardSize: { w: number; h: number }, 
  tolerance: number = 5
): boolean {
  const wDiff = Math.abs(width - standardSize.w);
  const hDiff = Math.abs(height - standardSize.h);
  return wDiff <= tolerance && hDiff <= tolerance;
}

/**
 * PDF.jsのviewportサイズから用紙サイズと向きを検出
 * @param viewportWidth - ビューポート幅（ピクセル/ポイント）
 * @param viewportHeight - ビューポート高さ（ピクセル/ポイント）
 * @returns 検出されたページフォーマット情報
 */
export function detectPDFPageSize(viewportWidth: number, viewportHeight: number): PageFormat {
  // 横向きの場合は正規化（幅 > 高さ -> 縦向きに正規化）
  const isLandscape = viewportWidth > viewportHeight;
  const normalizedWidth = isLandscape ? viewportHeight : viewportWidth;
  const normalizedHeight = isLandscape ? viewportWidth : viewportHeight;
  
  // 標準サイズとのマッチング
  for (const [formatName, size] of Object.entries(STANDARD_SIZES)) {
    if (matchesSize(normalizedWidth, normalizedHeight, size)) {
      return {
        format: formatName,
        orientation: isLandscape ? 'landscape' : 'portrait',
        width: size.w * PT_TO_MM,
        height: size.h * PT_TO_MM,
        name: `${size.name} ${isLandscape ? '横向き' : '縦向き'}`
      };
    }
  }
  
  // カスタムサイズの場合
  const customWidth = normalizedWidth * PT_TO_MM;
  const customHeight = normalizedHeight * PT_TO_MM;
  
  return {
    format: isLandscape ? [customHeight, customWidth] : [customWidth, customHeight],
    orientation: isLandscape ? 'landscape' : 'portrait', 
    width: customWidth,
    height: customHeight,
    name: `カスタム (${Math.round(customWidth)}×${Math.round(customHeight)}mm) ${isLandscape ? '横向き' : '縦向き'}`
  };
}

/**
 * 2つのページフォーマットが等しいかチェック
 */
export function formatsEqual(format1: PageFormat, format2: PageFormat): boolean {
  if (typeof format1.format === 'string' && typeof format2.format === 'string') {
    return format1.format === format2.format && format1.orientation === format2.orientation;
  }
  
  if (Array.isArray(format1.format) && Array.isArray(format2.format)) {
    return format1.format[0] === format2.format[0] && 
           format1.format[1] === format2.format[1] &&
           format1.orientation === format2.orientation;
  }
  
  return false;
}

/**
 * ページフォーマットからjsPDF用の設定を生成
 */
export function getJsPDFConfig(pageFormat: PageFormat) {
  return {
    orientation: pageFormat.orientation === 'landscape' ? 'l' as const : 'p' as const,
    unit: 'mm' as const,
    format: pageFormat.format
  };
}

/**
 * 複数のページフォーマット情報をまとめて分析
 */
export function analyzePageFormats(pageFormats: PageFormat[]) {
  if (pageFormats.length === 0) {
    throw new Error('ページフォーマット情報がありません');
  }
  
  // 最初のページをベースフォーマットとする
  const baseFormat = pageFormats[0];
  
  // 全ページが同じフォーマットかチェック
  const hasUniformFormat = pageFormats.every(format => formatsEqual(format, baseFormat));
  
  // ユニークなフォーマットを抽出
  const uniqueFormats = pageFormats.reduce<PageFormat[]>((unique, current) => {
    if (!unique.some(format => formatsEqual(format, current))) {
      unique.push(current);
    }
    return unique;
  }, []);
  
  return {
    baseFormat,
    hasUniformFormat,
    uniqueFormats,
    formatCount: uniqueFormats.length,
    summary: hasUniformFormat 
      ? `全${pageFormats.length}ページ: ${baseFormat.name}`
      : `${pageFormats.length}ページ中${uniqueFormats.length}種類のサイズ: ${uniqueFormats.map(f => f.name).join(', ')}`
  };
}

/**
 * ページサイズに基づいて最適なDPIを決定（図面・技術資料向けに高品質重視）
 */
export function getOptimalDPIForPageSize(pageFormat: PageFormat, compressionLevel: 'low' | 'medium' | 'high'): number {
  // 1:1スケール保持の場合、DPIは関係ないが、将来的な拡張のために残す
  // 図面や技術資料では品質を重視
  const baseDPI = compressionLevel === 'low' ? 300 : compressionLevel === 'medium' ? 250 : 200;
  
  // ページサイズが大きいほどわずかに高いDPIを使用（細かい図面要素のため）
  const pageArea = pageFormat.width * pageFormat.height; // mm²
  const a4Area = 210 * 297; // A4の面積
  const sizeRatio = pageArea / a4Area;
  
  if (sizeRatio > 1.5) {
    return Math.min(baseDPI + 50, 350); // A3以上の場合
  } else if (sizeRatio < 0.7) {
    return Math.max(baseDPI - 20, 150); // A5以下の場合（品質保持のため高めに）
  }
  
  return baseDPI;
}