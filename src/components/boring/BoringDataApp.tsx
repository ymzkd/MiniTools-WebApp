import React, { useState, useCallback } from 'react';
import { Search, MapPin } from 'lucide-react';
import MapView from './MapView';
import ResultsList from './ResultsList';
import BoringLogViewer from './BoringLogViewer';
import { fetchAndParseBoringData } from './api';
import type {
  GeoLocation,
  MLITSearchResult,
  BoringData,
} from './types';

// 東京駅をデフォルトの中心に設定
const DEFAULT_CENTER: GeoLocation = {
  lat: 35.6812,
  lng: 139.7671,
};

interface BoringDataAppProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const BoringDataApp: React.FC<BoringDataAppProps> = ({ onSuccess, onError }) => {
  const [mapCenter, setMapCenter] = useState<GeoLocation>(DEFAULT_CENTER);
  // 検索ボックス（住所・地名 または 緯度,経度）
  const [query, setQuery] = useState('');
  // クリック近接でリストに出す部分集合（リスト用）
  const [listed, setListed] = useState<MLITSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<MLITSearchResult | null>(null);
  const [boringData, setBoringData] = useState<BoringData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // クリック近接の地点群をリスト表示（地図側=タイルの描画地点から近接抽出）
  const handlePickNearby = useCallback((points: MLITSearchResult[]) => {
    setListed(points);
  }, []);

  // 検索：カンマ区切りの「緯度,経度」ならそこへ移動、そうでなければ住所・地名でジオコーディング。
  // （Hazard Map の検索仕様に合わせる）
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          setMapCenter({ lat, lng });
          onSuccess?.(`緯度 ${lat}, 経度 ${lng} に移動しました`);
        } else {
          onError?.('緯度は±90、経度は±180の範囲で入力してください');
        }
        return;
      }
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            q
          )}&countrycodes=jp&limit=1`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          setMapCenter({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          onSuccess?.(`「${q}」に移動しました`);
        } else {
          onError?.('住所が見つかりませんでした');
        }
      } catch {
        onError?.('住所検索に失敗しました');
      }
    },
    [query, onSuccess, onError]
  );

  // 結果選択 → 詳細（柱状図）取得
  const handleResultSelect = useCallback(
    async (result: MLITSearchResult) => {
      setSelectedResult(result);
      setLoadingDetail(true);
      try {
        const xmlUrl = result.metadata?.['NGI:link_boring_xml'];
        if (xmlUrl && result.location) {
          try {
            const data = await fetchAndParseBoringData(xmlUrl, result.id, result.location);
            setBoringData(data);
          } catch (e) {
            console.error('Failed to fetch boring data:', e);
            onError?.('ボーリングデータの取得に失敗しました');
            setBoringData(null);
          }
        } else {
          onError?.('XMLリンクが見つかりません');
          setBoringData(null);
        }
      } finally {
        setLoadingDetail(false);
      }
    },
    [onError]
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedResult(null);
    setBoringData(null);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            ボーリングデータ検索
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            広域では密度ヒートマップ、ズームインで個別地点を表示します。地点をクリックすると柱状図が表示され、近接データが左の一覧に出ます。
          </p>
        </div>
      </div>

      {/* メインコンテンツ。Hazard Map と同様、情報は左パネルに集約し地図を広く取る。 */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:min-h-0">
          {/* 左パネル: 検索 + 一覧 / 選択中の柱状図詳細 */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto lg:min-h-0">
            {/* 検索（住所・地名 または 緯度,経度） */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="住所・地名 または 緯度,経度（例: 35.681,139.767）"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors inline-flex items-center gap-1"
              >
                <Search className="w-4 h-4" />
                検索
              </button>
            </form>

            {selectedResult ? (
              <BoringLogViewer
                data={boringData}
                selectedResult={selectedResult}
                loading={loadingDetail}
                onClose={handleCloseDetail}
              />
            ) : (
              <ResultsList
                results={listed}
                selectedResult={selectedResult}
                searchStatus={listed.length > 0 ? 'success' : 'idle'}
                onResultSelect={handleResultSelect}
              />
            )}
          </div>

          {/* 右: 地図（広く） */}
          <div className="lg:col-span-2 h-[400px] lg:h-full lg:min-h-0">
            <MapView
              center={mapCenter}
              selectedResult={selectedResult}
              onPickNearby={handlePickNearby}
              onResultSelect={handleResultSelect}
            />
          </div>
        </div>
      </div>

      {/* フッター: データ提供 */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 px-4 py-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          データ提供:
          <a
            href="https://data-platform.mlit.go.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline ml-1"
          >
            国土交通データプラットフォーム
          </a>
          {' / '}
          <a
            href="https://www.kunijiban.pwri.go.jp/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            国土地盤情報検索サイト (KuniJiban)
          </a>
          {' / '}
          <a
            href="https://www.kensetsu.metro.tokyo.lg.jp/jimusho/tech/geo-web"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            東京の地盤(GIS版)
          </a>
          <span className="ml-1">（東京都建設局 / CC BY 2.1 JP）</span>
        </p>
      </div>
    </div>
  );
};

export default BoringDataApp;
