import * as pmtiles from 'pmtiles';

// 値ラスターPMTiles(terrariumエンコード、0=データなし)の取得パスと点読み出し。
// jiban-api pipelines/{snow_depth,jshis}/ の出力とエンコードを一致させること。
//   snow_depth:  enc = d[cm]       (垂直積雪量, native z12)
//   site_amp:    enc = ARV×100     (地盤増幅率 工学的基盤Vs=400m/s→地表, 250mメッシュ, native z12)
//   vs350_depth: enc = D1[m] + 1   (深部地盤モデル第1層(Vs=350m/s)下面 = Vs400m/s層上面 の
//                                   地表からの深さ, 陸のみ, native z10。深さ0m=層なしも
//                                   有効値なのでデータなし(0)と区別する)
export const DEPTH_PMTILES = '/api/design/tiles/snow_depth.pmtiles';
export const DEPTH_NATIVE_Z = 12; // build_snow_depth.py のネイティブズーム
export const AMP_PMTILES = '/api/design/tiles/site_amp.pmtiles';
export const AMP_NATIVE_Z = 12;
export const VS350_PMTILES = '/api/design/tiles/vs350_depth.pmtiles';
export const VS350_NATIVE_Z = 10;
export const VS350_OFFSET = 1;

// 値ラスターをカーソル/地点で読み出す汎用リーダー。PMTiles を直接デコードし、
// 同一タイルは ImageData をキャッシュ(タイル内移動は再デコード不要)。
// 返り値は terrarium 復号後の生エンコード値。
function makeValueRasterReader(path: string, nativeZ: number) {
  let pm: pmtiles.PMTiles | null = null;
  const cache = new Map<string, Uint8ClampedArray | null>();

  async function loadTile(z: number, x: number, y: number): Promise<Uint8ClampedArray | null> {
    const key = `${z}/${x}/${y}`;
    if (cache.has(key)) return cache.get(key)!;
    let out: Uint8ClampedArray | null = null;
    try {
      if (!pm) pm = new pmtiles.PMTiles(`${window.location.origin}${path}`);
      const r = await pm.getZxy(z, x, y);
      if (r) {
        // 値ラスターなので色変換/プリマルチを無効化して画素値を正確に読む（R は terrarium の
        // 上位バイト=×256 なので 1 ずれると値が 256 狂う）。
        const bmp = await createImageBitmap(new Blob([r.data], { type: 'image/png' }), {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        });
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 256;
        const ctx = cv.getContext('2d');
        if (ctx) {
          ctx.drawImage(bmp, 0, 0);
          out = ctx.getImageData(0, 0, 256, 256).data;
        }
      }
    } catch {
      out = null;
    }
    cache.set(key, out);
    return out;
  }

  // 緯度経度のエンコード値（terrarium 復号）。タイルなし/取得失敗は null。
  return async function heightAt(lng: number, lat: number): Promise<number | null> {
    const n = 2 ** nativeZ;
    const xf = ((lng + 180) / 360) * n;
    const latR = (lat * Math.PI) / 180;
    const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
    const x = Math.floor(xf);
    const y = Math.floor(yf);
    const px = Math.min(255, Math.max(0, Math.floor((xf - x) * 256)));
    const py = Math.min(255, Math.max(0, Math.floor((yf - y) * 256)));
    const img = await loadTile(nativeZ, x, y);
    if (!img) return null;
    const i = (py * 256 + px) * 4;
    return img[i] * 256 + img[i + 1] + img[i + 2] / 256 - 32768; // terrarium 復号
  };
}

export const depthHeightAt = makeValueRasterReader(DEPTH_PMTILES, DEPTH_NATIVE_Z);
export const ampHeightAt = makeValueRasterReader(AMP_PMTILES, AMP_NATIVE_Z);
export const vs350HeightAt = makeValueRasterReader(VS350_PMTILES, VS350_NATIVE_Z);

// 緯度経度の積雪深[cm]。雪なし/タイルなしは null。
export async function depthAtLngLat(lng: number, lat: number): Promise<number | null> {
  const d = await depthHeightAt(lng, lat);
  return d != null && d > 0.5 ? d : null;
}

// 緯度経度の地盤増幅率(ARV)。データなし(海など)は null。
export async function ampAtLngLat(lng: number, lat: number): Promise<number | null> {
  const h = await ampHeightAt(lng, lat);
  return h != null && h > 0 ? h / 100 : null;
}

// 緯度経度の Vs400m/s層上面深さ[m]。山地などで層厚ゼロの場合は 0 を返す。
// データなし(海など)は null。
export async function vs400DepthAtLngLat(lng: number, lat: number): Promise<number | null> {
  const h = await vs350HeightAt(lng, lat);
  return h != null && h > 0 ? h - VS350_OFFSET : null;
}
