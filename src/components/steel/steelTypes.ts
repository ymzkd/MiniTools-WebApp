// 断面形状タイプ
export type SteelSectionType =
  | 'h-beam'        // H型断面
  | 'channel'       // みぞ形断面
  | 'l-angle'       // L形断面
  | 't-shape'       // T形断面
  | 'box'           // 角パイプ
  | 'pipe'          // 丸パイプ
  | 'circle'        // 円形中実断面
  | 'rectangle'     // 矩形中実断面
  | 'lip-channel';  // リップみぞ形

// 部材種別
export type MemberType = 'column' | 'beam';

// 計算方法
export type BendingMethod = 'technical-standard' | 'aij-standard';

// モーメント分布タイプ
export type MomentDistribution = 'monotonic' | 'max-in-span';

// 断面寸法
export interface SteelDimensions {
  H: number;   // 梁せい / 高さ (mm)
  B: number;   // フランジ幅 / 幅 (mm)
  tw: number;  // ウェブ厚 (mm)
  tf: number;  // フランジ厚 (mm)
  r: number;   // フィレット半径 / コーナーR (mm)
  D: number;   // 直径 (mm) - 円形・丸パイプ用
  t: number;   // 板厚 (mm) - パイプ・リップ用
  C: number;   // リップ長 (mm) - リップみぞ形用
}

// 断面性能（入力）
export interface SectionPropertiesInput {
  A: number;    // 断面積 (mm²)
  Ix: number;   // 強軸断面二次モーメント (mm⁴)
  Iy: number;   // 弱軸断面二次モーメント (mm⁴)
  Zx: number;   // 強軸断面係数 (mm³)
  Zy: number;   // 弱軸断面係数 (mm³)
  ix: number;   // 強軸断面二次半径 (mm)
  iy: number;   // 弱軸断面二次半径 (mm)
}

// 材料パラメータ
export interface MaterialParams {
  F: number;     // 基準強度 (N/mm²)
  E: number;     // ヤング係数 (N/mm²)
  G: number;     // せん断弾性係数 (N/mm²)
}

// 横座屈パラメータ
export interface LateralBucklingParams {
  lb: number;             // 横座屈補剛間距離 (mm)
  M1: number;             // 大きい方のモーメント (kN·m)
  M2: number;             // 小さい方のモーメント (kN·m)
  momentDist: MomentDistribution;  // モーメント分布
  doubleCurvature: boolean;        // 複曲率かどうか
}

// ねじり定数の計算結果
export interface TorsionConstants {
  J: number;    // サンブナンねじり定数 (mm⁴)
  Iw: number;   // 曲げねじり定数 (mm⁶)
}

// 補正係数
export interface CorrectionFactors {
  C: number;          // モーメント勾配補正係数
  pLambdaB: number;   // 塑性限界細長比
}

// 曲げ許容応力度結果
export interface BendingResult {
  fb: number;          // 長期曲げ許容応力度 (N/mm²)
  fb_short: number;    // 短期曲げ許容応力度 (N/mm²)
  ft: number;          // 長期許容引張応力度 (N/mm²)
  method: BendingMethod;
  // 技術基準法の場合
  fb1?: number;
  fb2?: number;
  i_T?: number;       // T形断面の断面二次半径
  // AIJ規準の場合
  Me?: number;         // 弾性横座屈モーメント (N·mm)
  My?: number;         // 降伏モーメント (N·mm)
  lambdaB?: number;    // 曲げ材の細長比
  pLambdaB?: number;   // 塑性限界細長比
  eLambdaB?: number;   // 弾性限界細長比
  nu?: number;         // 安全率
  region?: 'plastic' | 'inelastic' | 'elastic';
}

// せん断許容応力度結果
export interface ShearResult {
  fs_long: number;     // 長期許容せん断応力度 (N/mm²)
  fs_short: number;    // 短期許容せん断応力度 (N/mm²)
  Asy: number;         // y方向せん断負担面積 (mm²)
  Asx: number;         // x方向せん断負担面積 (mm²)
  kappaY: number;      // y方向せん断形状係数
  kappaX: number;      // x方向せん断形状係数
}

// 圧縮許容応力度結果
export interface CompressionResult {
  fc: number;          // 長期許容圧縮応力度 (N/mm²)
  fc_short: number;    // 短期許容圧縮応力度 (N/mm²)
  lambda: number;      // 細長比
  Lambda: number;      // 限界細長比
  nu: number;          // 安全率
  region: 'short' | 'long';  // 短柱 or 長柱
}

// 幅厚比検定結果
export interface WidthThicknessResult {
  checks: WidthThicknessCheck[];
  isOk: boolean;
  warning?: string;
}

export interface WidthThicknessCheck {
  part: string;        // 部位名
  ratio: number;       // 幅厚比
  limit: number;       // 規定値
  isOk: boolean;
}

// 有効断面性能
export interface EffectiveSectionResult {
  Aeff: number;        // 有効断面積 (mm²)
  Zxeff: number;       // 有効断面係数（強軸）(mm³)
  Zyeff: number;       // 有効断面係数（弱軸）(mm³)
  deltaH: number;
  deltaB: number;
  deltaC?: number;     // リップみぞ形用
}

// 計算対象
export type CalcTarget = 'bending' | 'shear' | 'compression';

// 全体の計算結果
export interface SteelCalculationResult {
  bending?: BendingResult;
  shear?: ShearResult;
  compression?: CompressionResult;
  widthThickness?: WidthThicknessResult;
  effectiveSection?: EffectiveSectionResult;
  torsionConstants?: TorsionConstants;
  correctionFactors?: CorrectionFactors;
}

// デフォルト材料
export const STEEL_MATERIALS: { label: string; F: number }[] = [
  { label: 'SS400 (t≤40)', F: 235 },
  { label: 'SS400 (40<t≤75)', F: 215 },
  { label: 'SN400B/C (t≤40)', F: 235 },
  { label: 'SN400B/C (40<t≤75)', F: 215 },
  { label: 'SN490B/C (t≤40)', F: 325 },
  { label: 'SN490B/C (40<t≤75)', F: 295 },
  { label: 'SS490 (t≤40)', F: 275 },
  { label: 'SS490 (40<t≤75)', F: 255 },
  { label: 'SM490A/B (t≤40)', F: 325 },
  { label: 'SM490A/B (40<t≤75)', F: 295 },
  { label: 'BCR295', F: 295 },
  { label: 'BCP325', F: 325 },
  { label: 'STKR400', F: 235 },
  { label: 'STKR490', F: 325 },
  { label: 'STK400', F: 235 },
  { label: 'STK490', F: 325 },
];

export const DEFAULT_ELASTIC_CONSTANTS = {
  E: 205000,  // N/mm²
  G: 79000,   // N/mm²
};
