import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface LatLng {
  lat: number;
  lng: number;
}

interface SeaRatioMapProps {
  center: LatLng;
  radiusKm: number;
  onPick: (lat: number, lng: number) => void;
}

// 地図クリックで地点を更新する。
const ClickHandler: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
};

// 中心・半径が変わったら、海率計算円の全体が収まるよう表示範囲を合わせる（folium fit_bounds 相当）。
const FitToCircle: React.FC<{ center: LatLng; radiusKm: number }> = ({ center, radiusKm }) => {
  const map = useMap();
  useEffect(() => {
    const dLat = radiusKm / 110.574;
    const dLng = radiusKm / (111.32 * Math.max(Math.cos((center.lat * Math.PI) / 180), 1e-6));
    map.fitBounds(
      [
        [center.lat - dLat, center.lng - dLng],
        [center.lat + dLat, center.lng + dLng],
      ],
      { animate: false }
    );
  }, [map, center.lat, center.lng, radiusKm]);
  return null;
};

const SeaRatioMap: React.FC<SeaRatioMapProps> = ({ center, radiusKm, onPick }) => {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={11}
      scrollWheelZoom
      style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
        url="https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"
      />
      <Circle
        center={[center.lat, center.lng]}
        radius={radiusKm * 1000}
        pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 2 }}
      />
      <CircleMarker
        center={[center.lat, center.lng]}
        radius={6}
        pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
      />
      <ClickHandler onPick={onPick} />
      <FitToCircle center={center} radiusKm={radiusKm} />
    </MapContainer>
  );
};

export default SeaRatioMap;
