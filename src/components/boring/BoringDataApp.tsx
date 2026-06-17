import React, { useState, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import MapView from './MapView';
import SearchPanel from './SearchPanel';
import ResultsList from './ResultsList';
import BoringLogViewer from './BoringLogViewer';
import {
  searchAllSourcesInBounds,
  searchTokyoDensity,
  searchMLITWithinBounds,
  fetchAndParseBoringData,
  type MapBounds,
  type DensityCell,
} from './api';
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

// ビューポート連動描画のパラメータ
const MIN_ZOOM = 14; // これ以上で個別マーカー、未満は密度タイル表示
const TOKYO_LIMIT = 2000; // 1ビューポートあたりの東京データ描画上限（超過はサンプリング）
const MLIT_SIZE = 500; // MLITの取得上限
const DEBOUNCE_MS = 400; // 地図操作のデバウンス

// ズーム→密度メッシュのセル一辺（度）。粗めにして描画/集計を軽量化。
function cellForZoom(zoom: number): number {
  const z = Math.max(7, Math.min(13, Math.round(zoom)));
  return 0.02 * Math.pow(2, 13 - z); // z13=0.02° ... z7=1.28°（従来比4倍粗い）
}

interface BoringDataAppProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

interface ViewportInfo {
  mlitCount: number;
  tokyoTotal: number;
  tokyoTruncated: boolean;
  shown: number;
}

const BoringDataApp: React.FC<BoringDataAppProps> = ({ onSuccess, onError }) => {
  const [mapCenter, setMapCenter] = useState<GeoLocation>(DEFAULT_CENTER);
  // 表示範囲内にプロットする全地点（地図用）
  const [plotted, setPlotted] = useState<MLITSearchResult[]>([]);
  // クリック近接でリストに出す部分集合（リスト用）
  const [listed, setListed] = useState<MLITSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<MLITSearchResult | null>(null);
  const [boringData, setBoringData] = useState<BoringData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [belowMinZoom, setBelowMinZoom] = useState(false);
  const [plotting, setPlotting] = useState(false);
  const [viewportInfo, setViewportInfo] = useState<ViewportInfo | null>(null);
  // 密度タイル（ズーム閾値未満）。データがある区画を一律色で塗る存在表示（東京＋MLIT）
  const [densityCells, setDensityCells] = useState<DensityCell[]>([]);
  const [densityCell, setDensityCell] = useState(0.01);

  // デバウンスと、古いレスポンスの破棄用
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  // 地図の表示範囲が変わるたびに、範囲内の地点をリアルタイム取得してプロット
  const handleViewportChange = useCallback(
    (bounds: MapBounds, zoom: number) => {
      const below = zoom < MIN_ZOOM;
      setBelowMinZoom(below);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        const reqId = ++reqIdRef.current;
        setPlotting(true);
        setError(null);

        if (below) {
          // ズーム閾値未満: 個別マーカーの代わりに「データの有無」を示す密度タイル。
          // 東京=サーバ側メッシュ集計(/density)、MLIT=bbox取得をフロントで同メッシュに振り分け。
          // 件数は問わず、いずれかにデータがある区画を一律色で塗る（存在表示）。
          const cell = cellForZoom(zoom);
          const [denS, mlitS] = await Promise.allSettled([
            searchTokyoDensity(bounds, cell),
            searchMLITWithinBounds(bounds, 600),
          ]);
          if (reqId !== reqIdRef.current) return;

          const cellMap = new Map<string, DensityCell>();
          if (denS.status === 'fulfilled') {
            for (const c of denS.value.cells) cellMap.set(`${c.gy}:${c.gx}`, { gy: c.gy, gx: c.gx });
          }
          if (mlitS.status === 'fulfilled') {
            for (const r of mlitS.value) {
              if (!r.location) continue;
              const gy = Math.floor(r.location.lat / cell);
              const gx = Math.floor(r.location.lng / cell);
              cellMap.set(`${gy}:${gx}`, { gy, gx });
            }
          }

          setPlotted([]);
          setViewportInfo(null);
          setDensityCell(cell);
          setDensityCells([...cellMap.values()]);
          if (denS.status === 'rejected' && mlitS.status === 'rejected') {
            onError?.('密度データの取得に失敗しました');
          }
          setPlotting(false);
          return;
        }

        // ズーム閾値以上: 範囲内の個別地点を取得して描画
        try {
          const res = await searchAllSourcesInBounds(bounds, {
            tokyoLimit: TOKYO_LIMIT,
            mlitSize: MLIT_SIZE,
          });
          if (reqId !== reqIdRef.current) return;

          setDensityCells([]);
          setPlotted(res.results);
          setViewportInfo({
            mlitCount: res.mlitCount,
            tokyoTotal: res.tokyoTotal,
            tokyoTruncated: res.tokyoTruncated,
            shown: res.results.length,
          });
          if (res.errors.length > 0) {
            onError?.(`一部ソースの取得に失敗（${res.errors.join(' / ')}）`);
          }
        } catch (err) {
          if (reqId !== reqIdRef.current) return;
          const msg = err instanceof Error ? err.message : 'データ取得に失敗しました';
          setError(msg);
          onError?.(msg);
        } finally {
          if (reqId === reqIdRef.current) setPlotting(false);
        }
      }, DEBOUNCE_MS);
    },
    [onError]
  );

  // クリック近接の地点群をリスト表示（地図側でピクセル距離フィルタ済み）
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

  // 地図内に薄く重ねる件数表示（マーカー表示時のみ）
  const mapStatus = belowMinZoom
    ? ''
    : plotting
    ? '取得中…'
    : viewportInfo
    ? `表示中 ${viewportInfo.shown}件（国土地盤 ${viewportInfo.mlitCount} / 東京 ${viewportInfo.tokyoTotal}${
        viewportInfo.tokyoTruncated ? '→間引き' : ''
      }）`
    : '';

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            ボーリングデータ検索
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            地図を動かすと表示範囲内のボーリングデータが自動表示されます。地点をクリックすると近接データが左の一覧に出ます。
          </p>
        </div>
      </div>

      {/* メインコンテンツ。min-h-0 で中身に依存せず高さを安定させる（地図が一定全高） */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 lg:min-h-0">
          {/* 左サイドバー: 操作パネル + 近接リスト */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto lg:min-h-0">
            <SearchPanel onLocationSearch={handleLocationSearch} />

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

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
              results={plotted}
              selectedResult={selectedResult}
              belowMinZoom={belowMinZoom}
              densityCells={densityCells}
              densityCell={densityCell}
              mapStatus={mapStatus}
              onViewportChange={handleViewportChange}
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
