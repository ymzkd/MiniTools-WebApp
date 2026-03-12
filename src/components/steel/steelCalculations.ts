import type {
  SteelSectionType,
  MemberType,
  SteelDimensions,
  SectionPropertiesInput,
  MaterialParams,
  LateralBucklingParams,
  TorsionConstants,
  CorrectionFactors,
  BendingResult,
  ShearResult,
  CompressionResult,
  WidthThicknessResult,
  WidthThicknessCheck,
  EffectiveSectionResult,
  BendingMethod,
} from './steelTypes';

// ========== 補正係数 ==========
export function calcCorrectionFactors(params: LateralBucklingParams): CorrectionFactors {
  if (params.momentDist === 'max-in-span') {
    return { C: 1.0, pLambdaB: 0.3 };
  }

  const M1 = Math.abs(params.M1);
  const M2 = Math.abs(params.M2);
  if (M1 === 0) {
    return { C: 1.75, pLambdaB: 0.6 };
  }

  // 複曲率: +M2/M1, 単曲率: -M2/M1
  const ratio = params.doubleCurvature ? (M2 / M1) : -(M2 / M1);

  const C = Math.min(1.75 + 1.05 * ratio + 0.3 * ratio * ratio, 2.3);
  const pLambdaB = 0.6 + 0.3 * ratio;

  return { C, pLambdaB };
}

// ========== ねじり定数 ==========
export function calcTorsionConstants(
  sectionType: SteelSectionType,
  dims: SteelDimensions,
): TorsionConstants {
  const { H, B, tw, tf, D, t, r, C: lipC } = dims;

  switch (sectionType) {
    case 'h-beam': {
      const J = (1 / 3) * (2 * B * tf ** 3 + (H - 2 * tf) * tw ** 3);
      const If = (B ** 3 * tf) / 12;
      const Iw = (H - tf) ** 2 * (If / 2);
      return { J, Iw };
    }

    case 'circle': {
      const J = (Math.PI * D ** 4) / 32;
      return { J, Iw: 0 };
    }

    case 'box': {
      const rr = r > 0 ? r : t;
      const Am = B * H + rr ** 2 * Math.PI
        - (B + H + rr * Math.PI - 4 * rr) * t
        + (Math.PI / 4) * t ** 2
        - 4 * rr ** 2;
      const Lm = 2 * H + 2 * B - 8 * rr + 2 * Math.PI * rr - Math.PI * t;
      const J = (4 * Am ** 2 * t) / Lm;
      return { J, Iw: 0 };
    }

    case 'pipe': {
      const Am = (Math.PI * (D - t) ** 2) / 4;
      const Lm = (D - t) * Math.PI;
      const J = (4 * Am ** 2 * t) / Lm;
      return { J, Iw: 0 };
    }

    case 'rectangle': {
      const a = Math.max(H, B);
      const b = Math.min(H, B);
      const beta = (1 / 16) * (16 / 3 - 3.36 * (b / a) * (1 - (1 / 12) * (b / a) ** 4));
      const J = beta * b ** 3 * a;
      return { J, Iw: 0 };
    }

    case 'channel': {
      const J = (1 / 3) * (2 * B * tf ** 3 + (H - 2 * tf) * tw ** 3);
      const I1 = (tf * B * (H - tf) ** 2) / 4;
      const I3 = (tw * (H - tf) ** 3) / 12;
      const Iw = (B ** 2 * (I1 ** 2 + 2 * I1 * I3)) / (3 * (2 * I1 + I3));
      return { J, Iw };
    }

    case 'l-angle': {
      const J = (1 / 3) * (2 * (B - tw / 2) * tf ** 3 + (H - tf / 2) * tw ** 3);
      const Iw = ((B - tw / 2) ** 3 * tf ** 3 + (H - tf / 2) ** 3 * tw ** 3) / 36;
      return { J, Iw };
    }

    case 't-shape': {
      const J = (1 / 3) * ((H - tf / 2) * tw ** 3 + B * tf ** 3);
      const Iw = ((B * tf) ** 3) / 144 + (((H - tf / 2) * tw) ** 3) / 36;
      return { J, Iw };
    }

    case 'lip-channel': {
      const h = H - 2 * r - t;
      const b = B - 2 * r - t;
      const c = lipC - r - t / 2;
      const u = (Math.PI / 2) * r;
      const J = ((h + 2 * b + 2 * c + 4 * u) * t ** 3) / 3;
      // 曲げねじり定数は簡易的に0とする（精密計算は複雑）
      return { J, Iw: 0 };
    }

    default: {
      // その他: 近似式
      const A = H * B; // 概算
      const Ip = (H * B * (H ** 2 + B ** 2)) / 12;
      const J = A ** 4 / (40 * Ip);
      return { J, Iw: 0 };
    }
  }
}

// ========== T形断面の断面二次半径（技術基準法用） ==========
export function calcTShapeRadius(dims: SteelDimensions): number {
  const { H, B, tw, tf } = dims;
  const Af = B * tf;
  const hSixth = H / 6;
  const webHeight = Math.max(hSixth - tf, 0);
  const Aw = tw * webHeight;
  const AT = Af + Aw;

  const IyF = (tf * B ** 3) / 12;
  const IyW = (webHeight * tw ** 3) / 12;
  const IyT = IyF + IyW;

  return Math.sqrt(IyT / AT);
}

// ========== 長期許容引張応力度 ==========
export function calcFt(F: number): number {
  return F / 1.5;
}

// ========== 限界細長比 ==========
export function calcLimitSlenderness(F: number): number {
  return 1500 / Math.sqrt(F / 1.5);
}

// ========== 曲げ許容応力度（技術基準解説書） ==========
export function calcBendingTechnicalStandard(
  dims: SteelDimensions,
  material: MaterialParams,
  lb: number,
  correctionFactors: CorrectionFactors,
): BendingResult {
  const ft = calcFt(material.F);
  const Lambda = calcLimitSlenderness(material.F);
  const i = calcTShapeRadius(dims);
  const Af = dims.B * dims.tf;

  const fb1 = (1 - 0.4 * (lb / i) ** 2 / (correctionFactors.C * Lambda ** 2)) * ft;
  const fb2 = 89000 / (lb * dims.H / Af);

  const fb = Math.min(Math.max(fb1, fb2), ft);

  return {
    fb,
    fb_short: fb * 1.5,
    ft,
    method: 'technical-standard',
    fb1,
    fb2,
    i_T: i,
  };
}

// ========== 曲げ許容応力度（鋼構造許容応力度設計規準） ==========
export function calcBendingAIJStandard(
  sectionType: SteelSectionType,
  dims: SteelDimensions,
  props: SectionPropertiesInput,
  material: MaterialParams,
  lb: number,
  correctionFactors: CorrectionFactors,
): BendingResult {
  const ft = calcFt(material.F);

  // 弱軸周りに曲げ or 角型鋼管 or 円形鋼管 → fb = ft
  if (sectionType === 'box' || sectionType === 'pipe') {
    return {
      fb: ft,
      fb_short: ft * 1.5,
      ft,
      method: 'aij-standard',
      region: 'plastic',
    };
  }

  const torsion = calcTorsionConstants(sectionType, dims);
  const { E, G } = material;
  const { C } = correctionFactors;

  // 弾性横座屈モーメント Me
  const term1 = (Math.PI ** 4 * E * props.Iy * E * torsion.Iw) / (lb ** 4);
  const term2 = (Math.PI ** 2 * E * props.Iy * G * torsion.J) / (lb ** 2);
  const Me = C * Math.sqrt(term1 + term2);

  // 降伏モーメント My
  const My = material.F * props.Zx;

  // 細長比
  const lambdaB = Math.sqrt(My / Me);

  // 限界細長比
  const pLambdaB = correctionFactors.pLambdaB;
  const eLambdaB = 1 / Math.sqrt(0.6);

  let fb: number;
  let region: 'plastic' | 'inelastic' | 'elastic';

  if (lambdaB <= pLambdaB) {
    // (a) 塑性域
    const nu = 3 / 2 + (2 / 3) * (lambdaB / eLambdaB) ** 2;
    fb = material.F / nu;
    region = 'plastic';
  } else if (lambdaB <= eLambdaB) {
    // (b) 非弾性横座屈域
    const nu = 3 / 2 + (2 / 3) * (lambdaB / eLambdaB) ** 2;
    fb = ((1 - 0.4 * (lambdaB - pLambdaB) / (eLambdaB - pLambdaB)) * material.F) / nu;
    region = 'inelastic';
  } else {
    // (c) 弾性横座屈域
    fb = material.F / (lambdaB ** 2 * 2.17);
    region = 'elastic';
  }

  fb = Math.min(fb, ft);

  const nu = lambdaB <= eLambdaB
    ? 3 / 2 + (2 / 3) * (lambdaB / eLambdaB) ** 2
    : lambdaB ** 2 * 2.17;

  return {
    fb,
    fb_short: fb * 1.5,
    ft,
    method: 'aij-standard',
    Me,
    My,
    lambdaB,
    pLambdaB,
    eLambdaB,
    nu,
    region,
  };
}

// ========== せん断許容応力度 ==========
export function calcShearStress(material: MaterialParams): { fs_long: number; fs_short: number } {
  const fs_long = material.F / (1.5 * Math.sqrt(3));
  const fs_short = material.F / Math.sqrt(3);
  return { fs_long, fs_short };
}

// ========== せん断断面性能 ==========
export function calcShearProperties(
  sectionType: SteelSectionType,
  dims: SteelDimensions,
  props: SectionPropertiesInput,
): ShearResult {
  const { H, B, tw, tf, t, r } = dims;
  const { fs_long, fs_short } = calcShearStress({ F: 0, E: 0, G: 0 }); // placeholder
  let Asy: number, Asx: number, kappaY: number, kappaX: number;

  switch (sectionType) {
    case 'h-beam':
      Asy = tw * (H - 2 * tf);
      kappaY = 1.0;
      Asx = 2 * B * tf;
      kappaX = 1.2;
      break;
    case 'circle':
      Asy = props.A;
      kappaY = 4 / 3;
      Asx = props.A;
      kappaX = 4 / 3;
      break;
    case 'box':
      Asy = 2 * t * (H - 2 * r);
      kappaY = 1.0;
      Asx = 2 * t * (B - 2 * r);
      kappaX = 1.0;
      break;
    case 'pipe':
      Asy = props.A / 2;
      kappaY = 1.0;
      Asx = props.A / 2;
      kappaX = 1.0;
      break;
    case 'rectangle':
      Asy = props.A;
      kappaY = 3 / 2;
      Asx = props.A;
      kappaX = 3 / 2;
      break;
    case 'channel':
      Asy = tw * (H - 2 * tf);
      kappaY = 1.0;
      Asx = 2 * (B - tw) * tf;
      kappaX = 1.2;
      break;
    case 'l-angle':
      Asy = tw * (H - tf);
      kappaY = 1.2;
      Asx = tf * (B - tw);
      kappaX = 1.2;
      break;
    case 't-shape':
      Asy = tw * (H - tf);
      kappaY = 1.2;
      Asx = tf * B;
      kappaX = 1.2;
      break;
    case 'lip-channel':
      Asy = (H - 2 * r) * t;
      kappaY = 1.0;
      Asx = (H - 2 * r) * t;
      kappaX = 1.0;
      break;
    default:
      Asy = props.A;
      kappaY = 1.5;
      Asx = props.A;
      kappaX = 1.5;
  }

  return { fs_long, fs_short, Asy, Asx, kappaY, kappaX };
}

// ========== 圧縮許容応力度 ==========
export function calcCompressionStress(
  material: MaterialParams,
  lk: number,
  i: number,
): CompressionResult {
  const lambda = lk / i;
  const Lambda = Math.sqrt((Math.PI ** 2 * material.E) / (0.6 * material.F));

  let fc: number;
  let region: 'short' | 'long';

  if (lambda <= Lambda) {
    // 短柱
    const nu = 3 / 2 + (2 / 3) * (lambda / Lambda) ** 2;
    fc = (material.F / nu) * (1 - 0.4 * (lambda / Lambda) ** 2);
    region = 'short';
  } else {
    // 長柱
    fc = (0.277 * material.F) / (lambda / Lambda) ** 2;
    region = 'long';
  }

  const nu = 3 / 2 + (2 / 3) * (lambda / Lambda) ** 2;

  return {
    fc,
    fc_short: fc * 1.5,
    lambda,
    Lambda,
    nu,
    region,
  };
}

// ========== 幅厚比検定 ==========
export function calcWidthThicknessRatio(
  sectionType: SteelSectionType,
  dims: SteelDimensions,
  material: MaterialParams,
  memberType: MemberType,
): WidthThicknessResult {
  const { E, F } = material;
  const { H, B, tw, tf, D, t, r, C: lipC } = dims;
  const sqrtEF = Math.sqrt(E / F);
  const checks: WidthThicknessCheck[] = [];
  let warning: string | undefined;

  switch (sectionType) {
    case 'h-beam': {
      // フランジ幅厚比
      const flangeRatio = (B / 2) / tf;
      const flangeLimit = 0.53 * sqrtEF;
      checks.push({
        part: 'フランジ',
        ratio: flangeRatio,
        limit: flangeLimit,
        isOk: flangeRatio <= flangeLimit,
      });
      // ウェブ幅厚比
      const webRatio = (H - 2 * tf - 2 * r) / tw;
      const webLimit = memberType === 'column' ? 1.6 * sqrtEF : 2.4 * sqrtEF;
      checks.push({
        part: 'ウェブ',
        ratio: webRatio,
        limit: webLimit,
        isOk: webRatio <= webLimit,
      });
      break;
    }

    case 'channel': {
      const webRatio = (H - 2 * tf - 2 * r) / tw;
      const webLimit = memberType === 'column' ? 1.6 * sqrtEF : 2.4 * sqrtEF;
      checks.push({
        part: 'ウェブ',
        ratio: webRatio,
        limit: webLimit,
        isOk: webRatio <= webLimit,
      });
      break;
    }

    case 'box': {
      const rr = r > 0 ? r : t;
      const ratio = (H - 2 * rr) / t;
      const limit = 1.6 * sqrtEF;
      checks.push({
        part: '板',
        ratio,
        limit,
        isOk: ratio <= limit,
      });
      break;
    }

    case 'pipe': {
      const ratio = D / t;
      const limit = 0.114 * (E / F);
      checks.push({
        part: '径厚比',
        ratio,
        limit,
        isOk: ratio <= limit,
      });
      if (ratio > limit) {
        warning = '円形鋼管の径厚比が規定値を超えています。局部座屈により部材耐力が低下するため、検定不可。';
      }
      break;
    }

    case 'lip-channel': {
      const h = H - 2 * r - t;
      const b = B - 2 * r - t;
      const c = lipC - t / 2;
      const webLimit = memberType === 'column' ? 1.6 * sqrtEF : 2.4 * sqrtEF;
      checks.push({
        part: 'ウェブ',
        ratio: h / t,
        limit: webLimit,
        isOk: (h / t) <= webLimit,
      });
      checks.push({
        part: 'フランジ',
        ratio: b / t,
        limit: 1.6 * sqrtEF,
        isOk: (b / t) <= (1.6 * sqrtEF),
      });
      checks.push({
        part: 'リップ',
        ratio: c / t,
        limit: 0.53 * sqrtEF,
        isOk: (c / t) <= (0.53 * sqrtEF),
      });
      break;
    }

    default:
      break;
  }

  return {
    checks,
    isOk: checks.every(c => c.isOk),
    warning,
  };
}

// ========== 有効断面性能 ==========
export function calcEffectiveSection(
  sectionType: SteelSectionType,
  dims: SteelDimensions,
  props: SectionPropertiesInput,
  material: MaterialParams,
  memberType: MemberType,
): EffectiveSectionResult {
  const { E, F } = material;
  const { H, B, tw, tf, t, r, C: lipC } = dims;
  const sqrtEF = Math.sqrt(E / F);

  const result: EffectiveSectionResult = {
    Aeff: props.A,
    Zxeff: props.Zx,
    Zyeff: props.Zy,
    deltaH: 0,
    deltaB: 0,
  };

  switch (sectionType) {
    case 'h-beam': {
      const rw = memberType === 'column' ? 1.6 * sqrtEF : 2.4 * sqrtEF;
      const deltaH = Math.max(H - 2 * tf - 2 * r - tw * rw, 0);
      const deltaB = Math.max(B - 2 * tf * 0.53 * sqrtEF, 0);
      result.deltaH = deltaH;
      result.deltaB = deltaB;

      result.Aeff = props.A - deltaH * tw - 2 * deltaB * tf;

      // 有効Zx
      const dIw = (tw * deltaH ** 3) / 12;
      const dIf = (deltaB * tf ** 3) / 12 + deltaB * tf * ((H - tf) / 2) ** 2;
      result.Zxeff = (props.Ix - dIw - 2 * dIf) / (H / 2);

      // 有効Zy
      const dIw2 = (deltaH * tw ** 3) / 12;
      const dBhalf = deltaB / 2;
      const dIf2 = (tf * dBhalf ** 3) / 12 + dBhalf * tf * (B / 2 - deltaB / 4) ** 2;
      result.Zyeff = (props.Iy - dIw2 - 4 * dIf2) / (B / 2);
      break;
    }

    case 'channel': {
      const rw = memberType === 'column' ? 1.6 * sqrtEF : 2.4 * sqrtEF;
      const deltaH = Math.max(H - 2 * tf - 2 * r - tw * rw, 0);
      const deltaB = Math.max(B - tf * 0.53 * sqrtEF, 0);
      result.deltaH = deltaH;
      result.deltaB = deltaB;

      result.Aeff = props.A - deltaH * tw - deltaB * tf;

      const dIw = (tw * deltaH ** 3) / 12;
      const dIf = (deltaB * tf ** 3) / 12 + deltaB * tf * ((H - tf) / 2) ** 2;
      result.Zxeff = (props.Ix - dIw - 2 * dIf) / (H / 2);
      result.Zyeff = props.Zy;
      break;
    }

    case 'box': {
      const rr = r > 0 ? r : t;
      const deltaH = Math.max(H - 2 * rr - t * 1.6 * sqrtEF, 0);
      const deltaB = Math.max(B - 2 * rr - t * 1.6 * sqrtEF, 0);
      result.deltaH = deltaH;
      result.deltaB = deltaB;

      result.Aeff = props.A - deltaH * t - deltaB * t;

      // Zxeff
      const dIw = (t * deltaH ** 3) / 12;
      const dIf = (deltaB * t ** 3) / 12 + deltaB * t * ((H - t) / 2) ** 2;
      result.Zxeff = (props.Ix - 2 * dIw - 2 * dIf) / (H / 2);

      // Zyeff
      const dIw2 = (deltaH * t ** 3) / 12 + deltaH * t * ((B - t) / 2) ** 2;
      const dIf2 = (t * deltaB ** 3) / 12;
      result.Zyeff = (props.Iy - 2 * dIw2 - 2 * dIf2) / (B / 2);
      break;
    }

    case 'lip-channel': {
      const h = H - 2 * r - t;
      const b = B - 2 * r - t;
      const c = lipC - t / 2;
      const rw = memberType === 'column' ? 1.6 * sqrtEF : 2.4 * sqrtEF;
      const deltaH = Math.max(h - t * rw, 0);
      const deltaB = Math.max(b - t * 1.6 * sqrtEF, 0);
      const deltaC = Math.max(c - t * 0.53 * sqrtEF, 0);
      result.deltaH = deltaH;
      result.deltaB = deltaB;
      result.deltaC = deltaC;

      result.Aeff = props.A - deltaH * t - 2 * deltaB * t - 2 * deltaC * t;

      const dIw = (t * deltaH ** 3) / 12;
      const dIf = (deltaB * t ** 3) / 12 + deltaB * t * ((H - t) / 2) ** 2;
      const yLip = H / 2 - lipC + deltaC / 2;
      const dIc = (t * deltaC ** 3) / 12 + t * deltaC * yLip ** 2;
      result.Zxeff = (props.Ix - dIw - 2 * dIf - 2 * dIc) / (H / 2);
      result.Zyeff = props.Zy;
      break;
    }

    default:
      break;
  }

  return result;
}

// ========== 組み合わせ応力検定 ==========
export function calcCombinedStressRatio(
  sigmaX: number,
  sigmaY: number,
  tauXY: number,
  F: number,
): number {
  return Math.sqrt(sigmaX ** 2 + sigmaY ** 2 - sigmaX * sigmaY + 3 * tauXY ** 2) / F;
}

// ========== メイン計算関数 ==========
export function calcBendingStress(
  method: BendingMethod,
  sectionType: SteelSectionType,
  dims: SteelDimensions,
  props: SectionPropertiesInput,
  material: MaterialParams,
  lateralParams: LateralBucklingParams,
): BendingResult {
  const correctionFactors = calcCorrectionFactors(lateralParams);

  // 弱軸曲げ or 角型鋼管 or 円形鋼管 → fb = ft
  if (sectionType === 'box' || sectionType === 'pipe' || sectionType === 'circle') {
    const ft = calcFt(material.F);
    return {
      fb: ft,
      fb_short: ft * 1.5,
      ft,
      method,
      region: 'plastic',
    };
  }

  if (method === 'technical-standard') {
    return calcBendingTechnicalStandard(dims, material, lateralParams.lb, correctionFactors);
  } else {
    return calcBendingAIJStandard(sectionType, dims, props, material, lateralParams.lb, correctionFactors);
  }
}
