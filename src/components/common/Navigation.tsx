import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Image, FileText, PenLine, MapPin, Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import type { AppTab } from '../../types';

interface NavigationProps {
  activeTab: AppTab;
}

const navItems: { tab: AppTab; path: string; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { tab: 'matrix', path: '/matrix', icon: Calculator, label: 'Matrix Editor' },
  { tab: 'figure', path: '/figure', icon: Image, label: 'Figure Layout' },
  { tab: 'pdf', path: '/pdf', icon: FileText, label: 'PDF Converter' },
  { tab: 'markdown', path: '/markdown', icon: PenLine, label: 'Markdown Editor' },
  { tab: 'boring', path: '/boring', icon: MapPin, label: 'Boring Data' },
];

const Navigation: React.FC<NavigationProps> = ({ activeTab }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  // ページ遷移時にメニューを閉じる
  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  const activeItem = navItems.find(item => item.tab === activeTab);
  const ActiveIcon = activeItem?.icon || Calculator;

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200 print:hidden">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 3xl:px-12 4xl:px-16">
        <div className="flex justify-between h-16">
          {/* デスクトップナビゲーション */}
          <div className="hidden md:flex">
            <div className="flex space-x-8">
              {navItems.map(({ tab, path, icon: Icon, label }) => (
                <Link
                  key={tab}
                  to={path}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* モバイルメニューボタン */}
          <div className="flex md:hidden items-center" ref={menuRef}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-expanded={mobileMenuOpen}
              aria-label="メニューを開く"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            {/* 現在のツール名表示 */}
            <span className="ml-3 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
              <ActiveIcon className="w-4 h-4 mr-2" />
              {activeItem?.label}
            </span>

            {/* モバイルドロップダウンメニュー */}
            {mobileMenuOpen && (
              <div className="absolute top-16 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg">
                <div className="py-2">
                  {navItems.map(({ tab, path, icon: Icon, label }) => (
                    <Link
                      key={tab}
                      to={path}
                      onClick={handleNavClick}
                      className={`flex items-center px-4 py-3 text-sm font-medium transition-colors duration-200 ${
                        activeTab === tab
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-l-4 border-blue-500'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200 hidden sm:block">
              Mini Tools
            </h1>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
