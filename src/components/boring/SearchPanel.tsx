import React, { useState } from 'react';
import { Search, MapPin } from 'lucide-react';

interface SearchPanelProps {
  onLocationSearch: (address: string) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ onLocationSearch }) => {
  const [address, setAddress] = useState('');

  const handleAddressSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onLocationSearch(address.trim());
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Search className="w-5 h-5" />
        ボーリングデータ検索
      </h3>

      {/* 住所・地名で地図を移動 */}
      <form onSubmit={handleAddressSearch} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          住所・地名で移動
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
            disabled={!address.trim()}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            移動
          </button>
        </div>
      </form>

      {/* 操作説明 */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          地図を拡大・移動すると、表示範囲内のボーリングデータが自動でプロットされます。
          地点をクリックすると、近接するデータが下の一覧に表示されます。
        </p>
      </div>
    </div>
  );
};

export default SearchPanel;
