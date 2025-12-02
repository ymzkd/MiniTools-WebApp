import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // SPA用のフォールバック設定：すべてのルートでindex.htmlを返す
    historyApiFallback: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  // プレビューサーバーでもSPAフォールバックを有効化
  preview: {
    port: 3000,
    historyApiFallback: true
  }
})