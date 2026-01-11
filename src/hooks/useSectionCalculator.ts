import { useState, useMemo, useCallback } from 'react';
import type { SectionShapeType, SectionDimensions, SectionProperties } from '../types';

interface UseSectionCalculatorReturn {
  shapeType: SectionShapeType;
  setShapeType: (type: SectionShapeType) => void;
  dimensions: SectionDimensions;
  setDimensions: (dims: SectionDimensions) => void;
  updateDimension: (key: keyof SectionDimensions, value: number) => void;
  properties: SectionProperties | null;
  isValid: boolean;
  validationErrors: string[];
}

// 断面性能計算関数
export function calculateSectionProperties(
  shapeType: SectionShapeType,
  dimensions: SectionDimensions
): SectionProperties | null {
  switch (shapeType) {
    case 'circle':
      return calculateCircle(dimensions);
    case 'pipe':
      return calculatePipe(dimensions);
    case 'rectangle':
      return calculateRectangle(dimensions);
    case 'box':
      return calculateBox(dimensions);
    case 'h-beam':
      return calculateHBeam(dimensions);
    case 'l-angle':
      return calculateLAngle(dimensions);
    case 'channel':
      return calculateChannel(dimensions);
    default:
      return null;
  }
}

// 円形断面
function calculateCircle(dims: SectionDimensions): SectionProperties | null {
  const D = dims.diameter;
  if (!D || D <= 0) return null;

  const r = D / 2;
  const area = Math.PI * r * r;
  const I = (Math.PI * Math.pow(D, 4)) / 64;
  const Z = (Math.PI * Math.pow(D, 3)) / 32;
  const i = Math.sqrt(I / area);

  return {
    area,
    momentOfInertiaX: I,
    momentOfInertiaY: I,
    radiusOfGyrationX: i,
    radiusOfGyrationY: i,
    sectionModulusX: Z,
    sectionModulusY: Z,
  };
}

// 丸パイプ（中空円形）
function calculatePipe(dims: SectionDimensions): SectionProperties | null {
  const D = dims.outerDiameter;
  const d = dims.innerDiameter;
  if (!D || !d || D <= 0 || d <= 0 || d >= D) return null;

  const area = (Math.PI / 4) * (D * D - d * d);
  const I = (Math.PI / 64) * (Math.pow(D, 4) - Math.pow(d, 4));
  const Z = I / (D / 2);
  const i = Math.sqrt(I / area);

  return {
    area,
    momentOfInertiaX: I,
    momentOfInertiaY: I,
    radiusOfGyrationX: i,
    radiusOfGyrationY: i,
    sectionModulusX: Z,
    sectionModulusY: Z,
  };
}

// 矩形断面
function calculateRectangle(dims: SectionDimensions): SectionProperties | null {
  const B = dims.width;
  const H = dims.height;
  if (!B || !H || B <= 0 || H <= 0) return null;

  const area = B * H;
  const Ix = (B * Math.pow(H, 3)) / 12;
  const Iy = (H * Math.pow(B, 3)) / 12;
  const Zx = (B * Math.pow(H, 2)) / 6;
  const Zy = (H * Math.pow(B, 2)) / 6;
  const ix = Math.sqrt(Ix / area);
  const iy = Math.sqrt(Iy / area);

  return {
    area,
    momentOfInertiaX: Ix,
    momentOfInertiaY: Iy,
    radiusOfGyrationX: ix,
    radiusOfGyrationY: iy,
    sectionModulusX: Zx,
    sectionModulusY: Zy,
  };
}

// 角パイプ（中空矩形）
function calculateBox(dims: SectionDimensions): SectionProperties | null {
  const B = dims.outerWidth;
  const H = dims.outerHeight;
  const t = dims.thickness;

  if (!B || !H || !t || B <= 0 || H <= 0 || t <= 0) return null;
  if (t * 2 >= B || t * 2 >= H) return null;

  const b = B - 2 * t;
  const h = H - 2 * t;

  const area = B * H - b * h;
  const Ix = (B * Math.pow(H, 3) - b * Math.pow(h, 3)) / 12;
  const Iy = (H * Math.pow(B, 3) - h * Math.pow(b, 3)) / 12;
  const Zx = Ix / (H / 2);
  const Zy = Iy / (B / 2);
  const ix = Math.sqrt(Ix / area);
  const iy = Math.sqrt(Iy / area);

  return {
    area,
    momentOfInertiaX: Ix,
    momentOfInertiaY: Iy,
    radiusOfGyrationX: ix,
    radiusOfGyrationY: iy,
    sectionModulusX: Zx,
    sectionModulusY: Zy,
  };
}

// H型断面
function calculateHBeam(dims: SectionDimensions): SectionProperties | null {
  const B = dims.flangeWidth;
  const H = dims.webHeight;
  const tf = dims.flangeThickness;
  const tw = dims.webThickness;

  if (!B || !H || !tf || !tw) return null;
  if (B <= 0 || H <= 0 || tf <= 0 || tw <= 0) return null;
  if (2 * tf >= H || tw >= B) return null;

  // 面積 = 2 * フランジ + ウェブ
  const webH = H - 2 * tf;
  const area = 2 * B * tf + webH * tw;

  // 強軸（X軸）周り
  const Ix = (B * Math.pow(H, 3) - (B - tw) * Math.pow(webH, 3)) / 12;
  const Zx = Ix / (H / 2);
  const ix = Math.sqrt(Ix / area);

  // 弱軸（Y軸）周り
  const Iy = (2 * tf * Math.pow(B, 3) + webH * Math.pow(tw, 3)) / 12;
  const Zy = Iy / (B / 2);
  const iy = Math.sqrt(Iy / area);

  return {
    area,
    momentOfInertiaX: Ix,
    momentOfInertiaY: Iy,
    radiusOfGyrationX: ix,
    radiusOfGyrationY: iy,
    sectionModulusX: Zx,
    sectionModulusY: Zy,
  };
}

// L型断面（等辺・不等辺山形鋼）
function calculateLAngle(dims: SectionDimensions): SectionProperties | null {
  const A = dims.legA;
  const B = dims.legB;
  const t = dims.legThickness;

  if (!A || !B || !t) return null;
  if (A <= 0 || B <= 0 || t <= 0) return null;
  if (t >= A || t >= B) return null;

  // 面積
  const area = t * (A + B - t);

  // 図心位置（角からの距離）
  // 辺Aの方向をX軸、辺Bの方向をY軸とする
  const Cx = (A * t * (A / 2) + (B - t) * t * (t / 2)) / area;
  const Cy = (B * t * (B / 2) + (A - t) * t * (t / 2)) / area;

  // 断面2次モーメント（図心周り）
  // 辺A（水平）部分
  const IxA = (A * Math.pow(t, 3)) / 12 + A * t * Math.pow(Cy - t / 2, 2);
  // 辺B（垂直）部分（重複部分を除く）
  const IxB = (t * Math.pow(B - t, 3)) / 12 + t * (B - t) * Math.pow((B + t) / 2 - Cy, 2);
  const Ix = IxA + IxB;

  const IyA = (t * Math.pow(A, 3)) / 12 + A * t * Math.pow(A / 2 - Cx, 2);
  const IyB = ((B - t) * Math.pow(t, 3)) / 12 + (B - t) * t * Math.pow(Cx - t / 2, 2);
  const Iy = IyA + IyB;

  // 断面係数（最外縁までの距離で計算）
  const exTop = B - Cy;
  const exBottom = Cy;
  const eyRight = A - Cx;
  const eyLeft = Cx;

  const Zx = Ix / Math.max(exTop, exBottom);
  const Zy = Iy / Math.max(eyRight, eyLeft);

  const ix = Math.sqrt(Ix / area);
  const iy = Math.sqrt(Iy / area);

  return {
    area,
    momentOfInertiaX: Ix,
    momentOfInertiaY: Iy,
    radiusOfGyrationX: ix,
    radiusOfGyrationY: iy,
    sectionModulusX: Zx,
    sectionModulusY: Zy,
    centroidX: Cx,
    centroidY: Cy,
  };
}

// 溝型断面（チャンネル）
function calculateChannel(dims: SectionDimensions): SectionProperties | null {
  const B = dims.channelWidth;
  const H = dims.channelHeight;
  const tf = dims.channelFlangeThickness;
  const tw = dims.channelWebThickness;

  if (!B || !H || !tf || !tw) return null;
  if (B <= 0 || H <= 0 || tf <= 0 || tw <= 0) return null;
  if (2 * tf >= H || tw >= B) return null;

  // 面積
  const area = 2 * B * tf + (H - 2 * tf) * tw;

  // 図心位置（ウェブから）
  const webH = H - 2 * tf;
  // 上下フランジ + ウェブの面積モーメント
  const Cx = (2 * B * tf * (B / 2) + webH * tw * (tw / 2)) / area;

  // X軸（強軸）周りの断面2次モーメント
  const Ix = (tw * Math.pow(H, 3) + 2 * (B - tw) * Math.pow(tf, 3)) / 12
           + 2 * (B - tw) * tf * Math.pow((H - tf) / 2, 2);

  // Y軸（弱軸）周りの断面2次モーメント（図心周り）
  const IyFlanges = 2 * ((tf * Math.pow(B, 3)) / 12 + B * tf * Math.pow(B / 2 - Cx, 2));
  const IyWeb = (webH * Math.pow(tw, 3)) / 12 + webH * tw * Math.pow(Cx - tw / 2, 2);
  const Iy = IyFlanges + IyWeb;

  // 断面係数
  const Zx = Ix / (H / 2);
  const ZyInner = Iy / Cx;
  const ZyOuter = Iy / (B - Cx);
  const Zy = Math.min(ZyInner, ZyOuter);

  const ix = Math.sqrt(Ix / area);
  const iy = Math.sqrt(Iy / area);

  return {
    area,
    momentOfInertiaX: Ix,
    momentOfInertiaY: Iy,
    radiusOfGyrationX: ix,
    radiusOfGyrationY: iy,
    sectionModulusX: Zx,
    sectionModulusY: Zy,
    centroidX: Cx,
    centroidY: H / 2,
  };
}

// バリデーション
function validateDimensions(
  shapeType: SectionShapeType,
  dimensions: SectionDimensions
): string[] {
  const errors: string[] = [];

  switch (shapeType) {
    case 'circle':
      if (!dimensions.diameter || dimensions.diameter <= 0) {
        errors.push('直径は正の値を入力してください');
      }
      break;
    case 'pipe':
      if (!dimensions.outerDiameter || dimensions.outerDiameter <= 0) {
        errors.push('外径は正の値を入力してください');
      }
      if (!dimensions.innerDiameter || dimensions.innerDiameter <= 0) {
        errors.push('内径は正の値を入力してください');
      }
      if (dimensions.outerDiameter && dimensions.innerDiameter &&
          dimensions.innerDiameter >= dimensions.outerDiameter) {
        errors.push('内径は外径より小さくしてください');
      }
      break;
    case 'rectangle':
      if (!dimensions.width || dimensions.width <= 0) {
        errors.push('幅は正の値を入力してください');
      }
      if (!dimensions.height || dimensions.height <= 0) {
        errors.push('高さは正の値を入力してください');
      }
      break;
    case 'box':
      if (!dimensions.outerWidth || dimensions.outerWidth <= 0) {
        errors.push('外幅は正の値を入力してください');
      }
      if (!dimensions.outerHeight || dimensions.outerHeight <= 0) {
        errors.push('外高さは正の値を入力してください');
      }
      if (!dimensions.thickness || dimensions.thickness <= 0) {
        errors.push('板厚は正の値を入力してください');
      }
      if (dimensions.thickness && dimensions.outerWidth &&
          dimensions.thickness * 2 >= dimensions.outerWidth) {
        errors.push('板厚が大きすぎます');
      }
      if (dimensions.thickness && dimensions.outerHeight &&
          dimensions.thickness * 2 >= dimensions.outerHeight) {
        errors.push('板厚が大きすぎます');
      }
      break;
    case 'h-beam':
      if (!dimensions.flangeWidth || dimensions.flangeWidth <= 0) {
        errors.push('フランジ幅は正の値を入力してください');
      }
      if (!dimensions.webHeight || dimensions.webHeight <= 0) {
        errors.push('ウェブ高さは正の値を入力してください');
      }
      if (!dimensions.flangeThickness || dimensions.flangeThickness <= 0) {
        errors.push('フランジ厚さは正の値を入力してください');
      }
      if (!dimensions.webThickness || dimensions.webThickness <= 0) {
        errors.push('ウェブ厚さは正の値を入力してください');
      }
      if (dimensions.flangeThickness && dimensions.webHeight &&
          dimensions.flangeThickness * 2 >= dimensions.webHeight) {
        errors.push('フランジ厚さが大きすぎます');
      }
      break;
    case 'l-angle':
      if (!dimensions.legA || dimensions.legA <= 0) {
        errors.push('辺Aは正の値を入力してください');
      }
      if (!dimensions.legB || dimensions.legB <= 0) {
        errors.push('辺Bは正の値を入力してください');
      }
      if (!dimensions.legThickness || dimensions.legThickness <= 0) {
        errors.push('厚さは正の値を入力してください');
      }
      if (dimensions.legThickness && dimensions.legA &&
          dimensions.legThickness >= dimensions.legA) {
        errors.push('厚さは辺Aより小さくしてください');
      }
      if (dimensions.legThickness && dimensions.legB &&
          dimensions.legThickness >= dimensions.legB) {
        errors.push('厚さは辺Bより小さくしてください');
      }
      break;
    case 'channel':
      if (!dimensions.channelWidth || dimensions.channelWidth <= 0) {
        errors.push('幅は正の値を入力してください');
      }
      if (!dimensions.channelHeight || dimensions.channelHeight <= 0) {
        errors.push('高さは正の値を入力してください');
      }
      if (!dimensions.channelFlangeThickness || dimensions.channelFlangeThickness <= 0) {
        errors.push('フランジ厚さは正の値を入力してください');
      }
      if (!dimensions.channelWebThickness || dimensions.channelWebThickness <= 0) {
        errors.push('ウェブ厚さは正の値を入力してください');
      }
      break;
  }

  return errors;
}

// カスタムフック
export function useSectionCalculator(): UseSectionCalculatorReturn {
  const [shapeType, setShapeType] = useState<SectionShapeType>('circle');
  const [dimensions, setDimensions] = useState<SectionDimensions>({
    diameter: 100,
  });

  const updateDimension = useCallback((key: keyof SectionDimensions, value: number) => {
    setDimensions(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const validationErrors = useMemo(
    () => validateDimensions(shapeType, dimensions),
    [shapeType, dimensions]
  );

  const isValid = validationErrors.length === 0;

  const properties = useMemo(() => {
    if (!isValid) return null;
    return calculateSectionProperties(shapeType, dimensions);
  }, [shapeType, dimensions, isValid]);

  // 形状タイプ変更時にデフォルト寸法をセット
  const handleSetShapeType = useCallback((type: SectionShapeType) => {
    setShapeType(type);
    switch (type) {
      case 'circle':
        setDimensions({ diameter: 100 });
        break;
      case 'pipe':
        setDimensions({ outerDiameter: 100, innerDiameter: 80 });
        break;
      case 'rectangle':
        setDimensions({ width: 100, height: 200 });
        break;
      case 'box':
        setDimensions({ outerWidth: 100, outerHeight: 200, thickness: 10 });
        break;
      case 'h-beam':
        setDimensions({
          flangeWidth: 200,
          webHeight: 400,
          flangeThickness: 16,
          webThickness: 10,
        });
        break;
      case 'l-angle':
        setDimensions({ legA: 100, legB: 100, legThickness: 10 });
        break;
      case 'channel':
        setDimensions({
          channelWidth: 75,
          channelHeight: 150,
          channelFlangeThickness: 10,
          channelWebThickness: 6,
        });
        break;
    }
  }, []);

  return {
    shapeType,
    setShapeType: handleSetShapeType,
    dimensions,
    setDimensions,
    updateDimension,
    properties,
    isValid,
    validationErrors,
  };
}
