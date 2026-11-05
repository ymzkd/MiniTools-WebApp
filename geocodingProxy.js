import { Router } from 'express'

export const JAGEOCODER_ATTRIBUTION = '「位置参照情報（大字町丁目・街区レベル）令和5年」（国土交通省）、「電子国土基本図（地名情報）住居表示住所」（国土地理院）、「Geolonia 住所データ」（株式会社Geolonia） https://geolonia.github.io/japanese-addresses/、「アドレス・ベース・レジストリ」（デジタル庁） https://www.digital.go.jp/policies/base_registry_address_tos/、「登記所備付地図データ」（法務省）をもとに、株式会社情報試作室が加工した jageocoder 用住所データベース（住居表示レベル）を利用'

export function createGeocodingRouter({
  provider = process.env.GEOCODING_PROVIDER || 'nominatim',
  apiUrl = process.env.GEOCODING_API_URL,
  fetchImpl = fetch,
  requestsPerMinute = 120,
} = {}) {
  if (!['nominatim', 'jageocoder'].includes(provider)) throw new Error('Invalid GEOCODING_PROVIDER')
  if (provider === 'jageocoder' && !apiUrl) throw new Error('GEOCODING_API_URL is required for jageocoder')
  const router = Router()
  const config = {
    provider,
    attribution: provider === 'jageocoder' ? JAGEOCODER_ATTRIBUTION : 'OpenStreetMap（住所検索 Nominatim・ODbL）',
    notice: provider === 'jageocoder' ? '住所検索は日本の住所表記が対象です（施設名検索は非対応）。逆引きは近傍の住所候補であり、地点の正確な地番を保証しません。辞書データ: 2025年4月23日版。' : '',
  }
  router.get('/config', (_req, res) => res.json(config))
  let windowStart = Date.now(), count = 0
  router.get(['/search', '/reverse'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (provider !== 'jageocoder') return res.status(409).json({ error: 'Local geocoding is not enabled' })
    const params = new URLSearchParams()
    if (req.path === '/search') {
      const q = req.query.q
      if (typeof q !== 'string' || !q.trim() || q.length > 200) return res.status(422).json({ error: 'Invalid address' })
      params.set('q', q.trim())
    } else {
      for (const [key, max] of [['lat', 90], ['lng', 180]]) {
        const value = req.query[key]
        if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > max) {
          return res.status(422).json({ error: 'Invalid coordinates' })
        }
        params.set(key, String(Number(value)))
      }
    }
    const now = Date.now()
    if (now - windowStart >= 60000) { windowStart = now; count = 0 }
    if (++count > requestsPerMinute) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60000 - now + windowStart) / 1000))))
      return res.status(429).json({ error: 'Geocoding request limit reached' })
    }
    const ac = new AbortController()
    res.on('close', () => ac.abort())
    try {
      const target = `${apiUrl.replace(/\/$/, '')}${req.path}?${params}`
      const response = await fetchImpl(target, { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(8000)]) })
      if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: 'Local geocoding unavailable' })
      return res.json(await response.json())
    } catch {
      if (!ac.signal.aborted) return res.status(502).json({ error: 'Local geocoding unavailable' })
    }
  })
  // No public-service fallback: a local outage must not generate external traffic.
  return router
}
