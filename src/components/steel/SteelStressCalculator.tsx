import React, { useState, useMemo, useCallback } from 'react';
import type {
  SteelSectionType,
  MemberType,
  BendingMethod,
  MomentDistribution,
  SteelDimensions,
  SectionPropertiesInput,
  MaterialParams,
  LateralBucklingParams,
  BendingResult,
  ShearResult,
  CompressionResult,
  WidthThicknessResult,
  EffectiveSectionResult,
  TorsionConstants,
  CorrectionFactors,
} from './steelTypes';
import { STEEL_MATERIALS, DEFAULT_ELASTIC_CONSTANTS } from './steelTypes';
import {
  calcCorrectionFactors,
  calcTorsionConstants,
  calcBendingStress,
  calcShearStress,
  calcShearProperties,
  calcCompressionStress,
  calcWidthThicknessRatio,
  calcEffectiveSection,
  calcCombinedStressRatio,
  calcSectionProperties,
} from './steelCalculations';
import ResultPanel from './ResultPanel';
import NumberInput from './NumberInput';

// 鉄骨の単位体積重量 (kN/m³)
const STEEL_UNIT_WEIGHT = 78;

// 断面形状オプション
const sectionOptions: { type: SteelSectionType; label: string }[] = [
  { type: 'h-beam', label: 'H型' },
  { type: 'channel', label: 'みぞ形' },
  { type: 'l-angle', label: 'L形' },
  { type: 't-shape', label: 'T形' },
  { type: 'box', label: '角パイプ' },
  { type: 'pipe', label: '丸パイプ' },
  { type: 'circle', label: '円形中実' },
  { type: 'rectangle', label: '矩形中実' },
  { type: 'lip-channel', label: 'リップみぞ形' },
];

const defaultDims: SteelDimensions = {
  H: 250, B: 125, tw: 6, tf: 9, r: 13, D: 100, t: 6, C: 20,
};

type CalcTarget = 'bending' | 'shear' | 'compression' | 'widthThickness' | 'combined';

const SteelStressCalculator: React.FC = () => {
  // 基本設定
  const [sectionType, setSectionType] = useState<SteelSectionType>('h-beam');
  const [memberType, setMemberType] = useState<MemberType>('beam');
  const [calcTargets, setCalcTargets] = useState<CalcTarget[]>(['bending']);

  // 材料
  const [materialPreset, setMaterialPreset] = useState(4); // SN490B default
  const [F, setF] = useState(325);
  const [E, setE] = useState(DEFAULT_ELASTIC_CONSTANTS.E);
  const [G, setG] = useState(DEFAULT_ELASTIC_CONSTANTS.G);

  // 断面寸法
  const [dims, setDims] = useState<SteelDimensions>(defaultDims);

  // 断面性能（手動入力用、自動計算不可の場合）
  const [manualProps, setManualProps] = useState<SectionPropertiesInput>({
    A: 0, Ix: 0, Iy: 0, Zx: 0, Zy: 0, ix: 0, iy: 0,
  });

  // 自動計算された断面性能
  const autoProps = useMemo(
    () => calcSectionProperties(sectionType, dims),
    [sectionType, dims],
  );

  // 自動計算が可能かどうか
  const isAutoCalc = autoProps !== null;

  // 実際に使用する断面性能
  const props: SectionPropertiesInput = isAutoCalc ? autoProps : manualProps;

  // 曲げ関連
  const [bendingMethod, setBendingMethod] = useState<BendingMethod>('aij-standard');
  const [lb, setLb] = useState(5000);
  const [M1, setM1] = useState(113.39);
  const [M2, setM2] = useState(87.31);
  const [momentDist, setMomentDist] = useState<MomentDistribution>('monotonic');
  const [doubleCurvature, setDoubleCurvature] = useState(true);

  // 圧縮関連
  const [lk, setLk] = useState(5000);

  // 応力度入力（組み合わせ検定用）
  const [sigmaB, setSigmaB] = useState(0);
  const [tauY, setTauY] = useState(0);

  const material: MaterialParams = useMemo(() => ({ F, E, G }), [F, E, G]);

  const lateralParams: LateralBucklingParams = useMemo(() => ({
    lb, M1, M2, momentDist, doubleCurvature,
  }), [lb, M1, M2, momentDist, doubleCurvature]);

  // 補正係数
  const correctionFactors: CorrectionFactors = useMemo(
    () => calcCorrectionFactors(lateralParams),
    [lateralParams],
  );

  // ねじり定数
  const torsionConstants: TorsionConstants = useMemo(
    () => calcTorsionConstants(sectionType, dims),
    [sectionType, dims],
  );

  // 曲げ許容応力度
  const bendingResult: BendingResult | null = useMemo(() => {
    if (!calcTargets.includes('bending')) return null;
    return calcBendingStress(bendingMethod, sectionType, dims, props, material, lateralParams);
  }, [calcTargets, bendingMethod, sectionType, dims, props, material, lateralParams]);

  // せん断
  const shearResult: ShearResult | null = useMemo(() => {
    if (!calcTargets.includes('shear')) return null;
    const { fs_long, fs_short } = calcShearStress(material);
    const shearProps = calcShearProperties(sectionType, dims, props);
    return { ...shearProps, fs_long, fs_short };
  }, [calcTargets, sectionType, dims, props, material]);

  // 圧縮: 自動的に断面二次半径が小さい方の軸を選択
  const bucklingAxis: 'x' | 'y' = props.ix <= props.iy ? 'x' : 'y';
  const bucklingI = Math.min(props.ix, props.iy);

  const compressionResult: CompressionResult | null = useMemo(() => {
    if (!calcTargets.includes('compression')) return null;
    return calcCompressionStress(material, lk, bucklingI);
  }, [calcTargets, material, lk, bucklingI]);

  // 幅厚比
  const widthThicknessResult: WidthThicknessResult | null = useMemo(() => {
    if (!calcTargets.includes('widthThickness')) return null;
    return calcWidthThicknessRatio(sectionType, dims, material, memberType);
  }, [calcTargets, sectionType, dims, material, memberType]);

  // 有効断面
  const effectiveSection: EffectiveSectionResult | null = useMemo(() => {
    if (!calcTargets.includes('widthThickness')) return null;
    if (widthThicknessResult?.isOk) return null;
    return calcEffectiveSection(sectionType, dims, props, material, memberType);
  }, [calcTargets, widthThicknessResult, sectionType, dims, props, material, memberType]);

  // 組み合わせ応力
  const combinedRatio: number | null = useMemo(() => {
    if (!calcTargets.includes('combined')) return null;
    return calcCombinedStressRatio(sigmaB, 0, tauY, F);
  }, [calcTargets, sigmaB, tauY, F]);

  // 単位長さあたりの重量 (kN/m)
  // A [mm²] → m² に変換: A * 1e-6, × 78 kN/m³ = kN/m
  const unitWeight = useMemo(() => {
    return props.A * 1e-6 * STEEL_UNIT_WEIGHT;
  }, [props.A]);

  const toggleTarget = useCallback((target: CalcTarget) => {
    setCalcTargets(prev =>
      prev.includes(target) ? prev.filter(t => t !== target) : [...prev, target]
    );
  }, []);

  const updateDim = useCallback((key: keyof SteelDimensions, value: number) => {
    setDims(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateManualProp = useCallback((key: keyof SectionPropertiesInput, value: number) => {
    setManualProps(prev => ({ ...prev, [key]: value }));
  }, []);

  // 必要な断面寸法フィールド
  const dimFields = useMemo(() => {
    switch (sectionType) {
      case 'h-beam':
      case 'channel':
        return [
          { key: 'H' as const, label: 'H (梁せい)', unit: 'mm' },
          { key: 'B' as const, label: 'B (フランジ幅)', unit: 'mm' },
          { key: 'tw' as const, label: 'tw (ウェブ厚)', unit: 'mm' },
          { key: 'tf' as const, label: 'tf (フランジ厚)', unit: 'mm' },
          { key: 'r' as const, label: 'r (フィレットR)', unit: 'mm' },
        ];
      case 'l-angle':
        return [
          { key: 'H' as const, label: 'H (脚A長)', unit: 'mm' },
          { key: 'B' as const, label: 'B (脚B長)', unit: 'mm' },
          { key: 'tw' as const, label: 't (厚さ)', unit: 'mm' },
        ];
      case 't-shape':
        return [
          { key: 'H' as const, label: 'H (高さ)', unit: 'mm' },
          { key: 'B' as const, label: 'B (幅)', unit: 'mm' },
          { key: 'tw' as const, label: 'tw (ウェブ厚)', unit: 'mm' },
          { key: 'tf' as const, label: 'tf (フランジ厚)', unit: 'mm' },
        ];
      case 'box':
        return [
          { key: 'H' as const, label: 'H (高さ)', unit: 'mm' },
          { key: 'B' as const, label: 'B (幅)', unit: 'mm' },
          { key: 't' as const, label: 't (板厚)', unit: 'mm' },
          { key: 'r' as const, label: 'r (コーナーR)', unit: 'mm' },
        ];
      case 'pipe':
        return [
          { key: 'D' as const, label: 'D (外径)', unit: 'mm' },
          { key: 't' as const, label: 't (板厚)', unit: 'mm' },
        ];
      case 'circle':
        return [
          { key: 'D' as const, label: 'D (直径)', unit: 'mm' },
        ];
      case 'rectangle':
        return [
          { key: 'H' as const, label: 'H (高さ)', unit: 'mm' },
          { key: 'B' as const, label: 'B (幅)', unit: 'mm' },
        ];
      case 'lip-channel':
        return [
          { key: 'H' as const, label: 'H (高さ)', unit: 'mm' },
          { key: 'B' as const, label: 'B (幅)', unit: 'mm' },
          { key: 't' as const, label: 't (板厚)', unit: 'mm' },
          { key: 'r' as const, label: 'r (コーナーR)', unit: 'mm' },
          { key: 'C' as const, label: 'C (リップ長)', unit: 'mm' },
        ];
      default:
        return [];
    }
  }, [sectionType]);

  // 断面性能の表示フィールド
  const propFields: { key: keyof SectionPropertiesInput; label: string; unit: string }[] = [
    { key: 'A', label: 'A (断面積)', unit: 'mm²' },
    { key: 'Ix', label: 'Ix (強軸断面二次モーメント)', unit: 'mm⁴' },
    { key: 'Iy', label: 'Iy (弱軸断面二次モーメント)', unit: 'mm⁴' },
    { key: 'Zx', label: 'Zx (強軸断面係数)', unit: 'mm³' },
    { key: 'Zy', label: 'Zy (弱軸断面係数)', unit: 'mm³' },
    { key: 'ix', label: 'ix (強軸断面二次半径)', unit: 'mm' },
    { key: 'iy', label: 'iy (弱軸断面二次半径)', unit: 'mm' },
  ];

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200";
  const readonlyInputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm transition-colors duration-200 cursor-default";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
  const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm transition-colors duration-200";
  const sectionHeaderClass = "text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3";

  // 数値のフォーマット
  const formatValue = (v: number): string => {
    if (Math.abs(v) >= 1e7) return v.toExponential(3);
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 1) return v.toFixed(2);
    return v.toFixed(4);
  };

  return (
    <div className="w-full px-4 sm:px-6 xl:px-12 3xl:px-16 py-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-200">
          鉄骨部材 断面検定
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          鋼材の許容曲げ応力度・許容せん断応力度・許容圧縮応力度の計算、幅厚比検定、組み合わせ応力検定
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ===== 左パネル: 入力 ===== */}
        <div className="xl:col-span-1 space-y-4">

          {/* 断面形状選択 */}
          <div className={cardClass}>
            <h2 className={sectionHeaderClass}>断面形状</h2>
            <div className="grid grid-cols-3 gap-2">
              {sectionOptions.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setSectionType(opt.type)}
                  className={`px-2 py-2 rounded-md text-sm font-medium border-2 transition-all duration-200 ${
                    sectionType === opt.type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 部材種別 */}
          <div className={cardClass}>
            <h2 className={sectionHeaderClass}>部材種別</h2>
            <div className="flex gap-3">
              {([['column', '柱'], ['beam', '梁']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setMemberType(val)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium border-2 transition-all duration-200 ${
                    memberType === val
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 計算項目選択 */}
          <div className={cardClass}>
            <h2 className={sectionHeaderClass}>計算項目</h2>
            <div className="space-y-2">
              {([
                ['bending', '曲げ許容応力度'],
                ['shear', 'せん断許容応力度'],
                ['compression', '圧縮許容応力度'],
                ['widthThickness', '幅厚比検定'],
                ['combined', '組み合わせ応力検定'],
              ] as [CalcTarget, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calcTargets.includes(key)}
                    onChange={() => toggleTarget(key)}
                    className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 材料 */}
          <div className={cardClass}>
            <h2 className={sectionHeaderClass}>材料</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>鋼材種別</label>
                <select
                  value={materialPreset}
                  onChange={e => {
                    const idx = Number(e.target.value);
                    setMaterialPreset(idx);
                    setF(STEEL_MATERIALS[idx].F);
                  }}
                  className={inputClass}
                >
                  {STEEL_MATERIALS.map((m, i) => (
                    <option key={i} value={i}>{m.label} (F={m.F})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>F (N/mm²)</label>
                  <NumberInput value={F} onChange={setF} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>E (N/mm²)</label>
                  <NumberInput value={E} onChange={setE} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>G (N/mm²)</label>
                  <NumberInput value={G} onChange={setG} className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* 断面寸法 */}
          <div className={cardClass}>
            <h2 className={sectionHeaderClass}>断面寸法</h2>
            <div className="grid grid-cols-2 gap-3">
              {dimFields.map(f => (
                <div key={f.key}>
                  <label className={labelClass}>{f.label}</label>
                  <div className="flex items-center gap-1">
                    <NumberInput
                      value={dims[f.key]}
                      onChange={v => updateDim(f.key, v)}
                      className={inputClass + " min-w-0"}
                    />
                    <span className="text-xs text-gray-400 shrink-0 w-8">{f.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 断面性能 */}
          <div className={cardClass}>
            <h2 className={sectionHeaderClass}>
              断面性能
              {isAutoCalc ? (
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                  自動計算
                </span>
              ) : (
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 font-medium">
                  手動入力
                </span>
              )}
            </h2>
            {!isAutoCalc && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">
                この断面形状は自動計算に対応していません。断面性能を直接入力してください。
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {propFields.map(f => (
                <div key={f.key}>
                  <label className={labelClass}>{f.label}</label>
                  <div className="flex items-center gap-1">
                    {isAutoCalc ? (
                      <input
                        type="text"
                        value={formatValue(props[f.key])}
                        readOnly
                        className={readonlyInputClass + " min-w-0"}
                        tabIndex={-1}
                      />
                    ) : (
                      <NumberInput
                        value={manualProps[f.key]}
                        onChange={v => updateManualProp(f.key, v)}
                        className={inputClass + " min-w-0"}
                      />
                    )}
                    <span className="text-xs text-gray-400 shrink-0 w-8">{f.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ねじり定数 */}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>J (サンブナンねじり)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={formatValue(torsionConstants.J)}
                      readOnly
                      className={readonlyInputClass + " min-w-0"}
                      tabIndex={-1}
                    />
                    <span className="text-xs text-gray-400 shrink-0 w-8">mm⁴</span>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Iw (曲げねじり)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={formatValue(torsionConstants.Iw)}
                      readOnly
                      className={readonlyInputClass + " min-w-0"}
                      tabIndex={-1}
                    />
                    <span className="text-xs text-gray-400 shrink-0 w-8">mm⁶</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 単位重量 */}
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">単位長さあたり重量</span>
                <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {unitWeight.toFixed(4)} <span className="text-xs text-gray-500">kN/m</span>
                  <span className="text-xs text-gray-400 ml-2">({(unitWeight / 9.80665 * 1000).toFixed(1)} kg/m)</span>
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">鉄骨単位体積重量: {STEEL_UNIT_WEIGHT} kN/m³</p>
            </div>
          </div>
        </div>

        {/* ===== 中央パネル: 曲げ・圧縮パラメータ ===== */}
        <div className="xl:col-span-1 space-y-4">

          {/* 曲げ計算パラメータ */}
          {calcTargets.includes('bending') && (
            <div className={cardClass}>
              <h2 className={sectionHeaderClass}>曲げ計算パラメータ</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>計算方法</label>
                  <select
                    value={bendingMethod}
                    onChange={e => setBendingMethod(e.target.value as BendingMethod)}
                    className={inputClass}
                  >
                    <option value="technical-standard">技術基準解説書</option>
                    <option value="aij-standard">鋼構造許容応力度設計規準</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>横座屈補剛間距離 lb (mm)</label>
                  <NumberInput value={lb} onChange={setLb} className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>モーメント分布</label>
                  <select
                    value={momentDist}
                    onChange={e => setMomentDist(e.target.value as MomentDistribution)}
                    className={inputClass}
                  >
                    <option value="monotonic">単調変化</option>
                    <option value="max-in-span">区間内最大</option>
                  </select>
                </div>

                {momentDist === 'monotonic' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>M1 (大) (kN·m)</label>
                        <NumberInput value={M1} onChange={setM1} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>M2 (小) (kN·m)</label>
                        <NumberInput value={M2} onChange={setM2} className={inputClass} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={doubleCurvature}
                        onChange={e => setDoubleCurvature(e.target.checked)}
                        className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">複曲率（反曲点あり）</span>
                    </label>
                  </>
                )}

                {/* 補正係数表示 */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-3 space-y-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    補正係数 C = <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{correctionFactors.C.toFixed(3)}</span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    塑性限界細長比 <sub>p</sub>λ<sub>b</sub> = <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{correctionFactors.pLambdaB.toFixed(3)}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 圧縮パラメータ */}
          {calcTargets.includes('compression') && (
            <div className={cardClass}>
              <h2 className={sectionHeaderClass}>圧縮計算パラメータ</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>座屈長さ lk (mm)</label>
                  <NumberInput value={lk} onChange={setLk} className={inputClass} />
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-3 space-y-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    座屈軸: <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{bucklingAxis}軸</span>
                    <span className="text-xs text-gray-500 ml-1">(断面二次半径が小さい方を自動選択)</span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    ix = <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{formatValue(props.ix)}</span> mm,
                    iy = <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{formatValue(props.iy)}</span> mm
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    → i<sub>min</sub> = <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{formatValue(bucklingI)}</span> mm
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 組み合わせ応力入力 */}
          {calcTargets.includes('combined') && (
            <div className={cardClass}>
              <h2 className={sectionHeaderClass}>組み合わせ応力入力</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>σ (曲げ応力度) (N/mm²)</label>
                  <NumberInput value={sigmaB} onChange={setSigmaB} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>τ (せん断応力度) (N/mm²)</label>
                  <NumberInput value={tauY} onChange={setTauY} className={inputClass} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== 右パネル: 結果 ===== */}
        <div className="xl:col-span-1 space-y-4">
          <ResultPanel
            calcTargets={calcTargets}
            bendingResult={bendingResult}
            shearResult={shearResult}
            compressionResult={compressionResult}
            widthThicknessResult={widthThicknessResult}
            effectiveSection={effectiveSection}
            combinedRatio={combinedRatio}
            F={F}
          />
        </div>
      </div>
    </div>
  );
};

export default SteelStressCalculator;
