import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

export const useTheme = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    // 初回読み込み時のテーマ決定
    if (typeof window !== 'undefined') {
      // 1. LocalStorageから保存されたテーマを確認
      const savedTheme = localStorage.getItem('theme') as ThemeMode | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
      
      // 2. 保存されたテーマがない場合は、システム設定を確認
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    
    // 3. デフォルトはlight
    return 'light';
  });

  // テーマ変更時の処理
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      
      // クラスを更新
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
      
      // LocalStorageに保存
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setTheme(mode);
  }, []);

  return {
    theme,
    toggleTheme,
    setTheme: setThemeMode,
    isDark: theme === 'dark',
  };
};