import React, { useState, useCallback } from 'react';
import { Info, AlertCircle } from 'lucide-react';
import MapView from './MapView';
import SearchPanel from './SearchPanel';
import ResultsList from './ResultsList';
import BoringLogViewer from './BoringLogViewer';
import {
  searchByLocation,
  generateMockSearchResults,
  generateMockBoringData,
  fetchAndParseBoringData,
} from './api';
import type {
  GeoLocation,
  SearchArea,
  MLITSearchResult,
  BoringData,
  SearchStatus,
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
  // 状態管理
  const [mapCenter, setMapCenter] = useState<GeoLocation>(DEFAULT_CENTER);
  const [searchArea, setSearchArea] = useState<SearchArea | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [searchResults, setSearchResults] = useState<MLITSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<MLITSearchResult | null>(null);
  const [boringData, setBoringData] = useState<BoringData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // デモモード（開発環境でのみ切り替え可能）
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 地図クリックハンドラー
  const handleMapClick = useCallback((location: GeoLocation) => {
    setSearchArea({
      center: location,
      radius: 1000,
    });
    setError(null);
  }, []);

  // 住所検索ハンドラー（Nominatim APIを使用）
  const handleLocationSearch = useCallback(async (address: string) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=jp&limit=1`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const location: GeoLocation = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
        setMapCenter(location);
        setSearchArea({
          center: location,
          radius: 1000,
        });
        onSuccess?.(`「${address}」に移動しました`);
      } else {
        onError?.('住所が見つかりませんでした');
      }
    } catch {
      onError?.('住所検索に失敗しました');
    }
  }, [onSuccess, onError]);

  // 検索半径更新ハンドラー
  const handleRadiusChange = useCallback((radius: number) => {
    setSearchArea(prev => prev ? { ...prev, radius } : null);
  }, []);

  // 検索実行ハンドラー
  const handleSearch = useCallback(async (area: SearchArea, keyword?: string) => {
    setSearchStatus('searching');
    setSearchResults([]);
    setSelectedResult(null);
    setBoringData(null);
    setError(null);

    try {
      let results: MLITSearchResult[];

      if (useDemoMode) {
        // デモモード: モックデータを使用
        await new Promise(resolve => setTimeout(resolve, 500)); // 擬似的な遅延
        results = generateMockSearchResults(area.center, 8);
      } else {
        // 本番モード: サーバーレス関数経由でMLIT APIを使用
        results = await searchByLocation(area, keyword, 50);
      }

      setSearchResults(results);
      setSearchStatus('success');

      if (results.length === 0) {
        onError?.('指定した範囲にボーリングデータが見つかりませんでした');
      } else {
        onSuccess?.(`${results.length}件のボーリングデータが見つかりました`);
      }
    } catch (err) {
      setSearchStatus('error');
      const errorMessage = err instanceof Error ? err.message : '検索に失敗しました';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [useDemoMode, onSuccess, onError]);

  // 結果選択ハンドラー
  const handleResultSelect = useCallback(async (result: MLITSearchResult) => {
    setSelectedResult(result);
    setLoadingDetail(true);

    try {
      if (useDemoMode && result.location) {
        // デモモード: モックデータを生成
        await new Promise(resolve => setTimeout(resolve, 300));
        const mockData = generateMockBoringData(result.id, result.location, result.title);
        setBoringData(mockData);
      } else {
        // 本番モード: metadataからXMLリンクを取得
        const xmlUrl = result.metadata?.['NGI:link_boring_xml'];

        if (xmlUrl && result.location) {
          try {
            const data = await fetchAndParseBoringData(xmlUrl, result.id, result.location);
            setBoringData(data);
          } catch (error) {
            console.error('Failed to fetch boring data:', error);
            onError?.('ボーリングデータの取得に失敗しました');
            setBoringData(null);
          }
        } else {
          onError?.('XMLリンクが見つかりません');
          setBoringData(null);
        }
      }
    } catch (err) {
      console.error('Detail loading error:', err);
      setBoringData(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [useDemoMode, onError]);

  // 詳細パネルを閉じる
  const handleCloseDetail = useCallback(() => {
    setSelectedResult(null);
    setBoringData(null);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              ボーリングデータ検索
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              地図上で地点を指定して周辺のボーリングデータを検索できます
            </p>
          </div>

          {/* デモモード切り替え（開発環境のみ表示） */}
          {import.meta.env.DEV && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={useDemoMode}
                  onChange={(e) => setUseDemoMode(e.target.checked)}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                デモモード
              </label>
              {useDemoMode ? (
                <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-700 dark:text-yellow-300">
                  <Info className="w-3 h-3" />
                  モックデータを使用中
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded text-xs text-green-700 dark:text-green-300">
                  <Info className="w-3 h-3" />
                  本番API接続中
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
          {/* 左サイドバー: 検索パネル + 結果リスト */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto">
            <SearchPanel
              searchArea={searchArea}
              searchStatus={searchStatus}
              onSearch={handleSearch}
              onLocationSearch={handleLocationSearch}
              onRadiusChange={handleRadiusChange}
            />

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <ResultsList
              results={searchResults}
              selectedResult={selectedResult}
              searchStatus={searchStatus}
              onResultSelect={handleResultSelect}
            />
          </div>

          {/* 中央: 地図 */}
          <div className="lg:col-span-1 h-[400px] lg:h-full">
            <MapView
              center={mapCenter}
              searchArea={searchArea}
              results={searchResults}
              selectedResult={selectedResult}
              onMapClick={handleMapClick}
              onResultSelect={handleResultSelect}
            />
          </div>

          {/* 右サイドバー: 詳細表示 */}
          <div className="lg:col-span-1 overflow-y-auto">
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
                  検索結果からボーリングデータを選択すると
                  <br />
                  柱状図が表示されます
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* フッター: API情報 */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 px-4 py-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          データ提供:
          <a
            href="https://www.mlit-data.jp/"
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
        </p>
      </div>
    </div>
  );
};

export default BoringDataApp;
