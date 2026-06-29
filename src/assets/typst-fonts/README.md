# Typst プレビュー用同梱フォント

Typst エディタ（Markdown Editor の Typst モード）のプレビューをオフラインで
レンダリングするために同梱しているフォントです。いずれも再配布が許可された
オープンライセンスのフォントです。

| ファイル | フォント | 用途 | ライセンス |
|----------|----------|------|------------|
| `DejaVuSerif.ttf`, `DejaVuSerif-Bold.ttf` | DejaVu Serif | 欧文（本文） | DejaVu Fonts License (Bitstream Vera 派生) |
| `DejaVuSansMono.ttf` | DejaVu Sans Mono | 等幅（コード／raw） | DejaVu Fonts License |
| `IPAGothic.ttf` | IPAゴシック (IPAGothic) | 和文 | IPA Font License Agreement v1.0 |
| `STIXTwoMath-Regular.ttf` | STIX Two Math | 数式 | SIL Open Font License 1.1 |

`STIXTwoMath-Regular.ttf` は `@fontsource/stix-two-math`（latin サブセット, MATH テーブル付き）
の woff2 を fontTools で ttf へ変換したものです。数式記号の一部は収録範囲外のため
表示されない場合があります。

フォントは `typstCompiler.ts` で `loadFonts(..., { assets: false })` により読み込まれ、
CDN へのフォント取得は行いません。
