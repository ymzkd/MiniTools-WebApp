import React from 'react';
import Navigation from './Navigation';
import type { AppTab } from '../../types';

interface AppLayoutProps {
  activeTab: AppTab;
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ activeTab, children }) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 print:bg-white transition-colors duration-200">
      <Navigation activeTab={activeTab} />
      <main className="py-8 print:py-0">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;