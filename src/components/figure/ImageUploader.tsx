import React, { useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';

interface ImageUploaderProps {
  onImagesAdded: (files: FileList) => void;
  onClearAll: () => void;
  imageCount: number;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImagesAdded,
  onClearAll,
  imageCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      onImagesAdded(files);
    }
  }, [onImagesAdded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
      <div
        ref={dropZoneRef}
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleClick}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
        <p className="text-gray-600 dark:text-gray-300 mb-2 transition-colors duration-200">画像をドラッグ&ドロップまたはクリックしてアップロード</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">対応形式: PNG, JPG, JPEG, GIF</p>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />

      {imageCount > 0 && (
        <div className="mt-4">
          <button
            className="flex items-center justify-center w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            onClick={onClearAll}
            title="すべての画像を削除"
          >
            <X size={16} className="mr-2" />
            すべて削除 ({imageCount})
          </button>
        </div>
      )}
    </div>
  );
}; 

export default ImageUploader;