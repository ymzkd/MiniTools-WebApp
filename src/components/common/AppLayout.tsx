import React from 'react';
import Navigation from './Navigation';

interface AppLayoutProps {
  activeTab: 'matrix' | 'figure';
  onTabChange: (tab: 'matrix' | 'figure') => void;
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ activeTab, onTabChange, children }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Navigation activeTab={activeTab} onTabChange={onTabChange} />
      <main className="py-8">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;