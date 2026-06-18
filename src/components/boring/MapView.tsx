import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import type { GeoLocation, MLITSearchResult } from './types';

// 近接ピック(クリック周辺の地点をリスト化)のピクセル閾値
const PICK_PX = 12;
const TOKYO_COLOR = '#f59e0b';
const NGI_COLOR = '#ef4444';
const SELECTED_COLOR = '#2563eb';

// 全地点を単一PMTiles(/api/ngi/tiles/points.pmtiles)から描画する。
// 低ズーム=ヒートマップ(密度)、中〜高ズーム=ソース色分けの円。クリックで個別地点を選択。
// 地点データの取得はタイル側に寄せたので、ビューポート連動のAPI取得は行わない。
const PMTILES_URL = '/api/ngi/tiles/points.pmtiles';
const POINTS_LAYER = 'points'; // tippecanoe -l points

interface MapViewProps {
  center: GeoLocation;
  selectedResult: MLITSearchResult | null;
  onPickNearby: (points: MLITSearchResult[]) => void;
  onResultSelect: (result: MLITSearchResult) => void;
}

interface TileProps {
  source?: string; // 'tokyo' | 'ngi'
  id?: string;
  title?: string;
  xml_url?: string;
  log_url?: string;
  soil_xml_url?: string;
  soil_log_url?: string;
}

// タイルの feature → アプリ共通の MLITSearchResult に変換（クリック→柱状図表示用）。
function featureToResult(p: TileProps, lng: number, lat: number): MLITSearchResult {
  const isTokyo = p.source === 'tokyo';
  // NGIビューア由来のID(プロキシURL末尾)を抽出（BoringLogViewerのビューアリンク用）。
  const ngiId = (p.xml_url || p.log_url || '').match(/\/(\d+)$/)?.[1];
  return {
    id: p.id ?? `${lng},${lat}`,
    title: p.title ?? p.id ?? '',
    source: isTokyo ? ('tokyo' as const) : ('mlit' as const),
    metadata: {
      'NGI:link_boring_xml': p.xml_url,
      'NGI:link_boring_pdf': p.log_url,
      ...(ngiId ? { 'NGI:id': ngiId } : {}),
    },
    location: { lat, lng },
    datasetName: isTokyo ? '東京の地盤(GIS版)' : '国土地盤情報(NGI)',
  };
}

function buildStyle(): maplibregl.StyleSpecification {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
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
      points: {
        type: 'vector',
        url: `pmtiles://${origin}${PMTILES_URL}`,
      },
    },
    layers: [
      { id: 'gsi', type: 'raster', source: 'gsi' },
      {
        id: 'pts-heat',
        type: 'heatmap',
        source: 'points',
        'source-layer': POINTS_LAYER,
        maxzoom: 12,
        paint: {
          'heatmap-weight': 0.6,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 12, 1.4],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 6, 10, 12, 22],
          // 円レイヤが立ち上がる z10-12 でヒートマップをフェードアウト
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.85, 12, 0],
        },
      },
      {
        id: 'pts-circle',
        type: 'circle',
        source: 'points',
        'source-layer': POINTS_LAYER,
        minzoom: 10,
        paint: {
          'circle-color': ['match', ['get', 'source'], 'tokyo', TOKYO_COLOR, NGI_COLOR],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4.5, 17, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 0, 14, 1],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 13, 1],
        },
      },
      {
        id: 'pts-selected',
        type: 'circle',
        source: 'points',
        'source-layer': POINTS_LAYER,
        minzoom: 10,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': SELECTED_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 9],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      },
    ],
  };
}

const MapView: React.FC<MapViewProps> = ({
  center,
  selectedResult,
  onPickNearby,
  onResultSelect,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // 最新のコールバックを ref 経由で参照（map初期化は1回のみにするため）
  const cbRef = useRef({ onPickNearby, onResultSelect });
  cbRef.current = { onPickNearby, onResultSelect };

  // 初期化（マウント時1回）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // PMTiles プロトコルを登録（Range取得で表示範囲のタイルだけ読む）
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [center.lng, center.lat],
      zoom: 15,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      onResultSelectFromFeature(f.properties as TileProps, coords[0], coords[1]);
      // クリック周辺の地点群をリストへ
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - PICK_PX, e.point.y - PICK_PX],
        [e.point.x + PICK_PX, e.point.y + PICK_PX],
      ];
      const near = map.queryRenderedFeatures(box, { layers: ['pts-circle'] });
      const seen = new Set<string>();
      const list: MLITSearchResult[] = [];
      for (const nf of near) {
        const p = nf.properties as TileProps;
        const c = (nf.geometry as GeoJSON.Point).coordinates;
        const r = featureToResult(p, c[0], c[1]);
        const key = `${r.source}-${r.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(r);
      }
      cbRef.current.onPickNearby(list);
    };
    const onResultSelectFromFeature = (p: TileProps, lng: number, lat: number) => {
      cbRef.current.onResultSelect(featureToResult(p, lng, lat));
    };

    map.on('click', 'pts-circle', handleClick);
    map.on('mouseenter', 'pts-circle', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'pts-circle', () => {
      map.getCanvas().style.cursor = '';
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      maplibregl.removeProtocol('pmtiles');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 地名検索などで center が変わったら移動
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [center.lng, center.lat], zoom: Math.max(map.getZoom(), 15) });
  }, [center]);

  // 選択地点のハイライト（フィルタ更新）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('pts-selected')) return;
      map.setFilter('pts-selected', ['==', ['get', 'id'], selectedResult?.id ?? '']);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [selectedResult]);

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="h-full w-full rounded-lg" style={{ minHeight: '400px' }} />

      {/* ズーム別の見え方ヒント */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1] bg-gray-900/80 text-white text-xs px-3 py-1.5 rounded-full shadow pointer-events-none">
        広域=ヒートマップ表示。ズームインで個別地点（クリックで柱状図）
      </div>

      {/* 凡例 */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg text-xs z-[1]">
        <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">凡例</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 border border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">国土地盤(NGI)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500 border border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">東京の地盤(GIS版)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">選択中</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
