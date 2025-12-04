import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, Play, Pause, RotateCcw, AlertCircle } from 'lucide-react';
import type { AccelerometerData } from '../../types';

const AccelerometerTool: React.FC = () => {
  const [isSupported, setIsSupported] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [hasPermission, setHasPermission] = useState(true);
  const [data, setData] = useState<AccelerometerData | null>(null);
  const [history, setHistory] = useState<AccelerometerData[]>([]);
  const [maxHistorySize] = useState(100);

  // デバイスの向きをチェック
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.DeviceMotionEvent) {
      setIsSupported(false);
    }
  }, []);

  // パーミッションリクエスト（iOS 13+）
  const requestPermission = useCallback(async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        setHasPermission(permission === 'granted');
        return permission === 'granted';
      } catch (error) {
        console.error('Permission request failed:', error);
        setHasPermission(false);
        return false;
      }
    }
    return true;
  }, []);

  // 加速度データのハンドラ
  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    if (event.accelerationIncludingGravity) {
      const { x, y, z } = event.accelerationIncludingGravity;
      const newData: AccelerometerData = {
        x: x ?? 0,
        y: y ?? 0,
        z: z ?? 0,
        timestamp: Date.now(),
      };

      setData(newData);
      setHistory(prev => {
        const updated = [...prev, newData];
        return updated.slice(-maxHistorySize);
      });
    }
  }, [maxHistorySize]);

  // センサーの開始
  const startSensor = useCallback(async () => {
    const permitted = await requestPermission();
    if (!permitted) return;

    window.addEventListener('devicemotion', handleMotion);
    setIsActive(true);
  }, [handleMotion, requestPermission]);

  // センサーの停止
  const stopSensor = useCallback(() => {
    window.removeEventListener('devicemotion', handleMotion);
    setIsActive(false);
  }, [handleMotion]);

  // リセット
  const reset = useCallback(() => {
    setHistory([]);
    setData(null);
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [handleMotion]);

  // 加速度の大きさを計算
  const getMagnitude = useCallback((d: AccelerometerData | null) => {
    if (!d) return 0;
    return Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  }, []);

  // 平均値を計算
  const getAverage = useCallback((axis: 'x' | 'y' | 'z') => {
    if (history.length === 0) return 0;
    const sum = history.reduce((acc, d) => acc + d[axis], 0);
    return sum / history.length;
  }, [history]);

  if (!isSupported) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
                  Accelerometer Not Supported
                </h3>
                <p className="text-red-700 dark:text-red-300">
                  Your device or browser does not support the Device Motion API.
                  Please try accessing this page from a mobile device with sensor support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Accelerometer Monitor
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={isActive ? stopSensor : startSensor}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isActive ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start
                  </>
                )}
              </button>
              <button
                onClick={reset}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Reset"
              >
                <RotateCcw className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </div>

          {!hasPermission && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-200">
                Permission denied. Please click "Start" to request sensor access.
              </p>
            </div>
          )}
        </div>

        {/* Current Data Display */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 transition-colors duration-200">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Current Acceleration (m/s²)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* X Axis */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">X-Axis</div>
              <div className="text-3xl font-bold text-red-900 dark:text-red-100">
                {data ? data.x.toFixed(2) : '0.00'}
              </div>
              <div className="mt-2 h-2 bg-red-200 dark:bg-red-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 dark:bg-red-400 transition-all duration-100"
                  style={{ width: `${Math.min(Math.abs(data?.x ?? 0) * 10, 100)}%` }}
                />
              </div>
            </div>

            {/* Y Axis */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">Y-Axis</div>
              <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                {data ? data.y.toFixed(2) : '0.00'}
              </div>
              <div className="mt-2 h-2 bg-green-200 dark:bg-green-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 dark:bg-green-400 transition-all duration-100"
                  style={{ width: `${Math.min(Math.abs(data?.y ?? 0) * 10, 100)}%` }}
                />
              </div>
            </div>

            {/* Z Axis */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Z-Axis</div>
              <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {data ? data.z.toFixed(2) : '0.00'}
              </div>
              <div className="mt-2 h-2 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-100"
                  style={{ width: `${Math.min(Math.abs(data?.z ?? 0) * 10, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Magnitude */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="text-sm font-medium text-purple-700 dark:text-purple-400 mb-1">
              Magnitude (√(x² + y² + z²))
            </div>
            <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
              {getMagnitude(data).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Statistics */}
        {history.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 transition-colors duration-200">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Statistics ({history.length} samples)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Average X
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {getAverage('x').toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Average Y
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {getAverage('y').toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Average Z
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {getAverage('z').toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visual Indicator */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 transition-colors duration-200">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Visual Indicator
          </h2>

          <div className="relative w-full aspect-square max-w-md mx-auto bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
            {/* Grid */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-gray-300 dark:border-gray-600"
                />
              ))}
            </div>

            {/* Center Point */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" />

            {/* Accelerometer Indicator */}
            {data && (
              <div
                className="absolute w-8 h-8 bg-blue-500 dark:bg-blue-400 rounded-full border-4 border-white dark:border-gray-800 shadow-lg transition-all duration-100"
                style={{
                  left: `calc(50% + ${Math.max(-45, Math.min(45, data.x * 4))}%)`,
                  top: `calc(50% + ${Math.max(-45, Math.min(45, data.y * 4))}%)`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}

            {/* Axis Labels */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600 dark:text-gray-400">
              +Y
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600 dark:text-gray-400">
              -Y
            </div>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-600 dark:text-gray-400">
              -X
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-600 dark:text-gray-400">
              +X
            </div>
          </div>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
            Tilt your device to see the indicator move
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccelerometerTool;
