import React, { useRef } from 'react';
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
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100 transition-colors duration-200">
        Figure Layout Tool
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Controls */}
        <div className="lg:col-span-1 space-y-6">          
          <LayoutControls
            layoutConfig={layoutConfig}
            captionConfig={captionConfig}
            onLayoutChange={updateLayoutConfig}
            onCaptionChange={updateCaptionConfig}
          />
          
          <ExportPanel
            gridRef={gridRef}
            imageCount={images.length}
            onSuccess={onSuccess}
            onError={onError}
          />
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
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
        </div>
      </div>
    </div>
  );
};

export default FigureLayoutApp;