// ハザードマップポータルサイト（国土地理院）が公開する洪水・土砂災害のラスタタイル。
// https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html
// 色付き PNG（地理院タイル仕様、z2〜17、データの無いタイルは 404）なので、そのまま
// raster レイヤとして重ね、カーソル位置の区分はタイルの画素色を凡例色に照合して求める。
// 凡例色は公式凡例画像と実タイルの画素から確認したもの（境界は中間色が混じる）。
// 1つのオーバーレイが複数のタイル（parts）を重ねて描くこともある（家屋倒壊等氾濫想定区域
// の氾濫流＋河岸侵食）。

export type DisaportalOverlay =
  | 'flood_l1'
  | 'flood_l2'
  | 'flood_kaoku'
  | 'dosha_kyukei'
  | 'dosha_dosekiryu'
  | 'dosha_jisuberi';

export interface DisaportalLegendItem {
  color: string; // #RRGGBB（タイルの塗り色）
  label: string;
  pattern?: boolean; // 丸の繰り返し模様で塗られている（凡例も模様で描く）
}

export interface DisaportalPart {
  path: string; // https://disaportaldata.gsi.go.jp/raster/<path>/{z}/{x}/{y}.png
  minzoom: number;
  legend: DisaportalLegendItem[];
  // 色で区分を分けないタイル（区域内か否かだけ）の区域内ラベル。模様塗りは近傍画素も見る。
  anyLabel?: string;
}

export interface DisaportalLayer {
  title: string;
  hoverPrefix: string;
  parts: DisaportalPart[]; // 下から順に重ねる
}

export const DISAPORTAL_MAXZOOM = 17;
export const DISAPORTAL_ATTRIBUTION =
  '<a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html" target="_blank" rel="noreferrer">ハザードマップポータルサイト</a>';
export const DISAPORTAL_SOURCE_URL = 'https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html';

// 浸水深（計画規模・想定最大規模で共通の凡例）
const DEPTH_LEGEND: DisaportalLegendItem[] = [
  { color: '#FFFFB3', label: '0.3m未満' },
  { color: '#F7F5A9', label: '0.5m未満' },
  { color: '#F8E1A6', label: '0.5〜1m' },
  { color: '#FFD8C0', label: '0.5〜3m' },
  { color: '#FFB7B7', label: '3〜5m' },
  { color: '#FF9191', label: '5〜10m' },
  { color: '#F285C9', label: '10〜20m' },
  { color: '#DC7ADC', label: '20m以上' },
];

export const DISAPORTAL_LAYERS: Record<DisaportalOverlay, DisaportalLayer> = {
  flood_l1: {
    title: '洪水浸水想定区域（計画規模）浸水深',
    hoverPrefix: '浸水深（計画規模）',
    parts: [{ path: '01_flood_l1_shinsuishin_newlegend_data', minzoom: 2, legend: DEPTH_LEGEND }],
  },
  flood_l2: {
    title: '洪水浸水想定区域（想定最大規模）浸水深',
    hoverPrefix: '浸水深（想定最大規模）',
    parts: [{ path: '01_flood_l2_shinsuishin_data', minzoom: 2, legend: DEPTH_LEGEND }],
  },
  flood_kaoku: {
    title: '家屋倒壊等氾濫想定区域',
    hoverPrefix: '家屋倒壊等氾濫想定区域',
    // 河岸侵食(面)を下、氾濫流(赤い丸の模様)を上に重ねる。公式の重ね順と同じ。
    parts: [
      {
        path: '01_flood_l2_kaokutoukai_kagan_data',
        minzoom: 4,
        legend: [{ color: '#FF7F7F', label: '河岸侵食' }],
        anyLabel: '河岸侵食',
      },
      {
        path: '01_flood_l2_kaokutoukai_hanran_data',
        minzoom: 4,
        legend: [{ color: '#FF0000', label: '氾濫流', pattern: true }],
        anyLabel: '氾濫流',
      },
    ],
  },
  dosha_kyukei: {
    title: '土砂災害警戒区域（急傾斜地の崩壊）',
    hoverPrefix: '急傾斜地の崩壊',
    parts: [
      {
        path: '05_kyukeishakeikaikuiki',
        minzoom: 2,
        legend: [
          { color: '#FA2800', label: '土砂災害特別警戒区域' },
          { color: '#FAE600', label: '土砂災害警戒区域' },
          { color: '#FB5333', label: '特別警戒区域（指定前）' },
          { color: '#FBEB33', label: '警戒区域（指定前）' },
        ],
      },
    ],
  },
  dosha_dosekiryu: {
    title: '土砂災害警戒区域（土石流）',
    hoverPrefix: '土石流',
    parts: [
      {
        path: '05_dosekiryukeikaikuiki',
        minzoom: 2,
        legend: [
          { color: '#A50021', label: '土砂災害特別警戒区域' },
          { color: '#E6C832', label: '土砂災害警戒区域' },
        ],
      },
    ],
  },
  dosha_jisuberi: {
    title: '土砂災害警戒区域（地すべり）',
    hoverPrefix: '地すべり',
    parts: [
      {
        path: '05_jisuberikeikaikuiki',
        minzoom: 2,
        legend: [
          { color: '#B40028', label: '土砂災害特別警戒区域' },
          { color: '#FF9900', label: '土砂災害警戒区域' },
        ],
      },
    ],
  },
};

export const DISAPORTAL_OVERLAYS = Object.keys(DISAPORTAL_LAYERS) as DisaportalOverlay[];

export function isDisaportalOverlay(v: string): v is DisaportalOverlay {
  return v in DISAPORTAL_LAYERS;
}

// 地図のレイヤ／ソース id。1オーバーレイ＝parts の数だけ。
export function disaportalLayerIds(kind: DisaportalOverlay): string[] {
  return DISAPORTAL_LAYERS[kind].parts.map((_, i) => `dp-${kind}-${i}`);
}

// 凡例は全 parts の項目を並べたもの。
export function disaportalLegend(kind: DisaportalOverlay): DisaportalLegendItem[] {
  return DISAPORTAL_LAYERS[kind].parts.flatMap((p) => p.legend);
}

export function disaportalTileUrl(part: DisaportalPart): string {
  return `https://disaportaldata.gsi.go.jp/raster/${part.path}/{z}/{x}/{y}.png`;
}

// ---- カーソル位置の区分（タイル画素の色 → 凡例） ----

const tileCache = new Map<string, Promise<Uint8ClampedArray | null>>();
const TILE_CACHE_MAX = 64;

function loadTile(url: string): Promise<Uint8ClampedArray | null> {
  const hit = tileCache.get(url);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null; // 404 = その範囲にデータなし
      const bmp = await createImageBitmap(await res.blob(), {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 256;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, 256, 256).data;
    } catch {
      return null;
    }
  })();
  tileCache.set(url, p);
  if (tileCache.size > TILE_CACHE_MAX) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  return p;
}

const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function nearestLabel(legend: DisaportalLegendItem[], r: number, g: number, b: number): string {
  let best = legend[0].label;
  let bestD = Infinity;
  for (const item of legend) {
    const [lr, lg, lb] = hexRgb(item.color);
    const d = (lr - r) ** 2 + (lg - g) ** 2 + (lb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = item.label;
    }
  }
  return best;
}

// 1枚のタイルでの区分ラベル。区域外（透明・タイルなし）は null。
async function partLabelAt(part: DisaportalPart, lng: number, lat: number, mapZoom: number): Promise<string | null> {
  // 表示中と同じズームのタイルを読む（ブラウザキャッシュが効き、見た目とも一致する）。
  const z = Math.max(part.minzoom, Math.min(DISAPORTAL_MAXZOOM, Math.round(mapZoom)));
  const n = 2 ** z;
  const xf = ((lng + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  const url = disaportalTileUrl(part).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const img = await loadTile(url);
  if (!img) return null;
  const px = Math.min(255, Math.max(0, Math.floor((xf - x) * 256)));
  const py = Math.min(255, Math.max(0, Math.floor((yf - y) * 256)));
  // 模様塗り（氾濫流の丸など）は画素の間が透明なので、模様のタイルだけ近傍も見る。
  const radius = part.legend.some((l) => l.pattern) ? 4 : 0;
  for (let d = 0; d <= radius; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const qx = px + dx;
        const qy = py + dy;
        if (qx < 0 || qy < 0 || qx > 255 || qy > 255) continue;
        const i = (qy * 256 + qx) * 4;
        if (img[i + 3] < 128) continue; // 透明・境界のにじみは区域外扱い
        return part.anyLabel ?? nearestLabel(part.legend, img[i], img[i + 1], img[i + 2]);
      }
    }
  }
  return null;
}

// 緯度経度の区分ラベル。複数 parts のオーバーレイは該当するものを「・」で並べる
// （例: 氾濫流・河岸侵食）。どれにも該当しなければ null。
export async function disaportalLabelAt(
  kind: DisaportalOverlay,
  lng: number,
  lat: number,
  mapZoom: number
): Promise<string | null> {
  const labels = await Promise.all(
    DISAPORTAL_LAYERS[kind].parts.map((part) => partLabelAt(part, lng, lat, mapZoom))
  );
  const hit = labels.filter((l): l is string => l != null);
  // 上に重ねたもの（配列の後ろ）を先に書く。
  return hit.length ? hit.reverse().join('・') : null;
}
