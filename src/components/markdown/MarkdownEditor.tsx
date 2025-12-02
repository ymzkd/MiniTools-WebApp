import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Copy, FileText } from 'lucide-react';
import 'katex/dist/katex.min.css';

const MarkdownEditor: React.FC = () => {
  const [markdown, setMarkdown] = useState<string>(
    `# マークダウンエディタ

シンプルなマークダウンエディタです。リアルタイムでプレビューを確認できます。

## 機能

- **太字**、*イタリック*、~~取り消し線~~
- リスト、コードブロック、引用
- KaTeX数式サポート

## 数式の例

インライン数式: $E = mc^2$

ブロック数式:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## コード例

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

## リスト

1. 第一項目
2. 第二項目
   - サブ項目A
   - サブ項目B
3. 第三項目

## リンクと画像

[Google](https://www.google.com)

> これは引用ブロックです。

---

テーブル:

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| A   | B   | C   |
| 1   | 2   | 3   |
`
  );
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  const handleClear = () => {
    if (confirm('テキストをクリアしますか？')) {
      setMarkdown('');
    }
  };

  return (
    <div className="w-full px-6 xl:px-12 3xl:px-16 4xl:px-20 5xl:px-24">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Markdown Editor
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                リアルタイムプレビュー付きマークダウンエディタ（数式対応）
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                copySuccess
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <Copy className="w-4 h-4" />
              {copySuccess ? 'コピー完了!' : 'コピー'}
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* エディタとプレビューの2ペイン */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 左ペイン: テキストエリア */}
        <div className="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              エディタ
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              マークダウンテキストを入力してください
            </p>
          </div>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="flex-1 w-full p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     font-mono text-sm resize-none min-h-[600px] transition-colors duration-200"
            placeholder="ここにマークダウンを入力..."
            spellCheck={false}
          />
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            文字数: {markdown.length}
          </div>
        </div>

        {/* 右ペイン: プレビュー */}
        <div className="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              プレビュー
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              レンダリング結果
            </p>
          </div>
          <div className="flex-1 p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg
                        bg-gray-50 dark:bg-gray-700 overflow-auto min-h-[600px] transition-colors duration-200">
            <div className="prose prose-sm sm:prose lg:prose-lg max-w-none
                          prose-headings:font-bold prose-headings:text-gray-900 dark:prose-headings:text-gray-100
                          prose-h1:text-4xl prose-h1:font-extrabold prose-h1:mb-6 prose-h1:mt-8 prose-h1:pb-3 prose-h1:border-b-2 prose-h1:border-gray-300 dark:prose-h1:border-gray-600
                          prose-h2:text-3xl prose-h2:font-bold prose-h2:mb-4 prose-h2:mt-6 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 dark:prose-h2:border-gray-700
                          prose-h3:text-2xl prose-h3:font-bold prose-h3:mb-3 prose-h3:mt-5
                          prose-h4:text-xl prose-h4:font-semibold prose-h4:mb-2 prose-h4:mt-4
                          prose-h5:text-lg prose-h5:font-semibold prose-h5:mb-2 prose-h5:mt-3
                          prose-h6:text-base prose-h6:font-medium prose-h6:mb-2 prose-h6:mt-3 prose-h6:text-gray-700 dark:prose-h6:text-gray-300
                          prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-p:mb-4 prose-p:leading-relaxed
                          prose-li:text-gray-800 dark:prose-li:text-gray-200
                          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline prose-a:font-medium
                          prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-strong:font-bold
                          prose-em:text-gray-800 dark:prose-em:text-gray-200 prose-em:italic
                          prose-code:text-pink-600 dark:prose-code:text-pink-400
                          prose-code:bg-gray-200 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                          prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900
                          prose-pre:text-gray-900 dark:prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
                          prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 prose-blockquote:italic prose-blockquote:pl-4 prose-blockquote:my-4
                          prose-blockquote:border-l-4 prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600
                          prose-ul:list-disc prose-ul:pl-6 prose-ul:text-gray-800 dark:prose-ul:text-gray-200 prose-ul:my-4
                          prose-ol:list-decimal prose-ol:pl-6 prose-ol:text-gray-800 dark:prose-ol:text-gray-200 prose-ol:my-4
                          prose-table:border-collapse prose-table:border prose-table:border-gray-300 dark:prose-table:border-gray-600 prose-table:my-6
                          prose-th:text-gray-900 dark:prose-th:text-gray-100 prose-th:font-semibold
                          prose-th:bg-gray-100 dark:prose-th:bg-gray-800
                          prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-600 prose-th:px-4 prose-th:py-2
                          prose-td:text-gray-800 dark:prose-td:text-gray-200
                          prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-600 prose-td:px-4 prose-td:py-2
                          prose-tr:border-gray-300 dark:prose-tr:border-gray-600
                          prose-thead:border-gray-400 dark:prose-thead:border-gray-500
                          prose-hr:border-gray-300 dark:prose-hr:border-gray-600 prose-hr:my-8
                          [&>*]:text-gray-800 dark:[&>*]:text-gray-200
                          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2
                          [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2
                          [&_table]:border-collapse [&_table]:border [&_table]:border-gray-300 dark:[&_table]:border-gray-600 [&_table]:w-full [&_table]:my-6
                          [&_th]:border [&_th]:border-gray-300 dark:[&_th]:border-gray-600 [&_th]:px-4 [&_th]:py-2 [&_th]:bg-gray-100 dark:[&_th]:bg-gray-800
                          [&_td]:border [&_td]:border-gray-300 dark:[&_td]:border-gray-600 [&_td]:px-4 [&_td]:py-2">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>

      {/* ヘルプセクション */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
          💡 使い方のヒント
        </h3>
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <li>• インライン数式: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">$数式$</code></li>
          <li>• ブロック数式: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">$$数式$$</code></li>
          <li>• コードブロック: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">```言語名```</code></li>
          <li>• GitHub Flavored Markdown（GFM）対応: テーブル、タスクリスト、取り消し線など</li>
        </ul>
      </div>
    </div>
  );
};

export default MarkdownEditor;
