import React, { useState, useRef, useEffect } from 'react';
import { Search, MapPin } from 'lucide-react';

interface SearchPanelProps {
  onLocationSearch: (address: string) => void;
}

// 普段はアイコンのみ。クリックで住所・地名検索のポップオーバーを開く。
const SearchPanel: React.FC<SearchPanelProps> = ({ onLocationSearch }) => {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onLocationSearch(address.trim());
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="住所・地名で移動"
        aria-label="住所・地名で移動"
        className="inline-flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition-colors"
      >
        <Search className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-2 z-[1100] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-700">
          <form onSubmit={submit} className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                autoFocus
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
          </form>
        </div>
      )}
    </div>
  );
};

export default SearchPanel;
