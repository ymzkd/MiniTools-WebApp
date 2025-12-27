import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoLocation, MLITSearchResult, SearchArea } from './types';

// デフォルトマーカーアイコンの修正（Leafletのwebpack問題対策）
// CDNからアイコンを読み込む
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ボーリング地点用カスタムアイコン
const boringIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="#ef4444" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="#fff"/>
    </svg>
  `),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

// 選択中のボーリング地点用アイコン
const selectedBoringIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <circle cx="16" cy="16" r="14" fill="#3b82f6" stroke="#fff" stroke-width="3"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

// クリック地点用アイコン
const clickIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#22c55e" stroke="#fff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="#fff"/>
    </svg>
  `),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
});

interface MapViewProps {
  center: GeoLocation;
  searchArea: SearchArea | null;
  results: MLITSearchResult[];
  selectedResult: MLITSearchResult | null;
  onMapClick: (location: GeoLocation) => void;
  onResultSelect: (result: MLITSearchResult) => void;
}

// 地図クリックイベントハンドラー
function MapClickHandler({ onMapClick }: { onMapClick: (location: GeoLocation) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// 地図中心移動ハンドラー
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
    // ResizeObserverで地図コンテナのサイズ変更を監視
    const container = map.getContainer();

    const resizeObserver = new ResizeObserver(() => {
      // サイズ変更を検出したら地図を更新
      map.invalidateSize();
    });

    resizeObserver.observe(container);

    // クリーンアップ
    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);

  return null;
}

const MapView: React.FC<MapViewProps> = ({
  center,
  searchArea,
  results,
  selectedResult,
  onMapClick,
  onResultSelect,
}) => {
  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        className="h-full w-full rounded-lg"
        style={{ minHeight: '400px' }}
      >
        {/* 地理院タイル（日本地図に最適） */}
        <TileLayer
          attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
        />

        {/* 地図クリックハンドラー */}
        <MapClickHandler onMapClick={onMapClick} />

        {/* 中心位置追従 */}
        <MapCenterHandler center={center} />

        {/* 地図サイズ自動更新 */}
        <MapResizeHandler />

        {/* 検索範囲の円 */}
        {searchArea && (
          <Circle
            center={[searchArea.center.lat, searchArea.center.lng]}
            radius={searchArea.radius}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }}
          />
        )}

        {/* クリック地点のマーカー */}
        {searchArea && (
          <Marker
            position={[searchArea.center.lat, searchArea.center.lng]}
            icon={clickIcon}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium">検索中心地点</p>
                <p>緯度: {searchArea.center.lat.toFixed(6)}</p>
                <p>経度: {searchArea.center.lng.toFixed(6)}</p>
                <p>検索半径: {searchArea.radius}m</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 検索結果のマーカー */}
        {results.map((result) => {
          if (!result.location) return null;
          const isSelected = selectedResult?.id === result.id;

          return (
            <Marker
              key={result.id}
              position={[result.location.lat, result.location.lng]}
              icon={isSelected ? selectedBoringIcon : boringIcon}
              eventHandlers={{
                click: () => onResultSelect(result),
              }}
            >
              <Popup>
                <div className="text-sm min-w-[200px]">
                  <p className="font-medium text-gray-900">{result.title}</p>
                  {result.description && (
                    <p className="text-gray-600 mt-1">{result.description}</p>
                  )}
                  {result.datasetName && (
                    <p className="text-gray-500 text-xs mt-1">
                      データセット: {result.datasetName}
                    </p>
                  )}
                  <button
                    onClick={() => onResultSelect(result)}
                    className="mt-2 w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                  >
                    詳細を表示
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 凡例 */}
      <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg text-xs z-[1000]">
        <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">凡例</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">検索地点</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 border border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">ボーリング地点</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow"></div>
            <span className="text-gray-700 dark:text-gray-300">選択中</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
