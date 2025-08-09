import { useState, useCallback } from 'react';
import type { ImageItem } from '../types';

export const useImageManager = () => {
  const [images, setImages] = useState<ImageItem[]>([]);

  const addImages = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        
        img.onload = () => {
          const imageItem: ImageItem = {
            id: crypto.randomUUID(),
            file,
            url,
            caption: '',
            width: img.width,
            height: img.height,
          };
          
          setImages(prev => [...prev, imageItem]);
        };
        
        img.src = url;
      }
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      return prev.filter(img => img.id !== id);
    });
  }, []);

  const updateCaption = useCallback((id: string, caption: string) => {
    setImages(prev => 
      prev.map(img => 
        img.id === id ? { ...img, caption } : img
      )
    );
  }, []);

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setImages(prev => {
      const newImages = [...prev];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      return newImages;
    });
  }, []);

  const clearImages = useCallback(() => {
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
  }, [images]);

  return {
    images,
    addImages,
    removeImage,
    updateCaption,
    reorderImages,
    clearImages,
  };
};