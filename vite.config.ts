import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // SPAのhistoryルーティング対応
    historyApiFallback: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})