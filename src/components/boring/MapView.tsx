import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoLocation, MLITSearchResult } from './types';
import type { MapBounds } from './api';

// 近接判定のピクセル閾値（マーカーが重なって見える程度の範囲）
const PICK_PX = 16;
const TOKYO_COLOR = '#f59e0b';
const MLIT_COLOR = '#ef4444';
const SELECTED_COLOR = '#2563eb';

function resultKey(r: MLITSearchResult): string {
  return `${r.source ?? 'mlit'}-${r.id}`;
}

interface MapViewProps {
  center: GeoLocation;
  results: MLITSearchResult[]; // 表示範囲内にプロットする全地点
  selectedResult: MLITSearchResult | null;
  belowMinZoom: boolean; // 自動描画の閾値を下回っているか（ヒント表示用）
  onViewportChange: (bounds: MapBounds, zoom: number) => void;
  onPickNearby: (points: MLITSearchResult[]) => void;
  onResultSelect: (result: MLITSearchResult) => void;
}

function toBounds(map: L.Map): MapBounds {
  const b = map.getBounds();
  return {
    minLat: b.getSouth(),
    maxLat: b.getNorth(),
    minLng: b.getWest(),
    maxLng: b.getEast(),
  };
}

// 地図移動/ズーム終了でビューポートを通知。初回マウント時も1回通知。
function ViewportWatcher({
  onViewportChange,
}: {
  onViewportChange: (bounds: MapBounds, zoom: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onViewportChange(toBounds(map), map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useMapEvents({
    moveend: () => onViewportChange(toBounds(map), map.getZoom()),
    zoomend: () => onViewportChange(toBounds(map), map.getZoom()),
  });
  return null;
}

// 空白部分のクリックで、近接する地点群をリストへ
function ClickPicker({
  results,
  onPickNearby,
}: {
  results: MLITSearchResult[];
  onPickNearby: (points: MLITSearchResult[]) => void;
}) {
  const map = useMapEvents({
    click: (e) => {
      const cp = map.latLngToContainerPoint(e.latlng);
      const near = results.filter((r) => {
        if (!r.location) return false;
        const p = map.latLngToContainerPoint([r.location.lat, r.location.lng]);
        return p.distanceTo(cp) <= PICK_PX;
      });
      onPickNearby(near);
    },
  });
  return null;
}

// CircleMarker（canvas描画）で大量点を軽量に描画
function Markers({
  results,
  selectedResult,
  onPickNearby,
  onResultSelect,
}: {
  results: MLITSearchResult[];
  selectedResult: MLITSearchResult | null;
  onPickNearby: (points: MLITSearchResult[]) => void;
  onResultSelect: (result: MLITSearchResult) => void;
}) {
  const map = useMap();

  const pickAround = (loc: GeoLocation) => {
    const cp = map.latLngToContainerPoint([loc.lat, loc.lng]);
    const near = results.filter((r) => {
      if (!r.location) return false;
      const p = map.latLngToContainerPoint([r.location.lat, r.location.lng]);
      return p.distanceTo(cp) <= PICK_PX;
    });
    onPickNearby(near);
  };

  return (
    <>
      {results.map((r) => {
        if (!r.location) return null;
        const selected = selectedResult?.id === r.id && selectedResult?.source === r.source;
        const fill = r.source === 'tokyo' ? TOKYO_COLOR : MLIT_COLOR;
        return (
          <CircleMarker
            key={resultKey(r)}
            center={[r.location.lat, r.location.lng]}
            radius={selected ? 7 : 5}
            pathOptions={{
              color: selected ? SELECTED_COLOR : '#ffffff',
              weight: selected ? 3 : 1,
              fillColor: fill,
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () => {
                onResultSelect(r);
                if (r.location) pickAround(r.location);
              },
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium text-gray-900">{r.title}</p>
                <span
                  className={`inline-block mt-1 px-1.5 py-0.5 rounded text-xs text-white ${
                    r.source === 'tokyo' ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                >
                  {r.source === 'tokyo' ? '東京の地盤(GIS版)' : '国土地盤'}
                </span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

// 地図中心移動ハンドラー（地名ジャンプ）
function MapCenterHandler({ center }: { center: GeoLocation }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

// 地図サイズ更新ハンドラー
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

const MapView: React.FC<MapViewProps> = ({
  center,
  results,
  selectedResult,
  belowMinZoom,
  onViewportChange,
  onPickNearby,
  onResultSelect,
}) => {
  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        preferCanvas={true} // 大量マーカーをcanvasで軽量描画
        className="h-full w-full rounded-lg"
        style={{ minHeight: '400px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
        />

        <ViewportWatcher onViewportChange={onViewportChange} />
        <ClickPicker results={results} onPickNearby={onPickNearby} />
        <MapCenterHandler center={center} />
        <MapResizeHandler />
        <Markers
          results={results}
          selectedResult={selectedResult}
          onPickNearby={onPickNearby}
          onResultSelect={onResultSelect}
        />
      </MapContainer>

      {/* ズーム不足時のヒント */}
      {belowMinZoom && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/80 text-white text-xs px-3 py-1.5 rounded-full shadow">
          ズームインすると地点が表示されます
        </div>
      )}

      {/* 凡例 */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg text-xs z-[1000]">
        <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">凡例</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 border border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">国土地盤(KuniJiban)</span>
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
