# Math Tools Suite

数学文書作成のための統合Webアプリケーションスイート。LaTeX行列エディターと図表レイアウトツールを一つのモダンなインターフェースで提供します。学術論文、教材作成、数学的文書の準備に最適化されています。

## ✨ 統合機能

### 🔢 LaTeX Matrix Editor
- **視覚的行列編集**: リアルタイムセル編集機能付きスプレッドシート風インターフェース
- **複数の行列タイプ**: `matrix`、`pmatrix`、`bmatrix`、`vmatrix`、`Vmatrix`、`smallmatrix`に対応
- **対称行列モード**: 正方行列における対称位置セルの自動同期
- **スマート選択**: 単一セル、範囲選択、複数選択に対応
- **LaTeXインポート/エクスポート**: 視覚エディターとLaTeXコード間の双方向変換

### 📊 Figure Layout Tool
- **ドラッグ&ドロップ画像アップロード**: 直感的な画像管理
- **フレキシブルグリッドシステム**: 自動行組織化による柔軟なレイアウト
- **数式キャプション**: KaTeXレンダリング対応（$...$ および $$...$$ 構文）
- **マルチ形式エクスポート**: PNG、PDF形式での解像度制御可能な出力
- **画像並び替え**: ドラッグ&ドロップによる直感的な再配置
- **クリップボード機能**: 画像レイアウトのクリップボードコピー

### 🎮 統合UI機能
- **タブベースナビゲーション**: ツール間のシームレスな切り替え
- **ダーク/ライトモード**: システム設定自動検出とマニュアル切り替え
- **レスポンシブデザイン**: デスクトップ・モバイル最適化
- **リアルタイムKaTeXレンダリング**: v0.16.22によるMathML出力対応

## 🚀 クイックスタート

### 必要な環境
- Node.js 18以上
- npm または yarn

### インストール
```bash
# リポジトリをクローン
git clone <repository-url>
cd MiniTools-WebApp

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

`http://localhost:3000` にアクセスしてMath Tools Suiteを開始してください！

### プロダクションビルド
```bash
# プロダクション用ビルド
npm run build

# プロダクションビルドをプレビュー
npm run preview
```

## 🛠 技術スタック

- **フロントエンド**: React 19 + TypeScript
- **ビルドツール**: Vite（ホットリロード機能付き）
- **数式レンダリング**: KaTeX v0.16.22（MathML出力対応）
- **画像処理**: html2canvas、jsPDF
- **アイコン**: Lucide React
- **スタイリング**: Tailwind CSS
- **コード品質**: ESLint 9 + TypeScript

## 📖 使用方法

### 🔢 LaTeX Matrix Editor
1. **基本操作**:
   - セル選択: クリックで選択、ドラッグで範囲選択
   - 内容編集: セルエディターまたは選択セルでEnterキー
   - ナビゲーション: Tab/矢印キーによる移動
2. **行列操作**:
   - 行/列追加: ホバーコントロールまたは右クリックメニュー
   - 行列タイプ変更: ドロップダウンから選択
   - 対称モード: 自動対称行列編集

### 📊 Figure Layout Tool
1. **画像管理**:
   - 画像アップロード: ドラッグ&ドロップまたはファイル選択
   - 画像配置: グリッド内での自由な並び替え
   - 画像削除: 各画像の削除ボタン
2. **レイアウト調整**:
   - グリッド設定: 列数とスペーシング調整
   - キャプション: 数式対応キャプション（$x^2$ や $$\int_0^\infty$$）
3. **エクスポート**:
   - 形式選択: PNG、PDF形式
   - 解像度設定: カスタム解像度指定
   - クリップボード: 直接コピー機能

## 🏗 プロジェクト構造

```
src/
├── components/
│   ├── common/           # 共通コンポーネント（ナビゲーション、レイアウト、トースト）
│   ├── matrix/           # LaTeX Matrix Editor コンポーネント
│   └── figure/           # Figure Layout Tool コンポーネント
├── hooks/                # カスタム React フック
├── types/                # TypeScript 型定義
├── App.tsx              # タブルーティング付きメインアプリケーション
├── main.tsx             # React エントリーポイント
└── index.css            # グローバルスタイル
```

## 📋 開発コマンド

```bash
npm run dev      # 開発サーバー起動（ポート3000）
npm run build    # プロダクション用ビルド
npm run lint     # ESLint実行
npm run preview  # プロダクションビルドプレビュー
```

## 🚀 デプロイ

このアプリケーションは静的ホスティングプラットフォーム向けに最適化されています：

### 推奨プラットフォーム
- **Vercel**: Git統合によるゼロ設定デプロイメント
- **Netlify**: ドラッグ&ドロップまたはGitベースのデプロイメント
- **GitHub Pages**: パブリックリポジトリの無料ホスティング

### Vercelへのデプロイ
1. GitHubリポジトリにコードをプッシュ
2. リポジトリをVercelに接続
3. カスタムドメインでの自動デプロイメント

### Netlifyへのデプロイ
1. `npm run build` を実行
2. `dist` フォルダをNetlifyデプロイエリアにドラッグ
3. HTTPSによる即座のデプロイメント

## 🎨 主要機能の紹介

### LaTeX Matrix Editor
```latex
\begin{pmatrix} a & b \\ c & d \end{pmatrix}  % 括弧行列
\begin{bmatrix} a & b \\ c & d \end{bmatrix}  % 角括弧行列  
\begin{vmatrix} a & b \\ c & d \end{vmatrix}  % 行列式
```

**対称行列自動同期**: 対称モードでは `a[i][j]` の編集により `a[j][i]` が自動更新されます。

### Figure Layout Tool
- **フレキシブルグリッド**: 自動調整される画像配置システム
- **数式キャプション**: LaTeX数式をサポートするキャプション機能
- **高品質エクスポート**: PNG/PDF出力で学術利用に最適

### 統合インターフェース
タブベースの統合インターフェースにより、行列編集から図表作成まで一つのアプリケーションで完結します。

## 🤝 貢献

1. リポジトリをフォーク
2. 機能ブランチを作成
3. 適切なTypeScript型で変更を加える
4. `npm run build` と `npm run lint` でテスト
5. プルリクエストを提出

## 📄 ライセンス

MITライセンス - 学術または商用目的での使用は自由です。

## 🔗 リンク

- [KaTeX ドキュメント](https://katex.org/) - 数式レンダリング
- [React 19 ドキュメント](https://react.dev/) - UI フレームワーク
- [Vite ドキュメント](https://vite.dev/) - ビルドツール
- [Tailwind CSS](https://tailwindcss.com/) - スタイリング
- [html2canvas](https://html2canvas.hertzen.com/) - 画像エクスポート
- [jsPDF](https://github.com/parallax/jsPDF) - PDF生成