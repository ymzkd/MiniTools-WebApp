import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 環境変数を読み込む
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 3000,
      open: true,
      proxy: {
        // MLIT API プロキシ（ローカル開発用）
        '/api/mlit': {
          target: 'https://www.mlit-data.jp/api/v1/',
          changeOrigin: true,
          secure: true,
          rewrite: () => '/',
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              // 環境変数からAPIキーを取得してヘッダーに追加
              if (env.MLIT_API_KEY) {
                proxyReq.setHeader('apikey', env.MLIT_API_KEY);
              }
            });
          },
        },
        // KuniJiban XML プロキシ（ローカル開発用）
        '/api/kunijiban': {
          target: 'https://www.kunijiban.pwri.go.jp',
          changeOrigin: true,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // URLクエリパラメータから実際のURLを取得
              const url = new URL(req.url || '', 'http://localhost');
              const targetUrl = url.searchParams.get('url');
              if (targetUrl) {
                // ターゲットURLのパスに書き換え
                const parsedTarget = new URL(targetUrl);
                proxyReq.path = parsedTarget.pathname + parsedTarget.search;
              }
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    },
    preview: {
      port: 3000
      // Note: プレビューサーバーもデフォルトでindex.htmlへのフォールバックを行います
    }
  }
})