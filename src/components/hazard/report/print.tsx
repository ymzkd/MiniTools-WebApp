// レポートの印刷出力。HazardMapApp から動的 import() でのみ読み込まれる。
// react-dom/server で印刷用HTMLを生成し、非表示 iframe に流し込んでブラウザの
// 「印刷 → PDFに保存」を起動する。フォントはユーザーのローカル書体を使う（取得なし）。
import { renderToStaticMarkup } from 'react-dom/server';
import { HazardReportView } from './HazardReportView';
import type { HazardReportData } from './types';

const PRINT_CSS = `
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; background:#fff; }
  /* A4・余白0でシートをそのまま1ページに。背景色も印刷する。 */
  @page{ size:A4; margin:0; }
  *,*::before,*::after{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  /* 万一2ページ目に溢れた場合に各ブロックを途中で割らない */
  div{ break-inside:avoid; }
`;

function docTitle(data: HazardReportData): string {
  const base = data.placeName?.replace(/\s+/g, '_') || `${data.point.lat.toFixed(5)}_${data.point.lng.toFixed(5)}`;
  const date = data.generatedAt.replace(/[^0-9]/g, '').slice(0, 8);
  // 多くのブラウザは「PDFに保存」時の既定ファイル名にこのタイトルを使う。
  return `HazardReport_${base}_${date}`;
}

async function waitReady(win: Window): Promise<void> {
  const doc = win.document;
  const imgs = Array.from(doc.images);
  await Promise.race([
    Promise.all(
      imgs.map((img) =>
        img.complete
          ? null
          : new Promise<void>((res) => {
              img.addEventListener('load', () => res(), { once: true });
              img.addEventListener('error', () => res(), { once: true });
            })
      )
    ),
    new Promise<void>((r) => setTimeout(r, 5000)),
  ]);
  try {
    await (doc.fonts?.ready ?? Promise.resolve());
  } catch {
    /* noop */
  }
  // レイアウト確定を1フレーム待つ
  await new Promise<void>((r) => setTimeout(r, 60));
}

/** レポートを印刷ダイアログで開く（ユーザーが「PDFに保存」を選択）。 */
export async function printHazardReport(data: HazardReportData): Promise<void> {
  const markup = renderToStaticMarkup(<HazardReportView data={data} />);
  const html =
    `<!doctype html><html lang="ja"><head><meta charset="utf-8">` +
    `<title>${docTitle(data)}</title><style>${PRINT_CSS}</style></head>` +
    `<body>${markup}</body></html>`;

  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error('印刷用フレームを作成できませんでした');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  await waitReady(win);

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* noop */
    }
  };
  // 印刷ダイアログ完了後に後片付け。afterprint と保険のタイマー両方で確実に。
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 120000);

  win.focus();
  win.print();
}
