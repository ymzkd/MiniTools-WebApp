import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFFileInfo } from '../../types';

// PDF.js worker の設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PDFUploaderProps {
  onFileUpload: (fileInfo: PDFFileInfo) => void;
  compact?: boolean; // コンパクト表示フラグ
}

const PDFUploader: React.FC<PDFUploaderProps> = ({ onFileUpload, compact = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndProcessFile = async (file: File): Promise<PDFFileInfo> => {
    // ファイルタイプチェック
    if (file.type !== 'application/pdf') {
      throw new Error('PDFファイルを選択してください');
    }

    // ファイルサイズチェック (100MB制限)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      throw new Error('ファイルサイズが大きすぎます (最大100MB)');
    }

    // PDF.jsでファイルを読み込んでページ数を取得
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    return {
      file,
      name: file.name,
      size: file.size,
      pages: pdf.numPages
    };
  };

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const fileInfo = await validateAndProcessFile(file);
      onFileUpload(fileInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ファイル処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [onFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md transition-colors duration-200 ${compact ? 'p-4' : 'p-8'}`}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg text-center transition-all duration-200
          ${compact ? 'p-6' : 'p-12'}
          ${isDragOver 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${isLoading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        `}
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleInputChange}
          disabled={isLoading}
          className="hidden"
          id="pdf-upload"
        />
        
        <label htmlFor="pdf-upload" className="cursor-pointer">
          <div className={`flex items-center ${compact ? 'space-x-4' : 'flex-col space-y-4'}`}>
            {isLoading ? (
              <div className="animate-spin">
                <FileText className={compact ? "w-8 h-8 text-blue-500" : "w-16 h-16 text-blue-500"} />
              </div>
            ) : (
              <Upload className={compact ? "w-8 h-8 text-gray-400 dark:text-gray-500" : "w-16 h-16 text-gray-400 dark:text-gray-500"} />
            )}
            
            <div className={compact ? "flex-1" : "space-y-2"}>
              <h3 className={`font-semibold text-gray-900 dark:text-gray-100 ${compact ? 'text-base' : 'text-lg'}`}>
                {isLoading ? 'ファイルを処理中...' : compact ? 'PDFファイルを選択' : 'PDFファイルを選択'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isLoading 
                  ? 'ページ数を読み込んでいます...'
                  : compact 
                  ? 'ドラッグ&ドロップまたはクリック'
                  : 'ドラッグ&ドロップまたはクリックで新しいファイルを選択'
                }
              </p>
            </div>
            
            {!isLoading && !compact && (
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>対応形式: PDF</p>
                <p>最大ファイルサイズ: 100MB</p>
              </div>
            )}
          </div>
        </label>
      </div>
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFUploader;