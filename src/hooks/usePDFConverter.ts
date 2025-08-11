import { useState, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import { convertCanvasToGrayscale } from '../utils/pdfGrayscale';
import { 
  detectPDFPageSize, 
  formatsEqual, 
  getJsPDFConfig, 
  analyzePageFormats,
  type PageFormat 
} from '../utils/pdfSizeDetection';
import type { PDFConversionSettings, PDFConversionProgress, PDFFileInfo } from '../types';

// PDF.js worker の設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface UsePDFConverterProps {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export const usePDFConverter = ({ onSuccess, onError }: UsePDFConverterProps) => {
  const [progress, setProgress] = useState<PDFConversionProgress>({
    currentPage: 0,
    totalPages: 0,
    status: 'loading'
  });
  const [isConverting, setIsConverting] = useState(false);
  const grayscaleDataUrl = useRef<string | null>(null);

  const updateProgress = useCallback((updates: Partial<PDFConversionProgress>) => {
    setProgress(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * PDFから全ページのフォーマット情報を収集
   */
  const collectPageFormats = useCallback(async (
    pdf: pdfjsLib.PDFDocumentProxy,
    startPage: number,
    endPage: number
  ): Promise<PageFormat[]> => {
    const pageFormats: PageFormat[] = [];
    
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 }); // 自然サイズを取得
      
      const pageFormat = detectPDFPageSize(viewport.width, viewport.height);
      pageFormats.push(pageFormat);
    }
    
    return pageFormats;
  }, []);

  const getCompressionLevel = (dpi: number): number => {
    // DPIに基づいてJPEG圧縮レベルを決定
    // 高DPIほど高品質（低圧縮）、低DPIほど低品質（高圧縮）
    if (dpi >= 450) return 0.95;      // 高DPI: 高品質
    if (dpi >= 300) return 0.85;      // 中高DPI: 中高品質
    if (dpi >= 250) return 0.75;      // 中DPI: 中品質
    return 0.65;                      // 低DPI: 標準品質
  };


  const convertToGrayscale = useCallback(async (
    fileInfo: PDFFileInfo, 
    settings: PDFConversionSettings
  ) => {
    setIsConverting(true);
    updateProgress({ 
      currentPage: 0, 
      totalPages: fileInfo.pages, 
      status: 'loading',
      message: 'PDFファイルを読み込んでいます...'
    });

    try {
      // PDFファイルを読み込み
      const arrayBuffer = await fileInfo.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // 全ページ変換
      const startPage = 1;
      const endPage = pdf.numPages;
      const totalPagesToProcess = pdf.numPages;
      
      updateProgress({ 
        totalPages: totalPagesToProcess,
        status: 'processing',
        message: `ページフォーマットを分析中...`
      });

      // 全ページのフォーマット情報を事前収集
      const pageFormats = await collectPageFormats(pdf, startPage, endPage);
      const formatAnalysis = analyzePageFormats(pageFormats);
      
      updateProgress({
        message: `${formatAnalysis.summary} - 変換開始...`
      });

      // 最初のページのフォーマットでjsPDF初期化
      const firstPageConfig = getJsPDFConfig(pageFormats[0]);
      const jsPdf = new jsPDF(firstPageConfig);

      let isFirstPage = true;

      // 各ページを処理
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const pageIndex = pageNum - startPage;
        const currentPageFormat = pageFormats[pageIndex];
        
        updateProgress({ 
          currentPage: pageIndex + 1,
          message: `ページ ${pageNum}/${endPage} (${currentPageFormat.name}) を変換中...`
        });

        // 前のページと異なるフォーマットの場合は新しいページを追加
        if (!isFirstPage && pageIndex > 0 && !formatsEqual(currentPageFormat, pageFormats[pageIndex - 1])) {
          const pageConfig = getJsPDFConfig(currentPageFormat);
          jsPdf.addPage(pageConfig.format, pageConfig.orientation);
        }

        const page = await pdf.getPage(pageNum);
        
        // 高解像度で描画するための基準ビューポート（scale=1）を取得
        const baseViewport = page.getViewport({ scale: 1 });
        
        // DPI設定に基づいて描画解像度を決定
        const renderDPI = settings.dpiMode === 'preset' ? settings.dpiPreset : settings.customDPI;
        const renderScale = renderDPI / 72; // 72 DPI がデフォルト
        
        // 高解像度での描画用ビューポート
        const renderViewport = page.getViewport({ scale: renderScale });
        
        // Canvasを作成
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { 
          alpha: false, // アルファチャンネル不要でパフォーマンス向上
          willReadFrequently: true // ImageData読み取り用最適化
        });
        
        if (!context) {
          throw new Error('Canvas context を取得できません');
        }

        // Canvas サイズを高解像度で設定
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        
        // 背景を白に設定
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // PDFページを高解像度でCanvasに描画
        const renderContext = {
          canvasContext: context,
          viewport: renderViewport,
          canvas: canvas
        };

        await page.render(renderContext).promise;

        // Canvasをグレースケールに変換
        await convertCanvasToGrayscale(canvas);

        // CanvasをjsPDFに追加（DPIベースの圧縮率を使用）
        const compressionRatio = getCompressionLevel(renderDPI);
        const imgData = canvas.toDataURL('image/jpeg', compressionRatio);
        
        // 現在のページサイズを取得
        const pdfWidth = jsPdf.internal.pageSize.getWidth();
        const pdfHeight = jsPdf.internal.pageSize.getHeight();
        
        // 最初のページ以外は新しいページを追加
        if (!isFirstPage) {
          // 異なるフォーマットの場合は既にループの最初で追加済み
          if (pageIndex === 0 || formatsEqual(currentPageFormat, pageFormats[pageIndex - 1])) {
            const pageConfig = getJsPDFConfig(currentPageFormat);
            jsPdf.addPage(pageConfig.format, pageConfig.orientation);
          }
        } else {
          isFirstPage = false;
        }
        
        // 1:1スケールを保持 - 基準ビューポート（scale=1）のサイズでPDF出力
        // 1 pt = 0.352778 mm
        const PT_TO_MM = 0.352778;
        const imgWidth = baseViewport.width * PT_TO_MM;
        const imgHeight = baseViewport.height * PT_TO_MM;
        
        // PDFページサイズと一致するはずなので、そのまま配置
        // 小さなずれがある場合は中央配置
        const x = Math.max(0, (pdfWidth - imgWidth) / 2);
        const y = Math.max(0, (pdfHeight - imgHeight) / 2);
        
        jsPdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);

        // Canvas メモリクリーンアップ
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
        
        // プログレス更新（UIの応答性を保つために少し待機）
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // PDFデータを生成
      const pdfBlob = jsPdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      grayscaleDataUrl.current = pdfUrl;

      // 完了状態に更新（ファイルサイズ情報付き）
      updateProgress({
        status: 'completed',
        message: `変換完了! ${totalPagesToProcess}ページが処理されました。`,
        outputFileSize: pdfBlob.size
      });

      onSuccess(`PDFのグレースケール変換が完了しました (${totalPagesToProcess}ページ)`);

    } catch (error) {
      console.error('PDF conversion error:', error);
      updateProgress({
        status: 'error',
        message: error instanceof Error ? error.message : '変換中にエラーが発生しました'
      });
      onError('PDF変換中にエラーが発生しました');
    } finally {
      setIsConverting(false);
    }
  }, [onSuccess, onError, updateProgress]);

  const downloadGrayscalePDF = useCallback((originalFileName?: string) => {
    if (!grayscaleDataUrl.current) {
      onError('ダウンロード用のPDFが見つかりません');
      return;
    }

    // ファイル名に_GRサフィックスを追加
    let downloadFileName = 'grayscale-converted.pdf';
    if (originalFileName) {
      const nameWithoutExt = originalFileName.replace(/\.pdf$/i, '');
      downloadFileName = `${nameWithoutExt}_GR.pdf`;
    }

    // ダウンロードを実行
    const link = document.createElement('a');
    link.href = grayscaleDataUrl.current;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onSuccess(`グレースケールPDF「${downloadFileName}」をダウンロードしました`);
  }, [onSuccess, onError]);

  const resetConverter = useCallback(() => {
    setProgress({
      currentPage: 0,
      totalPages: 0,
      status: 'loading'
    });
    setIsConverting(false);
    
    // 古いURLをクリーンアップ
    if (grayscaleDataUrl.current) {
      URL.revokeObjectURL(grayscaleDataUrl.current);
      grayscaleDataUrl.current = null;
    }
  }, []);

  return {
    progress,
    isConverting,
    convertToGrayscale,
    downloadGrayscalePDF,
    resetConverter
  };
};