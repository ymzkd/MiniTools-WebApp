import React, { useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import type { SearchArea, SearchStatus } from './types';

interface SearchPanelProps {
  searchArea: SearchArea | null;
  searchStatus: SearchStatus;
  onSearch: (area: SearchArea, keyword?: string) => void;
  onLocationSearch: (address: string) => void;
  onRadiusChange?: (radius: number) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
  searchArea,
  searchStatus,
  onSearch,
  onLocationSearch,
  onRadiusChange,
}) => {
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(1000);

  const handleSearch = () => {
    if (searchArea) {
      onSearch({ ...searchArea, radius });
    }
  };

  const handleRadiusChange = (newRadius: number) => {
    setRadius(newRadius);
    onRadiusChange?.(newRadius);
  };

  const handleAddressSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onLocationSearch(address.trim());
    }
  };

  const isSearching = searchStatus === 'searching';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Search className="w-5 h-5" />
        ボーリングデータ検索
      </h3>

      {/* 住所検索 */}
      <form onSubmit={handleAddressSearch} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          住所・地名で検索
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 東京都千代田区"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={!address.trim() || isSearching}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            移動
          </button>
        </div>
      </form>

      {/* 地図クリック説明 */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          地図をクリックして検索地点を指定してください。
          指定した地点の周辺からボーリングデータを検索します。
        </p>
      </div>

      {/* 検索半径 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          検索半径: {radius}m ({(radius / 1000).toFixed(1)}km)
        </label>
        <input
          type="range"
          min={1000}
          max={5000}
          step={100}
          value={radius}
          onChange={(e) => handleRadiusChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>1km</span>
          <span>5km</span>
        </div>
      </div>

      {/* 検索ボタン */}
      <button
        onClick={handleSearch}
        disabled={!searchArea || isSearching}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isSearching ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            検索中...
          </>
        ) : (
          <>
            <Search className="w-5 h-5" />
            周辺を検索
          </>
        )}
      </button>
    </div>
  );
};

export default SearchPanel;
