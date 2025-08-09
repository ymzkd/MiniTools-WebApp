import React from 'react';
import { Grid, Type } from 'lucide-react';
import type { LayoutConfig, CaptionConfig } from '../../types';

interface LayoutControlsProps {
  layoutConfig: LayoutConfig;
  captionConfig: CaptionConfig;
  onLayoutChange: (config: Partial<LayoutConfig>) => void;
  onCaptionChange: (config: Partial<CaptionConfig>) => void;
}

const LayoutControls: React.FC<LayoutControlsProps> = ({
  layoutConfig,
  captionConfig,
  onLayoutChange,
  onCaptionChange,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 space-y-6 transition-colors duration-200">
      <div>
        <h3 className="flex items-center text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 transition-colors duration-200">
          <Grid size={20} className="mr-2" />
          レイアウト設定
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 transition-colors duration-200">
              レイアウト説明:
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed transition-colors duration-200">
              画像は自動的に行ごとに配置されます。<br/>
              ドラッグ&ドロップで自由に並び替え可能です。
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200">
              画像間の余白 (px):
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={layoutConfig.gap}
              onChange={(e) => onLayoutChange({ gap: parseInt(e.target.value) })}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200">
              外側の余白 (px):
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={layoutConfig.padding}
              onChange={(e) => onLayoutChange({ padding: parseInt(e.target.value) })}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="flex items-center text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 transition-colors duration-200">
          <Type size={20} className="mr-2" />
          キャプション設定
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200">
              フォントサイズ (px):
            </label>
            <input
              type="number"
              min="8"
              max="32"
              value={captionConfig.fontSize}
              onChange={(e) => onCaptionChange({ fontSize: parseInt(e.target.value) })}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200">
              色:
            </label>
            <input
              type="color"
              value={captionConfig.color}
              onChange={(e) => onCaptionChange({ color: e.target.value })}
              className="w-full h-10 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200">
              位置:
            </label>
            <select
              value={captionConfig.position}
              onChange={(e) => onCaptionChange({ position: e.target.value as 'top' | 'bottom' | 'left' | 'right' })}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
            >
              <option value="top">上部</option>
              <option value="bottom">下部</option>
              <option value="left">左側</option>
              <option value="right">右側</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200">
              フォント:
            </label>
            <select
              value={captionConfig.fontFamily}
              onChange={(e) => onCaptionChange({ fontFamily: e.target.value })}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
            >
              <option value="Arial, sans-serif">Arial</option>
              <option value="Times New Roman, serif">Times New Roman</option>
              <option value="Helvetica, sans-serif">Helvetica</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Verdana, sans-serif">Verdana</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayoutControls;