import { useState } from 'react';
import AppLayout from './components/common/AppLayout';
import LaTeXMatrixEditor from './components/matrix/LaTeXMatrixEditor';
import FigureLayoutApp from './components/figure/FigureLayoutApp';
import Toast from './components/common/Toast';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import type { AppTab } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('matrix');
  const { toasts, removeToast, showSuccess, showError } = useToast();
  
  // テーマフックを初期化（テーマ設定を自動的に適用）
  useTheme();

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'matrix':
        return <LaTeXMatrixEditor />;
      case 'figure':
        return (
          <FigureLayoutApp 
            onSuccess={showSuccess}
            onError={showError}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
        {renderActiveTab()}
      </AppLayout>
      
      {/* Toast Notifications */}
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

export default App;