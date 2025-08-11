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

// Common App Types
export type AppTab = 'matrix' | 'figure' | 'pdf';