import React, { useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { ImageItem, CaptionConfig } from '../../types';
import MathCaption from './MathCaption';

interface FlexibleImageGridProps {
  images: ImageItem[];
  captionConfig: CaptionConfig;
  onRemoveImage: (id: string) => void;
  onUpdateCaption: (id: string, caption: string) => void;
  onImagesAdded: (files: FileList) => void;
  onReorderImages: (fromIndex: number, toIndex: number) => void;
  gap: number;
  padding: number;
}

const FlexibleImageGrid: React.FC<FlexibleImageGridProps> = ({
  images,
  captionConfig,
  onRemoveImage,
  onUpdateCaption,
  onImagesAdded,
  onReorderImages,
  gap,
  padding,
}) => {
  const { fontSize, color, position, fontFamily } = captionConfig;
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ rowIndex: number; colIndex: number } | null>(null);

  // 画像を行ごとに分割する関数
  const organizeImagesIntoRows = (images: ImageItem[]) => {
    const rows: ImageItem[][] = [];
    let currentRow: ImageItem[] = [];
    
    images.forEach((image, index) => {
      currentRow.push(image);
      
      // 4枚ごとに改行（デフォルト）、または最後の画像の場合
      if (currentRow.length >= 4 || index === images.length - 1) {
        rows.push([...currentRow]);
        currentRow = [];
      }
    });
    
    return rows;
  };

  const rows = organizeImagesIntoRows(images);

  const handleDragStart = (e: React.DragEvent, imageIndex: number) => {
    setDraggedIndex(imageIndex);
    e.dataTransfer.effectAllowed = 'move';
    // 内部ドラッグ識別用のカスタムMIMEを設定
    try {
      e.dataTransfer.setData('application/x-internal-drag-index', String(imageIndex));
    } catch (error) {
      console.warn('Failed to set drag data:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ rowIndex, colIndex });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    // 内部ドラッグ（並べ替え）を最優先で処理
    const types = Array.from(e.dataTransfer.types || []);
    const hasInternal = types.includes('application/x-internal-drag-index');
    let sourceIndex: number | null = draggedIndex;
    if (hasInternal) {
      const data = e.dataTransfer.getData('application/x-internal-drag-index');
      const parsed = Number.parseInt(data, 10);
      if (!Number.isNaN(parsed)) sourceIndex = parsed;
    }

    if (sourceIndex !== null) {
      const targetIndex = rows.slice(0, rowIndex).reduce((acc, row) => acc + row.length, 0) + colIndex;
      if (sourceIndex !== targetIndex) {
        onReorderImages(sourceIndex, targetIndex);
      }
    } else if (e.dataTransfer.files.length > 0) {
      // 外部ファイルのドロップ時のみ追加
      onImagesAdded(e.dataTransfer.files);
    }

    setDraggedIndex(null);
    setDropTarget(null);
  };

  const handleFileDropOnEmpty = (e: React.DragEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    // 内部移動を優先（空スロットへの並べ替え）
    const types = Array.from(e.dataTransfer.types || []);
    const hasInternal = types.includes('application/x-internal-drag-index');
    let sourceIndex: number | null = draggedIndex;
    if (hasInternal) {
      const data = e.dataTransfer.getData('application/x-internal-drag-index');
      const parsed = Number.parseInt(data, 10);
      if (!Number.isNaN(parsed)) sourceIndex = parsed;
    }

    if (sourceIndex !== null) {
      const targetIndex = rows.slice(0, rowIndex).reduce((acc, row) => acc + row.length, 0) + colIndex;
      if (sourceIndex !== targetIndex) {
        onReorderImages(sourceIndex, targetIndex);
      }
    } else if (e.dataTransfer.files.length > 0) {
      onImagesAdded(e.dataTransfer.files);
    }

    setDraggedIndex(null);
    setDropTarget(null);
  };

  const renderImage = (image: ImageItem, globalIndex: number, rowIndex: number, colIndex: number) => {
    const isBeingDragged = draggedIndex === globalIndex;
    const isDropTarget = dropTarget?.rowIndex === rowIndex && dropTarget?.colIndex === colIndex;

    return (
      <div
        key={image.id}
        className={`relative flex flex-col cursor-grab transition-all duration-200 ${
          isDropTarget ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-dashed border-blue-400 dark:border-blue-500' : ''
        } ${isBeingDragged ? 'opacity-50' : ''}`}
        draggable
        onDragStart={(e) => handleDragStart(e, globalIndex)}
        onDragOver={(e) => handleDragOver(e, rowIndex, colIndex)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, rowIndex, colIndex)}
      >
        {position === 'top' && (
          <div className="p-2 bg-transparent">
            <MathCaption
              value={image.caption}
              onChange={(caption) => onUpdateCaption(image.id, caption)}
              placeholder="キャプションを入力... (数式は$...$で囲む)"
              style={{
                fontSize: `${fontSize}px`,
                color,
                fontFamily,
                textAlign: 'center',
                minHeight: `${Math.max(fontSize * 1.5, 24)}px`,
              }}
              rows={2}
              tabIndex={globalIndex + 1}
            />
          </div>
        )}
        
        <div className="flex-1 flex items-center justify-center relative bg-transparent min-h-[200px]">
          <img
            src={image.url}
            alt={`Image ${globalIndex + 1}`}
            className="max-w-full max-h-full object-contain rounded-none"
            draggable={false}
          />
          
          {/* 削除ボタン */}
          <button
            className="remove-btn absolute top-2 right-2 bg-red-500/90 hover:bg-red-600 text-white border-none rounded-md w-7 h-7 cursor-pointer flex items-center justify-center shadow-lg z-10 transition-all duration-200 hover:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveImage(image.id);
            }}
            title="画像を削除"
          >
            <Trash2 size={14} />
          </button>
        </div>
        
        {position === 'bottom' && (
          <div className="p-2 bg-transparent">
            <MathCaption
              value={image.caption}
              onChange={(caption) => onUpdateCaption(image.id, caption)}
              placeholder="キャプションを入力... (数式は$...$で囲む)"
              style={{
                fontSize: `${fontSize}px`,
                color,
                fontFamily,
                textAlign: 'center',
                minHeight: `${Math.max(fontSize * 1.5, 24)}px`,
              }}
              rows={2}
              tabIndex={globalIndex + 1}
            />
          </div>
        )}
      </div>
    );
  };

  const renderEmptySlot = (rowIndex: number, colIndex: number) => {
    const isDropTarget = dropTarget?.rowIndex === rowIndex && dropTarget?.colIndex === colIndex;
    
    return (
      <div
        key={`empty-${rowIndex}-${colIndex}`}
        className={`empty-drop-slot flex flex-col items-center justify-center cursor-pointer transition-all duration-200 border-2 border-dashed rounded-lg min-h-[200px] ${
          isDropTarget 
            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500' 
            : 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700/70'
        }`}
        onDragOver={(e) => handleDragOver(e, rowIndex, colIndex)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleFileDropOnEmpty(e, rowIndex, colIndex)}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'image/*';
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) onImagesAdded(files);
          };
          input.click();
        }}
      >
        <Upload size={32} className="mb-2 opacity-50 text-gray-600 dark:text-gray-400" />
        <div className="text-gray-600 dark:text-gray-300 text-sm">画像をドロップ</div>
        <div className="text-gray-500 dark:text-gray-400 text-xs mt-1">またはクリック</div>
      </div>
    );
  };

  return (
    <div 
      className="flexible-image-grid flex flex-col bg-transparent"
      style={{ 
        padding: `${padding}px`,
        gap: `${gap}px`,
      }}
    >
      {rows.map((row, rowIndex) => (
        <div 
          key={`row-${rowIndex}`} 
          className="flex items-stretch"
          style={{ gap: `${gap}px` }}
        >
          {row.map((image, colIndex) => {
            const globalIndex = rows.slice(0, rowIndex).reduce((acc, r) => acc + r.length, 0) + colIndex;
            return renderImage(image, globalIndex, rowIndex, colIndex);
          })}
          {/* 各行の最後に空のスロットを追加 */}
          {renderEmptySlot(rowIndex, row.length)}
        </div>
      ))}
      
      {/* 新しい行のための空のスロット */}
      {images.length > 0 && (
        <div className="flex items-stretch" style={{ gap: `${gap}px` }}>
          {renderEmptySlot(rows.length, 0)}
        </div>
      )}
      
      {/* 最初の画像がない場合 */}
      {images.length === 0 && (
        <div className="flex items-stretch" style={{ gap: `${gap}px` }}>
          {renderEmptySlot(0, 0)}
        </div>
      )}
    </div>
  );
};

export default FlexibleImageGrid;