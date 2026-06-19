import React, { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';

interface LatLng {
  lat: number;
  lng: number;
}

export type ZoneOverlay = 'none' | 'snow' | 'wind';

interface SeaRatioMapProps {
  center: LatLng; // マーカー＋海率円の中心（地図クリックでも更新される）
  radiusKm: number;
  // この値が変わったとき（住所検索・座標入力・初期表示）だけ円全体が収まるよう表示範囲を合わせる。
  // 地図クリックでは変えない＝クリックのたびに勝手にズームしないようにするため。
  viewVersion: number;
  overlay: ZoneOverlay; // 地域区分の薄いオーバーレイ（none / 積雪区分 / 風速区分）
  onPick: (lat: number, lng: number) => void;
}

// ゾーン番号→色。色が濃いほど区分番号が大きい（元アプリと同じ向き）。薄く重ねる。
// 積雪は青系(第1〜40区)、風速は赤系(第1〜9区)。
const ZONE_FILL_COLOR: Record<'snow' | 'wind', maplibregl.ExpressionSpecification> = {
  snow: ['interpolate', ['linear'], ['get', 'zone'], 1, '#deebf7', 20, '#6baed6', 40, '#08306b'],
  wind: ['interpolate', ['linear'], ['get', 'zone'], 1, '#fee5d9', 5, '#fb6a4a', 9, '#a50f15'],
};

// ゾーン区分ベクタタイル(PMTiles)の同一オリジン取得パス。jiban-api /design/tiles を
// minitools の Express が Range 転送する。tippecanoe の -l zones に対応(source-layer)。
const ZONE_PMTILES: Record<'snow' | 'wind', string> = {
  snow: '/api/design/tiles/snow_zones.pmtiles',
  wind: '/api/design/tiles/wind_zones.pmtiles',
};
const ZONE_SOURCE_LAYER = 'zones';

// pmtiles プロトコルはグローバル登録。boring 側でも使うため重複登録を避け、解除もしない
// (全タブ常時マウントのSPAなので、片方のアンマウントで他方を壊さないよう removeProtocol しない)。
let _pmtilesRegistered = false;
function ensurePmtilesProtocol() {
  if (_pmtilesRegistered) return;
  _pmtilesRegistered = true;
  maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
}

// 経度を [-180, 180] に正規化（メルカトルで地図を一周しても巨大な経度を上流へ送らない）。
function normLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

// 中心から半径 radiusKm の地理的な円（球面の正確な目的地計算）を多角形座標で返す。
function circleCoords(lat: number, lng: number, radiusKm: number, steps = 96): number[][] {
  const R = 6371; // 地球半径(km)
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const d = radiusKm / R;
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng)
    );
    const lng2 =
      lngR +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latR),
        Math.cos(d) - Math.sin(latR) * Math.sin(lat2)
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return coords;
}

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      gsi: {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
      },
    },
    layers: [
      // 未読込領域が暗く見えないよう、最下層を地理院淡色地図の地色に近い明色で塗る（boring と同じ）。
      { id: 'bg', type: 'background', paint: { 'background-color': '#eceae4' } },
      { id: 'gsi', type: 'raster', source: 'gsi' },
    ],
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const SeaRatioMap: React.FC<SeaRatioMapProps> = ({
  center,
  radiusKm,
  viewVersion,
  overlay,
  onPick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const firstFitRef = useRef(false);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // ゾーン区分オーバーレイの表示切り替え（タイルは可視時に maplibre が遅延取得する）。
  const applyOverlay = useCallback((kind: ZoneOverlay) => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer('zones-snow-fill')) return;
    map.setLayoutProperty('zones-snow-fill', 'visibility', kind === 'snow' ? 'visible' : 'none');
    map.setLayoutProperty('zones-wind-fill', 'visibility', kind === 'wind' ? 'visible' : 'none');
  }, []);
  // viewVersion 効果が最新の中心・半径を参照するための ref（中心変化では再fitしないため依存に入れない）
  const latestRef = useRef({ center, radiusKm });
  latestRef.current = { center, radiusKm };

  // 初期化（マウント時1回）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [center.lng, center.lat],
      zoom: 10,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    ensurePmtilesProtocol();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.scrollZoom.setWheelZoomRate(1 / 120);
    map.scrollZoom.setZoomRate(1 / 60);
    map.getCanvas().style.cursor = 'crosshair';

    // タブが display:none で 0×0 マウントされるため、実サイズが付いた最初のタイミングで
    // 一度だけ円全体にフィットさせる（0サイズで fitBounds するとズームがずれるため）。
    const maybeInitialFit = () => {
      const el = containerRef.current;
      if (firstFitRef.current || !readyRef.current || !el || el.clientWidth === 0) return;
      firstFitRef.current = true;
      const { center: c, radiusKm: r } = latestRef.current;
      fitToCircle(map, c, r);
    };

    map.on('load', () => {
      // ゾーン区分オーバーレイ（GSIタイルの上・解析円の下に薄く重ねる）。初期は非表示。
      // PMTilesベクタソースを2種(積雪/風速)。可視になったタイルだけ Range 取得される。
      const origin = window.location.origin;
      (['snow', 'wind'] as const).forEach((kind) => {
        map.addSource(`zones-${kind}`, {
          type: 'vector',
          url: `pmtiles://${origin}${ZONE_PMTILES[kind]}`,
        });
        map.addLayer({
          id: `zones-${kind}-fill`,
          type: 'fill',
          source: `zones-${kind}`,
          'source-layer': ZONE_SOURCE_LAYER,
          layout: { visibility: 'none' },
          paint: { 'fill-color': ZONE_FILL_COLOR[kind], 'fill-opacity': 0.4 },
        });
      });

      map.addSource('circle', { type: 'geojson', data: EMPTY_FC });
      map.addSource('marker', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'circle-fill',
        type: 'fill',
        source: 'circle',
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: 'circle-line',
        type: 'line',
        source: 'circle',
        paint: { 'line-color': '#2563eb', 'line-width': 2 },
      });
      map.addLayer({
        id: 'marker',
        type: 'circle',
        source: 'marker',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      readyRef.current = true;
      // 初期データ反映。表示範囲合わせは「実サイズが付いてから」一度だけ（下の maybeInitialFit）。
      updateData(map, center, radiusKm);
      maybeInitialFit();
      applyOverlay(overlayRef.current); // マウント時にオーバーレイ選択済みなら反映
    });

    // 地図のどこをクリックしても、その地点を選択する。
    map.on('click', (e) => {
      onPickRef.current(e.lngLat.lat, normLng(e.lngLat.lng));
    });

    const ro = new ResizeObserver(() => {
      map.resize();
      maybeInitialFit();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 中心・半径が変わったらマーカー＋円を更新（表示範囲は変えない）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    updateData(map, center, radiusKm);
  }, [center, radiusKm]);

  // viewVersion が変わったとき（住所検索・座標入力）だけ円全体に合わせる
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || viewVersion === 0) return;
    const { center: c, radiusKm: r } = latestRef.current;
    fitToCircle(map, c, r);
  }, [viewVersion]);

  // オーバーレイ選択が変わったら反映
  useEffect(() => {
    applyOverlay(overlay);
  }, [overlay, applyOverlay]);

  return (
    <div className="h-full w-full relative">
      <div
        ref={containerRef}
        className="h-full w-full rounded-lg"
        style={{ minHeight: '400px', backgroundColor: '#eceae4' }}
      />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1] bg-gray-900/80 text-white text-xs px-3 py-1.5 rounded-full shadow pointer-events-none">
        地図をクリックして地点を指定
      </div>
    </div>
  );
};

function updateData(map: maplibregl.Map, center: LatLng, radiusKm: number) {
  const circle = map.getSource('circle') as maplibregl.GeoJSONSource | undefined;
  const marker = map.getSource('marker') as maplibregl.GeoJSONSource | undefined;
  if (!circle || !marker) return;
  circle.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [circleCoords(center.lat, center.lng, radiusKm)] },
  });
  marker.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
  });
}

function fitToCircle(map: maplibregl.Map, center: LatLng, radiusKm: number) {
  const coords = circleCoords(center.lat, center.lng, radiusKm);
  const b = new maplibregl.LngLatBounds();
  for (const c of coords) b.extend(c as [number, number]);
  map.fitBounds(b, { padding: 40, animate: false, maxZoom: 14 });
}

export default SeaRatioMap;
