import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { SectionShapeType, StandardSection, SectionDimensions } from '../../types';
import { getStandardSections } from './standardSections';

interface StandardSectionListProps {
  shapeType: SectionShapeType;
  onSelect: (dimensions: SectionDimensions) => void;
}

// 数値フォーマット
function formatNumber(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1e6) {
    return value.toExponential(2);
  }
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString('ja-JP');
  }
  return value.toFixed(1);
}

const StandardSectionList: React.FC<StandardSectionListProps> = ({ shapeType, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sections = useMemo(() => getStandardSections(shapeType), [shapeType]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();
    return sections.filter(s => s.name.toLowerCase().includes(query));
  }, [sections, searchQuery]);

  const handleSelect = (section: StandardSection) => {
    setSelectedId(section.id);
    onSelect(section.dimensions);
  };

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        この断面形状には規格断面データがありません。
        <br />
        寸法を直接入力してください。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          規格断面リスト
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredSections.length} 件
        </span>
      </div>

      {/* 検索ボックス */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="規格名で検索..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
        />
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                規格名
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                A (mm²)
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                Ix (mm⁴)
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                Zx (mm³)
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                ix (mm)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredSections.map((section) => (
              <tr
                key={section.id}
                onClick={() => handleSelect(section)}
                className={`cursor-pointer transition-colors duration-150 ${
                  selectedId === section.id
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">
                  {section.name}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  {formatNumber(section.properties.area)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  {formatNumber(section.properties.momentOfInertiaX)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  {formatNumber(section.properties.sectionModulusX)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  {formatNumber(section.properties.radiusOfGyrationX)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        行をクリックすると寸法が入力欄に反映されます
      </p>
    </div>
  );
};

export default StandardSectionList;
