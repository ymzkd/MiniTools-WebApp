import React, { useState, useEffect } from 'react';

const DarkModeToggle: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSystemPreference, setIsSystemPreference] = useState(false);

  // システムのダークモード設定を取得
  const getSystemTheme = () => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (error) {
      console.warn('System theme detection failed:', error);
      return false;
    }
  };

  // テーマを適用する関数
  const applyTheme = (darkMode: boolean) => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setIsDarkMode(darkMode);
  };

  // 初期化: ローカルストレージとシステム設定を確認
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = getSystemTheme();

    if (savedTheme === 'dark') {
      // 明示的にダークモードが保存されている
      applyTheme(true);
      setIsSystemPreference(false);
    } else if (savedTheme === 'light') {
      // 明示的にライトモードが保存されている
      applyTheme(false);
      setIsSystemPreference(false);
    } else {
      // 保存された設定がない場合、システム設定に従う
      applyTheme(systemPrefersDark);
      setIsSystemPreference(true);
    }
  }, []);

  // システムのダークモード設定変更を監視
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      // ユーザーが明示的に設定を選択していない場合のみ、システム設定に従う
      if (isSystemPreference) {
        applyTheme(e.matches);
      }
    };

    // リスナーを追加
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      // 古いブラウザのサポート
      mediaQuery.addListener(handleSystemThemeChange);
    }

    // クリーンアップ
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, [isSystemPreference]);

  // ダークモード切り替え
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    applyTheme(newDarkMode);
    
    // ユーザーが明示的に選択したので、システム設定の自動追従を無効化
    setIsSystemPreference(false);
    
    // ローカルストレージに保存
    localStorage.setItem('theme', newDarkMode ? 'dark' : 'light');
  };

  // システム設定にリセットする関数（必要に応じて使用）
  const resetToSystemPreference = () => {
    const systemPrefersDark = getSystemTheme();
    applyTheme(systemPrefersDark);
    setIsSystemPreference(true);
    // システム設定に戻す場合は、ローカルストレージの設定を削除
    localStorage.removeItem('theme');
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
              <button
         onClick={toggleDarkMode}
         className="p-3 rounded-lg bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-200 dark:border-gray-700"
         title={
           isDarkMode 
             ? `ライトモードに切り替え${isSystemPreference ? ' (現在: システム設定)' : ''}` 
             : `ダークモードに切り替え${isSystemPreference ? ' (現在: システム設定)' : ''}`
         }
       >
        <div className="relative w-6 h-6">
          {isDarkMode ? (
            // 太陽アイコン (ライトモード切り替え)
            <svg 
              className="w-6 h-6 text-yellow-500 transition-transform duration-200 transform rotate-0" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path 
                fillRule="evenodd" 
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" 
                clipRule="evenodd" 
              />
            </svg>
          ) : (
            // 月アイコン (ダークモード切り替え)
            <svg 
              className="w-6 h-6 text-gray-700 dark:text-gray-300 transition-transform duration-200 transform rotate-0" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path 
                d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" 
              />
            </svg>
          )}
        </div>
      </button>
      
      {/* システム設定追従状態表示 (本番環境では非表示) */}
      {process.env.NODE_ENV === 'development' && isSystemPreference && (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
          システム設定
        </div>
      )}
    </div>
  );
};

export default DarkModeToggle;