import React from 'react';
import { FileText, Download, MapPin, ChevronRight } from 'lucide-react';
import type { MLITSearchResult, SearchStatus } from './types';

interface ResultsListProps {
  results: MLITSearchResult[];
  selectedResult: MLITSearchResult | null;
  searchStatus: SearchStatus;
  onResultSelect: (result: MLITSearchResult) => void;
}

const ResultsList: React.FC<ResultsListProps> = ({
  results,
  selectedResult,
  searchStatus,
  onResultSelect,
}) => {
  if (searchStatus === 'searching') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">検索中...</span>
        </div>
      </div>
    );
  }

  if (searchStatus === 'error') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
        <div className="text-center py-8 text-red-500">
          <p className="font-medium">検索中にエラーが発生しました</p>
          <p className="text-sm mt-1">再度お試しください</p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>検索結果がありません</p>
          <p className="text-sm mt-1">地図をクリックして検索地点を指定してください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          検索結果 ({results.length}件)
        </h3>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {results.map((result) => {
          const isSelected = selectedResult?.id === result.id;
          const hasPDF = result.resources?.some(r => r.format.toUpperCase() === 'PDF');
          const hasXML = result.resources?.some(r => r.format.toUpperCase() === 'XML');

          return (
            <div
              key={result.id}
              onClick={() => onResultSelect(result)}
              className={`p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-500'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {result.title}
                  </h4>
                  {result.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {result.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {result.datasetName && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {result.datasetName}
                      </span>
                    )}
                    {hasXML && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        <FileText className="w-3 h-3 mr-1" />
                        XML
                      </span>
                    )}
                    {hasPDF && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                        <Download className="w-3 h-3 mr-1" />
                        PDF
                      </span>
                    )}
                  </div>

                  {result.location && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      <MapPin className="w-3 h-3 inline mr-1" />
                      {result.location.lat.toFixed(5)}, {result.location.lng.toFixed(5)}
                    </p>
                  )}
                </div>

                <ChevronRight className={`w-5 h-5 ml-2 flex-shrink-0 transition-colors ${
                  isSelected ? 'text-blue-500' : 'text-gray-400'
                }`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ResultsList;
