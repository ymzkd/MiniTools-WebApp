import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Play, Pause } from 'lucide-react';

const AudioSpectrumAnalyzer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ダークモードの検出
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  // スペクトルを描画する関数
  const drawSpectrum = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyser.getByteFrequencyData(dataArray);

    // キャンバスをクリア
    ctx.fillStyle = isDarkMode ? '#111827' : '#f9fafb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // バーの幅と間隔を計算
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;

    // グラデーションを作成
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, isDarkMode ? '#3b82f6' : '#2563eb');
    gradient.addColorStop(0.5, isDarkMode ? '#8b5cf6' : '#7c3aed');
    gradient.addColorStop(1, isDarkMode ? '#ec4899' : '#db2777');

    // スペクトルバーを描画
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;

      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }

    // 周波数ラベルを描画
    ctx.fillStyle = isDarkMode ? '#9ca3af' : '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    const maxFreq = sampleRate / 2;
    const freqStep = maxFreq / 5;

    for (let i = 0; i <= 5; i++) {
      const freq = Math.round((freqStep * i) / 100) / 10;
      const x = (canvas.width / 5) * i;
      ctx.fillText(`${freq}k`, x, canvas.height - 5);
    }

    // グリッド線を描画
    ctx.strokeStyle = isDarkMode ? '#374151' : '#e5e7eb';
    ctx.lineWidth = 1;

    // 水平グリッド線
    for (let i = 0; i <= 4; i++) {
      const y = (canvas.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    animationRef.current = requestAnimationFrame(drawSpectrum);
  };

  // マイク入力を開始
  const startMicrophone = async () => {
    try {
      setError('');

      // マイクアクセスをリクエスト
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasPermission(true);

      // Audio Contextを作成
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Analyser Nodeを作成
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // マイク入力をAnalyserに接続
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      setIsRunning(true);
      drawSpectrum();
    } catch (err) {
      setError('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
      console.error('マイクアクセスエラー:', err);
    }
  };

  // マイク入力を停止
  const stopMicrophone = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsRunning(false);
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, []);

  // キャンバスのリサイズ処理
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-colors duration-200">
        {/* ヘッダー */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Audio Spectrum Analyzer
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            マイクからリアルタイムに音声を取得してFFT解析を行い、周波数スペクトルを可視化します
          </p>
        </div>

        {/* コントロールパネル */}
        <div className="mb-6 flex items-center space-x-4">
          {!isRunning ? (
            <button
              onClick={startMicrophone}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200 font-medium"
            >
              <Play className="w-4 h-4 mr-2" />
              開始
            </button>
          ) : (
            <button
              onClick={stopMicrophone}
              className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors duration-200 font-medium"
            >
              <Pause className="w-4 h-4 mr-2" />
              停止
            </button>
          )}

          <div className="flex items-center space-x-2">
            {isRunning ? (
              <>
                <Mic className="w-5 h-5 text-green-500 animate-pulse" />
                <span className="text-green-600 dark:text-green-400 font-medium">
                  録音中
                </span>
              </>
            ) : (
              <>
                <MicOff className="w-5 h-5 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">
                  停止中
                </span>
              </>
            )}
          </div>

          {hasPermission && !isRunning && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              マイクへのアクセスが許可されています
            </span>
          )}
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* スペクトル表示キャンバス */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full h-96 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-gray-200 dark:border-gray-700 transition-colors duration-200"
          />
          {!isRunning && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <Mic className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  「開始」ボタンをクリックしてスペクトル解析を開始してください
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 説明 */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
            使い方
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>「開始」ボタンをクリックするとマイクへのアクセス許可を求められます</li>
            <li>許可すると、リアルタイムで音声の周波数スペクトルが表示されます</li>
            <li>横軸は周波数（kHz）、縦軸は音量を表します</li>
            <li>FFTサイズ: 2048、スムージング係数: 0.8</li>
            <li>スマートフォンでも動作します（HTTPS接続が必要）</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AudioSpectrumAnalyzer;
