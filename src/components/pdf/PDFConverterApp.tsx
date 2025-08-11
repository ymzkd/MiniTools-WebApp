import React, { useState } from 'react';
import PDFUploader from './PDFUploader';
import ConversionProgress from './ConversionProgress';
import ConversionSettings from './ConversionSettings';
import { usePDFConverter } from '../../hooks/usePDFConverter';
import type { PDFConversionSettings, PDFFileInfo } from '../../types';

interface PDFConverterAppProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const PDFConverterApp: React.FC<PDFConverterAppProps> = ({ onSuccess, onError }) => {
  const [pdfFile, setPdfFile] = useState<PDFFileInfo | null>(null);
  const [settings, setSettings] = useState<PDFConversionSettings>({
    dpiMode: 'preset',
    dpiPreset: 350,
    customDPI: 350
  });

  const {
    progress,
    isConverting,
    convertToGrayscale,
    downloadGrayscalePDF
  } = usePDFConverter({ onSuccess, onError });

  const handleFileUpload = (file: PDFFileInfo) => {
    setPdfFile(file);
  };

  const handleConvert = async () => {
    if (!pdfFile) return;
    
    try {
      await convertToGrayscale(pdfFile, settings);
    } catch {
      onError('PDF変換中にエラーが発生しました');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100 transition-colors duration-200">
        PDF Grayscale Converter
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Controls */}
        <div className="lg:col-span-1 space-y-6">
          <ConversionSettings
            settings={settings}
            onSettingsChange={setSettings}
            disabled={isConverting}
          />
        </div>
        
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* PDF Uploader - Always visible, compact when file selected */}
          <PDFUploader onFileUpload={handleFileUpload} compact={!!pdfFile} />
          
          {pdfFile && (
            <div className="space-y-6">
              {/* File Info */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors duration-200">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  選択されたファイル
                </h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <p><span className="font-medium">ファイル名:</span> {pdfFile.name}</p>
                  <p><span className="font-medium">ファイルサイズ:</span> {(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  <p><span className="font-medium">ページ数:</span> {pdfFile.pages} ページ</p>
                </div>
                
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleConvert}
                    disabled={isConverting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {isConverting ? '変換中...' : 'グレースケールに変換'}
                  </button>
                  
                  <button
                    onClick={() => setPdfFile(null)}
                    disabled={isConverting}
                    className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    選択をクリア
                  </button>
                </div>
              </div>
              
              {/* Progress */}
              {isConverting && (
                <ConversionProgress progress={progress} />
              )}
              
              {/* Download Button */}
              {progress.status === 'completed' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-2 text-green-800 dark:text-green-200">
                    変換完了
                  </h3>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      PDFのグレースケール変換が完了しました。
                    </p>
                    {progress.outputFileSize && (
                      <div className="flex justify-between text-xs text-green-600 dark:text-green-400">
                        <span>元ファイル:</span>
                        <span>{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    )}
                    {progress.outputFileSize && (
                      <div className="flex justify-between text-xs text-green-600 dark:text-green-400">
                        <span>変換後:</span>
                        <span>{(progress.outputFileSize / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    )}
                    {progress.outputFileSize && (
                      <div className="flex justify-between text-xs font-medium text-green-700 dark:text-green-300">
                        <span>サイズ比:</span>
                        <span>{((progress.outputFileSize / pdfFile.size) * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => downloadGrayscalePDF(pdfFile.name)}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200"
                  >
                    グレースケールPDFをダウンロード
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFConverterApp;