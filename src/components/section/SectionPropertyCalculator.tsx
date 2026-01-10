import React from 'react';
import { Circle, Square, Minus } from 'lucide-react';
import { useSectionCalculator } from '../../hooks/useSectionCalculator';
import type { SectionShapeType, SectionDimensions } from '../../types';
import SectionDiagram from './SectionDiagram';
import DimensionInputs from './DimensionInputs';
import ResultsDisplay from './ResultsDisplay';
import StandardSectionList from './StandardSectionList';

interface ShapeOption {
  type: SectionShapeType;
  label: string;
  icon: React.ReactNode;
}

const shapeOptions: ShapeOption[] = [
  { type: 'circle', label: '丸', icon: <Circle className="w-5 h-5" /> },
  { type: 'pipe', label: '丸パイプ', icon: <Circle className="w-5 h-5" strokeWidth={3} /> },
  { type: 'rectangle', label: '四角', icon: <Square className="w-5 h-5" /> },
  { type: 'box', label: '角パイプ', icon: <Square className="w-5 h-5" strokeWidth={3} /> },
  { type: 'h-beam', label: 'H型', icon: <span className="font-bold text-lg">H</span> },
  { type: 'l-angle', label: 'L型', icon: <span className="font-bold text-lg">L</span> },
  { type: 'channel', label: '溝型', icon: <Minus className="w-5 h-5 rotate-90" /> },
];

const SectionPropertyCalculator: React.FC = () => {
  const {
    shapeType,
    setShapeType,
    dimensions,
    setDimensions,
    updateDimension,
    properties,
    validationErrors,
  } = useSectionCalculator();

  const handleStandardSelect = (dims: SectionDimensions) => {
    setDimensions(dims);
  };

  return (
    <div className="w-full px-4 sm:px-6 xl:px-12 3xl:px-16 py-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-200">
          断面性能計算
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          各種断面の面積、断面2次モーメント、断面係数、断面2次半径を計算します
        </p>
      </div>

      {/* 断面形状選択 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
          断面形状
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {shapeOptions.map((option) => (
            <button
              key={option.type}
              onClick={() => setShapeType(option.type)}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 ${
                shapeType === option.type
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="mb-1">{option.icon}</div>
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左: 図と寸法入力 */}
        <div className="lg:col-span-1 space-y-6">
          {/* 断面図 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              断面形状
            </h3>
            <div className="flex justify-center items-center min-h-[200px]">
              <SectionDiagram
                shapeType={shapeType}
                dimensions={dimensions}
                properties={properties}
              />
            </div>
          </div>

          {/* 寸法入力 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
            <DimensionInputs
              shapeType={shapeType}
              dimensions={dimensions}
              onUpdate={updateDimension}
              validationErrors={validationErrors}
            />
          </div>

          {/* 計算結果 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
            <ResultsDisplay properties={properties} shapeType={shapeType} />
          </div>
        </div>

        {/* 右: 規格断面リスト */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
            <StandardSectionList
              shapeType={shapeType}
              onSelect={handleStandardSelect}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectionPropertyCalculator;
