/**
 * Canvas画像をグレースケールに変換するユーティリティ関数
 */

/**
 * Canvas要素をグレースケールに変換する
 * @param canvas - 変換対象のCanvas要素
 */
export const convertCanvasToGrayscale = async (
  canvas: HTMLCanvasElement
): Promise<void> => {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context を取得できません');
  }

  try {
    // 現在のCanvas内容を取得
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // グレースケール変換を実行
    convertImageDataToGrayscale(data);

    // 変換した画像データをCanvasに戻す
    context.putImageData(imageData, 0, 0);

  } catch (error) {
    console.error('Grayscale conversion error:', error);
    throw new Error('グレースケール変換中にエラーが発生しました');
  }
};

/**
 * ImageDataをグレースケールに変換する（高速化版）
 * @param data - ImageData.data配列
 */
const convertImageDataToGrayscale = (data: Uint8ClampedArray): void => {
  // 各ピクセルに対してグレースケール変換を実行
  for (let i = 0; i < data.length; i += 4) {
    // RGBピクセル値を取得
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    // アルファチャンネル (data[i + 3]) はそのまま

    // 輝度計算（人間の視覚特性に基づく加重平均）
    // ITU-R BT.709 標準に基づく係数を使用
    const grayscale = Math.round(
      red * 0.2126 +    // 赤の寄与度
      green * 0.7152 +  // 緑の寄与度（最も高い）
      blue * 0.0722     // 青の寄与度
    );

    // RGB全てのチャンネルに同じグレースケール値を設定
    data[i] = grayscale;     // Red
    data[i + 1] = grayscale; // Green
    data[i + 2] = grayscale; // Blue
    // Alpha (data[i + 3]) はそのまま保持
  }
};


/**
 * Canvas要素からグレースケールのData URLを生成
 * @param canvas - 対象のCanvas要素
 * @param format - 出力形式 ('image/jpeg' | 'image/png')
 * @param quality - JPEG品質 (0.1 - 1.0)
 * @returns Data URL文字列
 */
export const canvasToGrayscaleDataURL = (
  canvas: HTMLCanvasElement,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality: number = 0.8
): string => {
  // JPEGの場合のみqualityパラメータを適用
  if (format === 'image/jpeg') {
    return canvas.toDataURL(format, quality);
  }
  return canvas.toDataURL(format);
};

/**
 * 画像のファイルサイズを推定する
 * @param dataUrl - Data URL文字列
 * @returns 推定ファイルサイズ（バイト）
 */
export const estimateFileSize = (dataUrl: string): number => {
  // Base64エンコードされた部分を抽出
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) return 0;
  
  // Base64デコード後のバイト数を計算
  // Base64は4文字で3バイトを表現するが、パディングを考慮
  const paddingChars = (base64Data.match(/=/g) || []).length;
  return Math.floor((base64Data.length * 3) / 4) - paddingChars;
};

/**
 * Canvas要素の最適な解像度を計算する
 * @param originalWidth - 元の幅
 * @param originalHeight - 元の高さ
 * @param targetDPI - 目標DPI
 * @param maxDimension - 最大寸法制限
 * @returns 最適化されたサイズ { width, height }
 */
export const calculateOptimalResolution = (
  originalWidth: number,
  originalHeight: number,
  targetDPI: number = 200,
  maxDimension: number = 4096
): { width: number; height: number } => {
  // アスペクト比を保持
  const aspectRatio = originalWidth / originalHeight;
  
  // DPIに基づくスケール計算（72 DPIを基準）
  const scale = targetDPI / 72;
  
  let width = Math.floor(originalWidth * scale);
  let height = Math.floor(originalHeight * scale);
  
  // 最大寸法制限をチェック
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      width = maxDimension;
      height = Math.floor(maxDimension / aspectRatio);
    } else {
      height = maxDimension;
      width = Math.floor(maxDimension * aspectRatio);
    }
  }
  
  return { width, height };
};