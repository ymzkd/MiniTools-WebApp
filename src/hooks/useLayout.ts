import { useState, useCallback } from 'react';
import type { LayoutConfig, CaptionConfig } from '../types';

export const useLayout = () => {
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>({
    rows: 2,
    cols: 1,
    gap: 20,
    padding: 20,
  });

  const [captionConfig, setCaptionConfig] = useState<CaptionConfig>({
    fontSize: 14,
    color: '#000000',
    position: 'bottom',
    fontFamily: 'Arial, sans-serif',
  });

  const updateLayoutConfig = useCallback((updates: Partial<LayoutConfig>) => {
    setLayoutConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const updateCaptionConfig = useCallback((updates: Partial<CaptionConfig>) => {
    setCaptionConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const resetLayout = useCallback(() => {
    setLayoutConfig({
      rows: 2,
      cols: 1,
      gap: 20,
      padding: 20,
    });
  }, []);

  const resetCaption = useCallback(() => {
    setCaptionConfig({
      fontSize: 14,
      color: '#000000',
      position: 'bottom',
      fontFamily: 'Arial, sans-serif',
    });
  }, []);

  return {
    layoutConfig,
    captionConfig,
    updateLayoutConfig,
    updateCaptionConfig,
    resetLayout,
    resetCaption,
  };
};