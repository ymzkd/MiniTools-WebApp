import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // 開発環境用プロキシ設定（CORSエラー回避）
    proxy: {
      // MLIT DPF API プロキシ
      '/api/mlit': {
        target: 'https://www.mlit-data.jp/api/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mlit/, ''),
        secure: true,
      },
      // ボーリングXMLデータ プロキシ
      '/api/kunijiban': {
        target: 'https://www.kunijiban.pwri.go.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kunijiban/, ''),
        secure: true,
      }
    }
    // Note: Viteはデフォルトでindex.htmlへのフォールバックを行うため、
    // SPAルーティング用の追加設定は不要です
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  preview: {
    port: 3000
    // Note: プレビューサーバーもデフォルトでindex.htmlへのフォールバックを行います
  }
})