import React from 'react';
import type { SectionProperties, SectionShapeType } from '../../types';

interface ResultsDisplayProps {
  properties: SectionProperties | null;
  shapeType: SectionShapeType;
}

// 数値フォーマット（有効数字4桁）
function formatNumber(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1e6) {
    return value.toExponential(3);
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }
  return value.toPrecision(4);
}

interface ResultRowProps {
  label: string;
  symbol: string;
  value: number;
  unit: string;
}

const ResultRow: React.FC<ResultRowProps> = ({ label, symbol, value, unit }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
    <div className="flex items-center gap-2">
      <span className="text-gray-700 dark:text-gray-300">{label}</span>
      <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">({symbol})</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
        {formatNumber(value)}
      </span>
      <span className="text-sm text-gray-500 dark:text-gray-400 w-16 text-right">{unit}</span>
    </div>
  </div>
);

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ properties, shapeType }) => {
  if (!properties) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center text-gray-500 dark:text-gray-400">
        有効な寸法を入力してください
      </div>
    );
  }

  const showXY = shapeType !== 'circle' && shapeType !== 'pipe';
  const showCentroid = shapeType === 'l-angle' || shapeType === 'channel';

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
        断面性能
      </h3>
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
        <ResultRow label="断面積" symbol="A" value={properties.area} unit="mm²" />

        {showCentroid && properties.centroidX !== undefined && (
          <ResultRow label="図心位置X" symbol="Cx" value={properties.centroidX} unit="mm" />
        )}
        {showCentroid && properties.centroidY !== undefined && (
          <ResultRow label="図心位置Y" symbol="Cy" value={properties.centroidY} unit="mm" />
        )}

        <div className="mt-4 pt-2 border-t border-gray-300 dark:border-gray-600">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            断面2次モーメント
          </h4>
          {showXY ? (
            <>
              <ResultRow label="X軸周り" symbol="Ix" value={properties.momentOfInertiaX} unit="mm⁴" />
              <ResultRow label="Y軸周り" symbol="Iy" value={properties.momentOfInertiaY} unit="mm⁴" />
            </>
          ) : (
            <ResultRow label="断面2次モーメント" symbol="I" value={properties.momentOfInertiaX} unit="mm⁴" />
          )}
        </div>

        <div className="mt-4 pt-2 border-t border-gray-300 dark:border-gray-600">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            断面係数
          </h4>
          {showXY ? (
            <>
              <ResultRow label="X軸周り" symbol="Zx" value={properties.sectionModulusX} unit="mm³" />
              <ResultRow label="Y軸周り" symbol="Zy" value={properties.sectionModulusY} unit="mm³" />
            </>
          ) : (
            <ResultRow label="断面係数" symbol="Z" value={properties.sectionModulusX} unit="mm³" />
          )}
        </div>

        <div className="mt-4 pt-2 border-t border-gray-300 dark:border-gray-600">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            断面2次半径
          </h4>
          {showXY ? (
            <>
              <ResultRow label="X軸周り" symbol="ix" value={properties.radiusOfGyrationX} unit="mm" />
              <ResultRow label="Y軸周り" symbol="iy" value={properties.radiusOfGyrationY} unit="mm" />
            </>
          ) : (
            <ResultRow label="断面2次半径" symbol="i" value={properties.radiusOfGyrationX} unit="mm" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
