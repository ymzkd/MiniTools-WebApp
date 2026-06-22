// PDFレポート生成のエントリ。HazardMapApp から動的 import() でのみ読み込まれる
// （重い @react-pdf/renderer を初期バンドルに乗せないため）。
// データ(HazardReportData)を受け取り、ベクターPDFを生成してダウンロードさせる。
import { pdf } from '@react-pdf/renderer';
import { HazardReportDocument } from './HazardReportDocument';
import type { HazardReportData } from './types';

// ファイル名に使えない文字を除去し、所在地（無ければ緯度経度）から組み立てる。
function buildFileName(data: HazardReportData): string {
  const base =
    (data.placeName && data.placeName.replace(/\s+/g, '_')) ||
    `${data.point.lat.toFixed(5)}_${data.point.lng.toFixed(5)}`;
  const safe = base.replace(/[\\/:*?"<>|]/g, '');
  const date = data.generatedAt.replace(/[^0-9]/g, '').slice(0, 8) || 'report';
  return `HazardReport_${safe}_${date}.pdf`;
}

/** レポートPDFを生成してブラウザにダウンロードさせる。 */
export async function generateHazardPdf(data: HazardReportData): Promise<void> {
  const blob = await pdf(<HazardReportDocument data={data} />).toBlob();

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFileName(data);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 次のタスクで解放（クリックのダウンロード開始を待つ）。
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
