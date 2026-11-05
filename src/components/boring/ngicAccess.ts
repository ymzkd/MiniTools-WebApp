import type { MLITSearchResult } from './types';

export const NGIC_PUBLIC_URL = 'https://publicweb.ngic.or.jp/public/publicweb.php';

// 掲載元で判定する。発注者分類や提供元の名前では KuniJiban 掲載有無を判別できない。
export function isNgicOnly(result: MLITSearchResult): boolean {
  if (result.source === 'tokyo') return false;
  const listed = result.metadata?.['NGI:kj_listed'];
  if (listed !== undefined) return listed === '0';
  // API 更新前のレスポンスでも、NGIC 個別ビューアの直リンクは開かない。
  const viewUrl = result.metadata?.['NGI:link_boring_view'];
  return !!viewUrl?.startsWith('https://publicweb.ngic.or.jp/');
}
