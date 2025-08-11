import React from 'react';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import type { PDFConversionProgress } from '../../types';

interface ConversionProgressProps {
  progress: PDFConversionProgress;
}

const ConversionProgress: React.FC<ConversionProgressProps> = ({ progress }) => {
  const { currentPage, totalPages, status, message } = progress;
  const progressPercentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
      case 'processing':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'completed':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'loading':
        return 'PDFを読み込み中...';
      case 'processing':
        return `ページを変換中... (${currentPage}/${totalPages})`;
      case 'completed':
        return '変換完了!';
      case 'error':
        return 'エラーが発生しました';
      default:
        return '';
    }
  };

  return (
    <div className={`rounded-lg border p-6 transition-colors duration-200 ${getStatusColor()}`}>
      <div className="flex items-center mb-4">
        {getStatusIcon()}
        <h3 className="ml-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          変換進捗
        </h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {getStatusText()}
          </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {progressPercentage}%
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div 
            className={`h-2.5 rounded-full transition-all duration-300 ${
              status === 'error' 
                ? 'bg-red-500' 
                : status === 'completed' 
                ? 'bg-green-500' 
                : 'bg-blue-500'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        {/* Page Counter */}
        {status === 'processing' && totalPages > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            現在のページ: {currentPage} / {totalPages}
          </div>
        )}
        
        {/* Error/Success Message */}
        {message && (
          <div className={`text-sm ${
            status === 'error' 
              ? 'text-red-700 dark:text-red-300' 
              : status === 'completed'
              ? 'text-green-700 dark:text-green-300'
              : 'text-blue-700 dark:text-blue-300'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversionProgress;