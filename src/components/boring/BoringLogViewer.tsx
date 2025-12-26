import React from 'react';
import { X, Download, FileText, Droplet, Calendar, Building2 } from 'lucide-react';
import type { BoringData, MLITSearchResult } from './types';

interface BoringLogViewerProps {
  data: BoringData | null;
  selectedResult: MLITSearchResult | null;
  loading: boolean;
  onClose: () => void;
}

const BoringLogViewer: React.FC<BoringLogViewerProps> = ({
  data,
  selectedResult,
  loading,
  onClose,
}) => {
  if (!selectedResult) {
    return null;
  }

  // N値の最大値を計算（グラフスケール用）
  const maxNValue = data?.standardPenetrationTests
    ? Math.max(...data.standardPenetrationTests.map(t => t.nValue), 50)
    : 50;

  // 深度スケール（10mごとの目盛り）
  const maxDepth = data?.depth || 20;
  const depthScale = Math.ceil(maxDepth / 10) * 10;
  const depthTicks = Array.from({ length: depthScale / 5 + 1 }, (_, i) => i * 5);

  // PDFリソースを取得
  const pdfResources = selectedResult.resources?.filter(
    r => r.format.toUpperCase() === 'PDF'
  ) || [];

  // XMLリソースを取得
  const xmlResources = selectedResult.resources?.filter(
    r => r.format.toUpperCase() === 'XML'
  ) || [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {data?.title || selectedResult.title}
          </h3>
          {selectedResult.datasetName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {selectedResult.datasetName}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        >
          <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* ローディング */}
      {loading && (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-3 text-gray-600 dark:text-gray-400">データを読み込み中...</p>
        </div>
      )}

      {/* データ表示 */}
      {!loading && data && (
        <div className="p-4 space-y-4">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {data.date && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Calendar className="w-4 h-4" />
                <span>調査日: {data.date}</span>
              </div>
            )}
            {data.organization && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Building2 className="w-4 h-4" />
                <span>{data.organization}</span>
              </div>
            )}
            {data.waterLevel !== undefined && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Droplet className="w-4 h-4 text-blue-500" />
                <span>地下水位: {data.waterLevel.toFixed(1)}m</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <FileText className="w-4 h-4" />
              <span>掘削深度: {data.depth.toFixed(1)}m</span>
            </div>
          </div>

          {/* 柱状図 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              ボーリング柱状図
            </div>
            <div className="p-4 overflow-x-auto">
              <div className="flex min-w-[500px]" style={{ height: `${depthScale * 15 + 60}px` }}>
                {/* 深度スケール */}
                <div className="w-12 flex-shrink-0 relative border-r border-gray-300 dark:border-gray-600">
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">深度(m)</div>
                  {depthTicks.map((depth) => (
                    <div
                      key={depth}
                      className="absolute left-0 right-0 text-xs text-gray-500 dark:text-gray-400 text-right pr-2"
                      style={{ top: `${depth * 15 + 30}px` }}
                    >
                      {depth}
                      <div className="absolute right-0 w-2 border-t border-gray-300 dark:border-gray-600"></div>
                    </div>
                  ))}
                </div>

                {/* 土質柱状図 */}
                <div className="w-24 flex-shrink-0 relative border-r border-gray-300 dark:border-gray-600">
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">土質</div>
                  <div className="relative" style={{ marginTop: '30px' }}>
                    {data.layers.map((layer) => (
                      <div
                        key={layer.id}
                        className="absolute left-0 right-0 border border-gray-400 dark:border-gray-500 flex items-center justify-center text-xs text-white font-medium overflow-hidden"
                        style={{
                          top: `${layer.topDepth * 15}px`,
                          height: `${(layer.bottomDepth - layer.topDepth) * 15}px`,
                          backgroundColor: layer.color,
                          minHeight: '20px',
                        }}
                        title={`${layer.soilName} (${layer.topDepth}m〜${layer.bottomDepth}m)`}
                      >
                        <span className="truncate px-1 text-shadow">
                          {layer.soilName.length > 6 ? layer.soilName.slice(0, 6) + '...' : layer.soilName}
                        </span>
                      </div>
                    ))}
                    {/* 地下水位線 */}
                    {data.waterLevel !== undefined && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-blue-500 border-dashed"
                        style={{ top: `${data.waterLevel * 15}px` }}
                      >
                        <span className="absolute -top-3 -right-1 text-xs text-blue-500">▼</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* N値グラフ */}
                <div className="flex-1 relative min-w-[200px]">
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">N値</div>
                  {/* N値スケール */}
                  <div className="absolute top-6 left-0 right-0 flex justify-between text-xs text-gray-400 dark:text-gray-500 px-1">
                    <span>0</span>
                    <span>{Math.round(maxNValue / 2)}</span>
                    <span>{maxNValue}</span>
                  </div>
                  {/* グリッド線 */}
                  <div className="absolute left-0 right-0 border-l border-gray-200 dark:border-gray-600" style={{ top: '30px', height: `${depthScale * 15}px` }}></div>
                  <div className="absolute left-1/2 top-0 bottom-0 border-l border-gray-200 dark:border-gray-600 border-dashed" style={{ top: '30px', height: `${depthScale * 15}px` }}></div>
                  <div className="absolute right-0 top-0 bottom-0 border-l border-gray-200 dark:border-gray-600" style={{ top: '30px', height: `${depthScale * 15}px` }}></div>

                  {/* N値プロット */}
                  <svg
                    className="absolute left-0 right-0"
                    style={{ top: '30px', height: `${depthScale * 15}px` }}
                    viewBox={`0 0 100 ${depthScale * 15}`}
                    preserveAspectRatio="none"
                  >
                    {/* N値の折れ線 */}
                    <polyline
                      points={data.standardPenetrationTests?.map((test) => {
                        const x = (test.nValue / maxNValue) * 100;
                        const y = test.depth * 15;
                        return `${x},${y}`;
                      }).join(' ') || ''}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2"
                    />
                    {/* データポイント */}
                    {data.standardPenetrationTests?.map((test, i) => (
                      <circle
                        key={i}
                        cx={(test.nValue / maxNValue) * 100}
                        cy={test.depth * 15}
                        r="4"
                        fill="#ef4444"
                      />
                    ))}
                  </svg>

                  {/* N値のツールチップ */}
                  {data.standardPenetrationTests?.map((test, i) => (
                    <div
                      key={i}
                      className="absolute w-6 h-6 -ml-3 cursor-pointer group"
                      style={{
                        left: `${(test.nValue / maxNValue) * 100}%`,
                        top: `${test.depth * 15 + 30 - 12}px`,
                      }}
                    >
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10">
                        深度: {test.depth}m, N値: {test.nValue}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 土層一覧 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              土層一覧
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">深度(m)</th>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">土質区分</th>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-300">土質名</th>
                    <th className="px-4 py-2 text-center text-gray-600 dark:text-gray-300">N値</th>
                  </tr>
                </thead>
                <tbody>
                  {data.layers.map((layer) => (
                    <tr key={layer.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
                        {layer.topDepth.toFixed(1)} - {layer.bottomDepth.toFixed(1)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: layer.color }}
                          ></div>
                          <span className="text-gray-700 dark:text-gray-300">{layer.soilType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{layer.soilName}</td>
                      <td className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">
                        {layer.nValue !== undefined ? layer.nValue : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ダウンロードリンク */}
          {(pdfResources.length > 0 || xmlResources.length > 0) && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                ダウンロード
              </div>
              <div className="p-4 space-y-2">
                {pdfResources.map((resource) => (
                  <a
                    key={resource.id}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <Download className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span className="text-red-700 dark:text-red-300 flex-1">{resource.name}</span>
                    <span className="text-xs text-red-500 dark:text-red-400">PDF</span>
                  </a>
                ))}
                {xmlResources.map((resource) => (
                  <a
                    key={resource.id}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-green-700 dark:text-green-300 flex-1">{resource.name}</span>
                    <span className="text-xs text-green-500 dark:text-green-400">XML</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* データなし（選択のみ） */}
      {!loading && !data && (
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {selectedResult.description || 'データの詳細情報がありません'}
          </p>

          {/* ダウンロードリンク */}
          {(pdfResources.length > 0 || xmlResources.length > 0) && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                ダウンロード
              </div>
              <div className="p-4 space-y-2">
                {pdfResources.map((resource) => (
                  <a
                    key={resource.id}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <Download className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span className="text-red-700 dark:text-red-300 flex-1">{resource.name}</span>
                    <span className="text-xs text-red-500 dark:text-red-400">PDF</span>
                  </a>
                ))}
                {xmlResources.map((resource) => (
                  <a
                    key={resource.id}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-green-700 dark:text-green-300 flex-1">{resource.name}</span>
                    <span className="text-xs text-green-500 dark:text-green-400">XML</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BoringLogViewer;
