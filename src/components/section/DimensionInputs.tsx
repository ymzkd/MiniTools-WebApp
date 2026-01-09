import React from 'react';
import type { SectionShapeType, SectionDimensions } from '../../types';

interface DimensionInputsProps {
  shapeType: SectionShapeType;
  dimensions: SectionDimensions;
  onUpdate: (key: keyof SectionDimensions, value: number) => void;
  validationErrors: string[];
}

interface InputFieldProps {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  step?: number;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  value,
  onChange,
  unit = 'mm',
  min = 0,
  step = 1,
}) => (
  <div className="flex items-center gap-2">
    <label className="w-24 text-sm text-gray-700 dark:text-gray-300">{label}</label>
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      step={step}
      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
    />
    <span className="w-8 text-sm text-gray-500 dark:text-gray-400">{unit}</span>
  </div>
);

const DimensionInputs: React.FC<DimensionInputsProps> = ({
  shapeType,
  dimensions,
  onUpdate,
  validationErrors,
}) => {
  const renderInputs = () => {
    switch (shapeType) {
      case 'circle':
        return (
          <InputField
            label="直径 D"
            value={dimensions.diameter}
            onChange={(v) => onUpdate('diameter', v)}
          />
        );

      case 'pipe':
        return (
          <>
            <InputField
              label="外径 D"
              value={dimensions.outerDiameter}
              onChange={(v) => onUpdate('outerDiameter', v)}
            />
            <InputField
              label="内径 d"
              value={dimensions.innerDiameter}
              onChange={(v) => onUpdate('innerDiameter', v)}
            />
          </>
        );

      case 'rectangle':
        return (
          <>
            <InputField
              label="幅 B"
              value={dimensions.width}
              onChange={(v) => onUpdate('width', v)}
            />
            <InputField
              label="高さ H"
              value={dimensions.height}
              onChange={(v) => onUpdate('height', v)}
            />
          </>
        );

      case 'box':
        return (
          <>
            <InputField
              label="外幅 B"
              value={dimensions.outerWidth}
              onChange={(v) => onUpdate('outerWidth', v)}
            />
            <InputField
              label="外高さ H"
              value={dimensions.outerHeight}
              onChange={(v) => onUpdate('outerHeight', v)}
            />
            <InputField
              label="板厚 t"
              value={dimensions.thickness}
              onChange={(v) => onUpdate('thickness', v)}
              step={0.1}
            />
          </>
        );

      case 'h-beam':
        return (
          <>
            <InputField
              label="フランジ幅 B"
              value={dimensions.flangeWidth}
              onChange={(v) => onUpdate('flangeWidth', v)}
            />
            <InputField
              label="ウェブ高さ H"
              value={dimensions.webHeight}
              onChange={(v) => onUpdate('webHeight', v)}
            />
            <InputField
              label="フランジ厚 tf"
              value={dimensions.flangeThickness}
              onChange={(v) => onUpdate('flangeThickness', v)}
              step={0.1}
            />
            <InputField
              label="ウェブ厚 tw"
              value={dimensions.webThickness}
              onChange={(v) => onUpdate('webThickness', v)}
              step={0.1}
            />
          </>
        );

      case 'l-angle':
        return (
          <>
            <InputField
              label="辺 A"
              value={dimensions.legA}
              onChange={(v) => onUpdate('legA', v)}
            />
            <InputField
              label="辺 B"
              value={dimensions.legB}
              onChange={(v) => onUpdate('legB', v)}
            />
            <InputField
              label="厚さ t"
              value={dimensions.legThickness}
              onChange={(v) => onUpdate('legThickness', v)}
              step={0.1}
            />
          </>
        );

      case 'channel':
        return (
          <>
            <InputField
              label="幅 B"
              value={dimensions.channelWidth}
              onChange={(v) => onUpdate('channelWidth', v)}
            />
            <InputField
              label="高さ H"
              value={dimensions.channelHeight}
              onChange={(v) => onUpdate('channelHeight', v)}
            />
            <InputField
              label="フランジ厚 tf"
              value={dimensions.channelFlangeThickness}
              onChange={(v) => onUpdate('channelFlangeThickness', v)}
              step={0.1}
            />
            <InputField
              label="ウェブ厚 tw"
              value={dimensions.channelWebThickness}
              onChange={(v) => onUpdate('channelWebThickness', v)}
              step={0.1}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
        寸法入力
      </h3>
      <div className="space-y-3">
        {renderInputs()}
      </div>
      {validationErrors.length > 0 && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
          {validationErrors.map((error, i) => (
            <p key={i} className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ))}
        </div>
      )}
    </div>
  );
};

export default DimensionInputs;
