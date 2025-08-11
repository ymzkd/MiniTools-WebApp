import React, { useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import FlexibleImageGrid from './FlexibleImageGrid';
import LayoutControls from './LayoutControls';
import ExportPanel from './ExportPanel';
import { useImageManager } from '../../hooks/useImageManager';
import { useLayout } from '../../hooks/useLayout';

interface FigureLayoutAppProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const FigureLayoutApp: React.FC<FigureLayoutAppProps> = ({ onSuccess, onError }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const {
    images,
    addImages,
    removeImage,
    updateCaption,
    reorderImages,
  } = useImageManager();

  const {
    layoutConfig,
    captionConfig,
    updateLayoutConfig,
    updateCaptionConfig,
  } = useLayout();

  const gridRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile sidebar toggle on the left of title */}
          <button
            className="lg:hidden inline-flex items-center px-3 py-2 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open settings"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-200">
            Figure Layout Tool
          </h1>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Controls (desktop) */}
        <div className="hidden lg:block lg:col-span-1 space-y-6">
          <LayoutControls
            layoutConfig={layoutConfig}
            captionConfig={captionConfig}
            onLayoutChange={updateLayoutConfig}
            onCaptionChange={updateCaptionConfig}
          />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4 transition-colors duration-200">
              図表レイアウト
            </h2>
            <div className="min-h-96" ref={gridRef}>
              <FlexibleImageGrid
                images={images}
                captionConfig={captionConfig}
                onRemoveImage={removeImage}
                onUpdateCaption={updateCaption}
                onImagesAdded={addImages}
                onReorderImages={reorderImages}
                gap={layoutConfig.gap}
                padding={layoutConfig.padding}
              />
            </div>
          </div>

          {/* Export panel moved below main grid */}
          <ExportPanel
            gridRef={gridRef}
            imageCount={images.length}
            onSuccess={onSuccess}
            onError={onError}
          />
        </div>
      </div>

      {/* Mobile Sidebar Drawer */}
      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 h-full w-80 max-w-[85vw] bg-white dark:bg-gray-800 shadow-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">設定</h2>
              <button
                className="inline-flex items-center p-2 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <LayoutControls
              layoutConfig={layoutConfig}
              captionConfig={captionConfig}
              onLayoutChange={updateLayoutConfig}
              onCaptionChange={updateCaptionConfig}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default FigureLayoutApp;
