import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
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
  const navigate = useNavigate();
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

  // ルートパスまたは未定義パスの場合は /matrix にリダイレクト
  useEffect(() => {
    const validPaths = ['/', '/matrix', '/figure', '/pdf', '/markdown', '/boring'];
    if (!validPaths.includes(location.pathname)) {
      navigate('/matrix', { replace: true });
    } else if (location.pathname === '/') {
      navigate('/matrix', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <div>
      <AppLayout activeTab={activeTab}>
        {/*
          すべてのコンポーネントを常にマウントしておき、CSSで表示/非表示を切り替える。
          これにより、タブ切り替え時に状態が保持される。
        */}
        <div style={{ display: activeTab === 'matrix' ? 'block' : 'none' }}>
          <LaTeXMatrixEditor />
        </div>
        <div style={{ display: activeTab === 'figure' ? 'block' : 'none' }}>
          <FigureLayoutApp
            onSuccess={showSuccess}
            onError={showError}
          />
        </div>
        <div style={{ display: activeTab === 'pdf' ? 'block' : 'none' }}>
          <PDFConverterApp
            onSuccess={showSuccess}
            onError={showError}
          />
        </div>
        <div style={{ display: activeTab === 'markdown' ? 'block' : 'none' }}>
          <MarkdownEditor />
        </div>
        <div style={{ display: activeTab === 'boring' ? 'block' : 'none' }}>
          <BoringDataApp
            onSuccess={showSuccess}
            onError={showError}
          />
        </div>
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