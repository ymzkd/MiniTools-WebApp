import React from 'react';
import { Settings, FileText } from 'lucide-react';
import type { PDFConversionSettings } from '../../types';

interface ConversionSettingsProps {
  settings: PDFConversionSettings;
  onSettingsChange: (settings: PDFConversionSettings) => void;
  disabled?: boolean;
}

const ConversionSettings: React.FC<ConversionSettingsProps> = ({ 
  settings, 
  onSettingsChange, 
  disabled = false 
}) => {
  const handleChange = <K extends keyof PDFConversionSettings>(key: K, value: PDFConversionSettings[K]) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors duration-200">
      <div className="flex items-center mb-6">
        <Settings className="w-5 h-5 text-blue-500 mr-2" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          変換設定
        </h3>
      </div>
      
      <div className="space-y-6">
        {/* DPI Setting */}
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            <FileText className="w-4 h-4 mr-2" />
            解像度設定
          </label>
          
          {/* DPI Mode Selection */}
          <div className="space-y-3 mb-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="dpiMode"
                checked={settings.dpiMode === 'preset'}
                onChange={() => handleChange('dpiMode', 'preset')}
                disabled={disabled}
                className="mr-3 text-blue-600 focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">
                プリセット
              </span>
            </label>
            
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="dpiMode"
                checked={settings.dpiMode === 'custom'}
                onChange={() => handleChange('dpiMode', 'custom')}
                disabled={disabled}
                className="mr-3 text-blue-600 focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">
                カスタム
              </span>
            </label>
          </div>

          {/* Preset DPI Options */}
          {settings.dpiMode === 'preset' && (
            <div className="space-y-2 mb-4">
              {[
                { value: 200, label: '低解像度', desc: '200 DPI - 軽量ファイル' },
                { value: 350, label: '中解像度', desc: '350 DPI - バランス良好（推奨）' },
                { value: 500, label: '高解像度', desc: '500 DPI - 高品質・大容量' }
              ].map(({ value, label, desc }) => (
                <label key={value} className="flex items-start cursor-pointer">
                  <input
                    type="radio"
                    name="dpiPreset"
                    value={value}
                    checked={settings.dpiPreset === value}
                    onChange={(e) => handleChange('dpiPreset', parseInt(e.target.value) as 200 | 350 | 500)}
                    disabled={disabled}
                    className="mt-0.5 mr-3 text-blue-600 focus:ring-blue-500 focus:ring-2"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Custom DPI Slider */}
          {settings.dpiMode === 'custom' && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                カスタム解像度: {settings.customDPI} DPI
              </label>
              <input
                type="range"
                min="200"
                max="800"
                step="50"
                value={settings.customDPI}
                onChange={(e) => handleChange('customDPI', parseInt(e.target.value))}
                disabled={disabled}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>200 DPI</span>
                <span>800 DPI</span>
              </div>
            </div>
          )}
        </div>

        {/* Settings Info */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>• 元PDFと同じサイズ・向きで1:1スケール保持</p>
            <p>• DPI設定で解像度と画質をコントロール</p>
            <p>• 全ページ一括変換、グレースケール処理</p>
            <p>• 図面や技術資料の寸法・比率を正確に維持</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversionSettings;