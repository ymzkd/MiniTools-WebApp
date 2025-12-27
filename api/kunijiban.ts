import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * KuniJiban XMLファイル取得プロキシ
 * CORS問題を回避するため、サーバーサイドでXMLを取得してクライアントに返す
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // セキュリティ: kunijiban.pwri.go.jp のURLのみ許可
  if (!url.startsWith('https://www.kunijiban.pwri.go.jp/')) {
    return res.status(403).json({ error: 'Invalid URL domain' });
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error('KuniJiban API Error:', {
        status: response.status,
        statusText: response.statusText,
        url,
      });
      return res.status(response.status).json({
        error: `Failed to fetch XML: ${response.status} ${response.statusText}`,
      });
    }

    // XMLデータを取得（Shift_JISのバイナリデータ）
    const arrayBuffer = await response.arrayBuffer();

    // Content-Typeヘッダーを設定してバイナリデータを返す
    res.setHeader('Content-Type', 'application/xml; charset=shift-jis');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
