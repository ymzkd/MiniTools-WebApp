// Production server for Dokploy deployment.
// Serves the built Vite SPA from dist/ and provides the two API proxies that
// run as Vercel serverless functions in the Vercel/Netlify deployments
// (see api/mlit.ts and api/kunijiban.ts) so the boring-data tool keeps working.
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '4mb' }))

const MLIT_API_ENDPOINT = 'https://data-platform.mlit.go.jp/api/v1/'

// MLIT DPF GraphQL proxy (adds the apikey header from the environment).
app.post('/api/mlit', async (req, res) => {
  const apiKey = process.env.MLIT_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }
  try {
    const { query, variables } = req.body || {}
    if (!query) {
      return res.status(400).json({ error: 'GraphQL query is required' })
    }
    const response = await fetch(MLIT_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error('MLIT API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500),
      })
      return res
        .status(response.status)
        .json({ error: `MLIT API error: ${response.status} ${response.statusText}` })
    }
    const data = await response.json()
    if (data.errors) {
      console.error('GraphQL Errors:', data.errors)
      return res.status(400).json({ error: 'GraphQL errors', details: data.errors })
    }
    return res.status(200).json(data)
  } catch (error) {
    console.error('Server error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// KuniJiban XML proxy (avoids CORS; only allows the kunijiban.pwri.go.jp domain).
app.get('/api/kunijiban', async (req, res) => {
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' })
  }
  if (!url.startsWith('https://www.kunijiban.pwri.go.jp/')) {
    return res.status(403).json({ error: 'Invalid URL domain' })
  }
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error('KuniJiban API Error:', {
        status: response.status,
        statusText: response.statusText,
        url,
      })
      return res
        .status(response.status)
        .json({ error: `Failed to fetch XML: ${response.status} ${response.statusText}` })
    }
    const arrayBuffer = await response.arrayBuffer()
    res.setHeader('Content-Type', 'application/xml; charset=shift-jis')
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).send(Buffer.from(arrayBuffer))
  } catch (error) {
    console.error('Server error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// 東京の地盤(GIS版) ローカル地盤API への薄いリバースプロキシ。
// jiban-api は別コンテナ（同一Dockerネットワーク）。ブラウザからは minitools
// 同一オリジンの /api/tokyo/* で叩けるので Mixed Content / CORS が発生しない。
// JIBAN_API_URL 未設定なら東京機能は無効（503）＝MLIT単独でも動作する。
const JIBAN_API_URL = process.env.JIBAN_API_URL // 例: http://jiban-api:8000
app.use('/api/tokyo', async (req, res) => {
  if (!JIBAN_API_URL) {
    return res.status(503).json({ error: 'Tokyo jiban API not configured' })
  }
  try {
    const target = JIBAN_API_URL.replace(/\/$/, '') + req.originalUrl.replace(/^\/api\/tokyo/, '')
    const upstream = await fetch(target, {
      method: req.method,
      headers: { accept: req.headers['accept'] || '*/*' },
    })
    res.status(upstream.status)
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    const cc = upstream.headers.get('cache-control')
    if (cc) res.setHeader('Cache-Control', cc)
    const buf = Buffer.from(await upstream.arrayBuffer())
    return res.send(buf)
  } catch (error) {
    console.error('Tokyo jiban proxy error:', error)
    return res.status(502).json({
      error: 'Bad gateway to jiban API',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// 全国 国土地盤情報(NGI) ローカルDB + NGIC中継プロキシ への薄いリバースプロキシ。
// /api/ngi/* → jiban-api /ngi/*（/search /within /density /proxy/...）。
// 同一オリジン化により、Referer必須でブラウザ直リンク不可な NGIC柱状図XML/PDF/PNGも
// /api/ngi/proxy/* 経由でそのまま開ける。XMLバイナリ(Shift_JIS)/PDF/PNGを透過する。
app.use('/api/ngi', async (req, res) => {
  if (!JIBAN_API_URL) {
    return res.status(503).json({ error: 'NGI jiban API not configured' })
  }
  try {
    const target =
      JIBAN_API_URL.replace(/\/$/, '') + req.originalUrl.replace(/^\/api\/ngi/, '/ngi')
    const upstream = await fetch(target, {
      method: req.method,
      headers: { accept: req.headers['accept'] || '*/*' },
    })
    res.status(upstream.status)
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    const cc = upstream.headers.get('cache-control')
    if (cc) res.setHeader('Cache-Control', cc)
    const buf = Buffer.from(await upstream.arrayBuffer())
    return res.send(buf)
  } catch (error) {
    console.error('NGI jiban proxy error:', error)
    return res.status(502).json({
      error: 'Bad gateway to jiban API',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Static assets + SPA fallback (final middleware works across Express 4/5).
const distDir = path.join(__dirname, 'dist')
app.use(express.static(distDir))
app.use((_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MiniTools server listening on http://0.0.0.0:${PORT}`)
})
