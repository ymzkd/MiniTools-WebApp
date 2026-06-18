import React, { useState, useCallback } from 'react';
import MapView from './MapView';
import SearchPanel from './SearchPanel';
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
  // クリック近接でリストに出す部分集合（リスト用）
  const [listed, setListed] = useState<MLITSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<MLITSearchResult | null>(null);
  const [boringData, setBoringData] = useState<BoringData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // クリック近接の地点群をリスト表示（地図側=タイルの描画地点から近接抽出）
  const handlePickNearby = useCallback((points: MLITSearchResult[]) => {
    setListed(points);
  }, []);

  // 地名検索 → 地図を移動（Nominatim）
  const handleLocationSearch = useCallback(
    async (address: string) => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            address
          )}&countrycodes=jp&limit=1`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          setMapCenter({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          onSuccess?.(`「${address}」に移動しました`);
        } else {
          onError?.('住所が見つかりませんでした');
        }
      } catch {
        onError?.('住所検索に失敗しました');
      }
    },
    [onSuccess, onError]
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

      {/* メインコンテンツ。min-h-0 で中身に依存せず高さを安定させる（地図が一定全高） */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:min-h-0">
          {/* 左サイドバー: 操作パネル + 近接リスト */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto lg:min-h-0">
            <SearchPanel onLocationSearch={handleLocationSearch} />

            <ResultsList
              results={listed}
              selectedResult={selectedResult}
              searchStatus={listed.length > 0 ? 'success' : 'idle'}
              onResultSelect={handleResultSelect}
            />
          </div>

          {/* 中央: 地図（常にコンテンツ領域の全高・中身非依存で固定） */}
          <div className="lg:col-span-1 h-[400px] lg:h-full lg:min-h-0">
            <MapView
              center={mapCenter}
              selectedResult={selectedResult}
              onPickNearby={handlePickNearby}
              onResultSelect={handleResultSelect}
            />
          </div>

          {/* 右サイドバー: 詳細表示 */}
          <div className="lg:col-span-1 overflow-y-auto lg:min-h-0">
            {selectedResult ? (
              <BoringLogViewer
                data={boringData}
                selectedResult={selectedResult}
                loading={loadingDetail}
                onClose={handleCloseDetail}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                <div className="text-gray-400 dark:text-gray-500 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400">
                  地点をクリックして一覧から選ぶと
                  <br />
                  柱状図が表示されます
                </p>
              </div>
            )}
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
