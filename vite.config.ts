import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
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