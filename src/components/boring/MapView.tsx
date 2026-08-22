import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import type { GeoLocation, MLITSearchResult } from './types';
// タイルURL・色・feature変換は Hazard Map と共有（pointsTiles.ts に集約）。
// 低ズーム=ヒートマップ(密度)、中〜高ズーム=ソース色分けの円。クリックで個別地点を選択。
// 地点データの取得はタイル側に寄せたので、ビューポート連動のAPI取得は行わない。
import {
  PICK_PX,
  TOKYO_COLOR,
  NGI_COLOR,
  NGI_ONLY_COLOR,
  SELECTED_COLOR,
  PMTILES_URL,
  POINTS_LAYER,
  featureToResult,
} from './pointsTiles';
import type { TileProps } from './pointsTiles';

interface MapViewProps {
  center: GeoLocation;
  selectedResult: MLITSearchResult | null;
  onPickNearby: (points: MLITSearchResult[]) => void;
  onResultSelect: (result: MLITSearchResult) => void;
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
      // 未読込領域(高速パン/ズーム時)が暗く見えないよう、最下層を明色で塗る。
      // 地理院淡色地図の地色に近い明るいグレーにして、タイル読込中も馴染ませる。
      { id: 'bg', type: 'background', paint: { 'background-color': '#eceae4' } },
      { id: 'gsi', type: 'raster', source: 'gsi' },
      {
        id: 'pts-heat',
        type: 'heatmap',
        source: 'points',
        'source-layer': POINTS_LAYER,
        maxzoom: 12,
        paint: {
          'heatmap-weight': 0.8,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1.0, 6, 1.1, 12, 1.5],
          // 広域でも孤立した地点が見えるよう、低ズームで半径を大きめに取る。
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 7, 4, 10, 8, 16, 12, 26],
          // 低密度(=まばらにデータがある所)にも色の下限を置き、「データがある」ことが分かるようにする。
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.04, 'rgba(33,102,172,0.55)',
            0.25, 'rgba(103,169,207,0.7)',
            0.5, 'rgba(253,184,99,0.85)',
            0.8, 'rgba(239,138,98,0.9)',
            1, 'rgba(178,24,43,0.95)',
          ],
          // 円レイヤが立ち上がる z10-12 でヒートマップをフェードアウト
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 12, 0],
        },
      },
      {
        // 全ズームで表示する点レイヤ。広域でもヒートマップに埋もれず「データがある」ことを
        // 小さなドットで確実に示す(ヒートマップは密度の濃淡用に併存)。
        id: 'pts-circle',
        type: 'circle',
        source: 'points',
        'source-layer': POINTS_LAYER,
        minzoom: 0,
        paint: {
          // KuniJiban 掲載分は直リンクで軽く開けるが、NGICのみの分は中継プロキシ経由で
          // 公開元のレート制限を受け、表示までに時間がかかることがある。体感が違うので色を分ける。
          'circle-color': [
            'case',
            ['==', ['get', 'source'], 'tokyo'], TOKYO_COLOR,
            ['==', ['get', 'kj'], 0], NGI_ONLY_COLOR,
            NGI_COLOR,
          ],
          // 地図に埋もれず目立つよう、各ズームで一回り大きめの半径にする。
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 5, 11, 6, 14, 7.5, 17, 10],
          'circle-stroke-color': '#ffffff',
          // 全ズームで白枠を付けて地図背景とのコントラストを高め、視認性を上げる。
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 1.2, 14, 1.8],
          'circle-opacity': 1,
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
      // 2次元の情報しか扱わないため、地図の3次元操作(回転・傾き)は無効化する
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    // ドラッグ/タッチ/キーボードによる回転も明示的に無効化（2D固定）
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // ホイール1ノッチあたりのズーム量を大きくする（既定は細かく、何度もスクロールが必要なため）。
    map.scrollZoom.setWheelZoomRate(1 / 120); // 既定 1/450 → 約3.7倍速
    map.scrollZoom.setZoomRate(1 / 60); // トラックパッド/ピンチも速める

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
      <div
        ref={containerRef}
        className="h-full w-full rounded-lg"
        style={{ minHeight: '400px', backgroundColor: '#eceae4' }}
      />

      {/* ズーム別の見え方ヒント */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1] bg-gray-900/80 text-white text-xs px-3 py-1.5 rounded-full shadow pointer-events-none">
        広域=ヒートマップ表示。ズームインで個別地点（クリックで柱状図）
      </div>

      {/* 凡例 */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg text-xs z-[1]">
        <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">凡例</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-400 border border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">国土地盤(KuniJiban掲載)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-400 border border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">国土地盤(NGICのみ・表示が遅い)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-fuchsia-400 border border-white shadow"></div>
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
