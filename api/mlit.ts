import type { VercelRequest, VercelResponse } from '@vercel/node';

// MLIT DPF API エンドポイント
const MLIT_API_ENDPOINT = 'https://www.mlit-data.jp/api/v1/';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // POSTメソッドのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // APIキーを環境変数から取得
  const apiKey = process.env.MLIT_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { query, variables } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'GraphQL query is required' });
    }

    // MLIT DPF APIへリクエスト
    const response = await fetch(MLIT_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('MLIT API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500),
      });
      return res.status(response.status).json({
        error: `MLIT API error: ${response.status} ${response.statusText}`,
      });
    }

    const data = await response.json();

    // GraphQLエラーチェック
    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      return res.status(400).json({
        error: 'GraphQL errors',
        details: data.errors,
      });
    }

    // 成功レスポンス
    return res.status(200).json(data);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
