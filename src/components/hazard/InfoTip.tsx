import React from 'react';
import { Info } from 'lucide-react';

// タイトル横の情報アイコン。ホバー/フォーカスで説明を出す(常時表示だと一覧が窮屈になるため)。
const InfoTip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="relative inline-flex group align-middle">
    <button
      type="button"
      tabIndex={0}
      aria-label="この表示についての説明"
      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:text-gray-600"
    >
      <Info className="w-3.5 h-3.5" />
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-2 text-[11px] font-normal leading-snug text-gray-600 shadow-lg group-hover:block group-focus-within:block dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
    >
      {children}
    </span>
  </span>
);

export default InfoTip;
