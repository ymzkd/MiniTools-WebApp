import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppLayout from './components/common/AppLayout';
import LaTeXMatrixEditor from './components/matrix/LaTeXMatrixEditor';
import FigureLayoutApp from './components/figure/FigureLayoutApp';
import PDFConverterApp from './components/pdf/PDFConverterApp';
import MarkdownEditor from './components/markdown/MarkdownEditor';
import BoringDataApp from './components/boring/BoringDataApp';
import Toast from './components/common/Toast';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import type { AppTab } from './types';

function App() {
  const location = useLocation();
  const { toasts, removeToast, showSuccess, showError } = useToast();
  
  // テーマフックを初期化（テーマ設定を自動的に適用）
  useTheme();

  // 現在のパスからアクティブタブを決定
  const getActiveTabFromPath = (pathname: string): AppTab => {
    if (pathname === '/figure') return 'figure';
    if (pathname === '/pdf') return 'pdf';
    if (pathname === '/markdown') return 'markdown';
    if (pathname === '/boring') return 'boring';
    return 'matrix'; // デフォルトは matrix
  };

  const activeTab = getActiveTabFromPath(location.pathname);

  return (
    <div>
      <AppLayout activeTab={activeTab}>
        <Routes>
          <Route path="/" element={<Navigate to="/matrix" replace />} />
          <Route path="/matrix" element={<LaTeXMatrixEditor />} />
          <Route path="/figure" element={
            <FigureLayoutApp 
              onSuccess={showSuccess}
              onError={showError}
            />
          } />
          <Route path="/pdf" element={
            <PDFConverterApp
              onSuccess={showSuccess}
              onError={showError}
            />
          } />
          <Route path="/markdown" element={<MarkdownEditor />} />
          <Route path="/boring" element={
            <BoringDataApp
              onSuccess={showSuccess}
              onError={showError}
            />
          } />
          {/* 未定義のパスは /matrix にリダイレクト */}
          <Route path="*" element={<Navigate to="/matrix" replace />} />
        </Routes>
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