/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Typst WASM モジュールを URL 文字列として取り込む（Vite の ?url 機能）
declare module '@myriaddreamin/typst-ts-web-compiler/wasm?url' {
  const src: string
  export default src
}

declare module '@myriaddreamin/typst-ts-renderer/wasm?url' {
  const src: string
  export default src
}
