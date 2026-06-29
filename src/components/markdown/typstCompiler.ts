import { $typst, loadFonts } from '@myriaddreamin/typst.ts';
// WASM はローカルバンドルから配信（CDN 非依存）。Vite が ?url でアセット URL を返す。
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
// フォントもローカルに同梱（オフライン動作・日本語対応のため CDN を使わない）
import serifUrl from '../../assets/typst-fonts/DejaVuSerif.ttf?url';
import serifBoldUrl from '../../assets/typst-fonts/DejaVuSerif-Bold.ttf?url';
import monoUrl from '../../assets/typst-fonts/DejaVuSansMono.ttf?url';
import cjkUrl from '../../assets/typst-fonts/IPAGothic.ttf?url';
import mathUrl from '../../assets/typst-fonts/STIXTwoMath-Regular.ttf?url';

let initialized = false;

// コンパイラ／レンダラの初期化オプションは最初の利用前に一度だけ設定する。
function ensureInit() {
  if (initialized) return;
  initialized = true;
  $typst.setCompilerInitOptions({
    getModule: () => compilerWasmUrl,
    // デフォルトの CDN フォント取得を無効化し、同梱フォントのみを読み込む
    beforeBuild: [
      loadFonts(
        [serifUrl, serifBoldUrl, monoUrl, cjkUrl, mathUrl],
        { assets: false },
      ),
    ],
  });
  $typst.setRendererInitOptions({ getModule: () => rendererWasmUrl });
}

/**
 * Typst ソースを SVG 文字列にコンパイルする。
 * 初回呼び出し時に WASM コンパイラ（約 28MB）とフォントを遅延ロードするため時間がかかる。
 * コンパイルエラー時は例外を送出する。
 */
export async function compileTypstToSvg(source: string): Promise<string> {
  ensureInit();
  return await $typst.svg({ mainContent: source });
}
