// Matrix Editor Types
export interface MatrixData {
  type: string;
  rows: number;
  cols: number;
  cells: string[][];
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

export interface ContextMenuData {
  x: number;
  y: number;
  type: 'row' | 'col' | 'cell';
  index: number;
}

// Figure Layout Types
export interface ImageItem {
  id: string;
  file: File;
  url: string;
  caption: string;
  width: number;
  height: number;
}

export interface LayoutConfig {
  rows: number;
  cols: number;
  gap: number;
  padding: number;
}

export interface CaptionConfig {
  fontSize: number;
  color: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  fontFamily: string;
}

// PDF Converter Types
export interface PDFConversionSettings {
  dpiMode: 'preset' | 'custom';
  dpiPreset: 200 | 350 | 500;
  customDPI: number; // 200-800
}

export interface PDFConversionProgress {
  currentPage: number;
  totalPages: number;
  status: 'loading' | 'processing' | 'completed' | 'error';
  message?: string;
  outputFileSize?: number; // 出力ファイルサイズ（バイト）
}

export interface PDFFileInfo {
  file: File;
  name: string;
  size: number;
  pages: number;
}

// Section Property Calculator Types
export type SectionShapeType =
  | 'circle'        // 丸
  | 'pipe'          // 丸パイプ
  | 'rectangle'     // 四角
  | 'box'           // 角パイプ
  | 'h-beam'        // H型
  | 'l-angle'       // L型
  | 'channel';      // 溝型

export interface SectionDimensions {
  // 円形断面 (circle)
  diameter?: number;          // 直径 D

  // 丸パイプ (pipe)
  outerDiameter?: number;     // 外径 D
  innerDiameter?: number;     // 内径 d

  // 矩形断面 (rectangle)
  width?: number;             // 幅 B
  height?: number;            // 高さ H

  // 角パイプ (box)
  outerWidth?: number;        // 外幅 B
  outerHeight?: number;       // 外高さ H
  innerWidth?: number;        // 内幅 b
  innerHeight?: number;       // 内高さ h
  thickness?: number;         // 板厚 t

  // H型 (h-beam)
  flangeWidth?: number;       // フランジ幅 B
  webHeight?: number;         // ウェブ高さ H
  flangeThickness?: number;   // フランジ厚さ tf
  webThickness?: number;      // ウェブ厚さ tw

  // L型 (l-angle)
  legA?: number;              // 辺A
  legB?: number;              // 辺B
  legThickness?: number;      // 厚さ t

  // 溝型 (channel)
  channelWidth?: number;      // 幅 B
  channelHeight?: number;     // 高さ H
  channelFlangeThickness?: number;  // フランジ厚さ tf
  channelWebThickness?: number;     // ウェブ厚さ tw
}

export interface SectionProperties {
  area: number;               // 断面積 A (mm²)
  momentOfInertiaX: number;   // 断面2次モーメント Ix (mm⁴)
  momentOfInertiaY: number;   // 断面2次モーメント Iy (mm⁴)
  radiusOfGyrationX: number;  // 断面2次半径 ix (mm)
  radiusOfGyrationY: number;  // 断面2次半径 iy (mm)
  sectionModulusX: number;    // 断面係数 Zx (mm³)
  sectionModulusY: number;    // 断面係数 Zy (mm³)
  centroidX?: number;         // 図心位置 Cx (mm) - L型、溝型用
  centroidY?: number;         // 図心位置 Cy (mm) - L型、溝型用
}

export interface StandardSection {
  id: string;
  name: string;
  type: SectionShapeType;
  dimensions: SectionDimensions;
  properties: SectionProperties;
}

// Common App Types
export type AppTab = 'matrix' | 'figure' | 'pdf' | 'markdown' | 'boring' | 'section';