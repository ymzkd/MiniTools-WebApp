import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, FileText } from 'lucide-react';
import { useTheme as useSystemTheme } from '../../hooks/useTheme';
import 'katex/dist/katex.min.css';

const MarkdownEditor: React.FC = () => {
  const { isDark } = useSystemTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
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

  // コメント部分をハイライト表示するためのマークアップを生成
  const renderHighlightedText = (text: string) => {
    // HTMLコメントの正規表現（<!-- ... -->）
    const commentRegex = /(<!--[\s\S]*?-->)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = commentRegex.exec(text)) !== null) {
      // コメント前のテキスト
      if (match.index > lastIndex) {
        parts.push(
          <span
            key={`text-${lastIndex}`}
            className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100"
          >
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      // コメント部分（グレー表示）
      parts.push(
        <span
          key={`comment-${match.index}`}
          className="whitespace-pre-wrap break-words text-gray-400 dark:text-gray-500"
        >
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // 残りのテキスト
    if (lastIndex < text.length) {
      parts.push(
        <span
          key={`text-${lastIndex}`}
          className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100"
        >
          {text.substring(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : (
      <span className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
        {text}
      </span>
    );
  };

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

  // スクロール同期ハンドラー
  const handleScroll = () => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Undo/Redoスタックを維持しながらテキストを挿入（document.execCommand使用）
  const insertTextWithUndo = (text: string, newCursorPos?: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    document.execCommand('insertText', false, text);

    if (newCursorPos !== undefined) {
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
      }, 0);
    }
  };

  // 選択テキストを囲む（Undo/Redoスタック維持）
  const wrapSelection = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const selectedText = value.substring(selectionStart, selectionEnd);
    const newText = before + selectedText + after;

    // 現在の選択範囲を保存
    const start = selectionStart;
    const end = selectionEnd;

    // document.execCommandで置き換え
    textarea.focus();
    document.execCommand('insertText', false, newText);

    // カーソル位置を調整（選択テキストを維持）
    setTimeout(() => {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = end + before.length;
    }, 0);
  };

  // コメントトグル（Undo/Redoスタック維持）
  const toggleComment = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const selectedText = value.substring(selectionStart, selectionEnd);

    // 選択テキストが既にコメントで囲まれているかチェック
    const commentStart = '<!-- ';
    const commentEnd = ' -->';

    textarea.focus();

    if (selectedText.startsWith(commentStart) && selectedText.endsWith(commentEnd)) {
      // コメントを解除
      const unwrapped = selectedText.substring(commentStart.length, selectedText.length - commentEnd.length);
      document.execCommand('insertText', false, unwrapped);

      setTimeout(() => {
        textarea.selectionStart = selectionStart;
        textarea.selectionEnd = selectionStart + unwrapped.length;
      }, 0);
    } else {
      // コメントを追加
      const newText = commentStart + selectedText + commentEnd;
      document.execCommand('insertText', false, newText);

      // コメント記号全体を含めて選択範囲を設定（トグルで即座に解除できるように）
      setTimeout(() => {
        textarea.selectionStart = selectionStart;
        textarea.selectionEnd = selectionStart + newText.length;
      }, 0);
    }
  };

  // キーボードショートカットハンドラー
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Tab処理
    if (e.key === 'Tab') {
      e.preventDefault();

      const hasSelection = selectionStart !== selectionEnd;

      if (hasSelection) {
        // 複数行選択時の一括インデント/アンインデント
        const beforeSelection = value.substring(0, selectionStart);

        // 選択範囲の開始位置が行の途中の場合、行頭から選択を開始
        const startLine = beforeSelection.lastIndexOf('\n') + 1;
        const fullLines = value.substring(startLine, selectionEnd).split('\n');

        let newText: string;
        let newSelectionStart: number;
        let newSelectionEnd: number;

        if (e.shiftKey) {
          // Shift+Tab: インデント解除
          newText = fullLines.map(line => {
            if (line.startsWith('  ')) return line.substring(2);
            if (line.startsWith('\t')) return line.substring(1);
            return line;
          }).join('\n');

          const removedChars = fullLines.join('\n').length - newText.length;
          newSelectionStart = startLine;
          newSelectionEnd = selectionEnd - removedChars;
        } else {
          // Tab: インデント追加
          newText = fullLines.map(line => '  ' + line).join('\n');
          const addedChars = newText.length - fullLines.join('\n').length;
          newSelectionStart = startLine;
          newSelectionEnd = selectionEnd + addedChars;
        }

        // 全体を選択して置き換え（document.execCommand使用）
        textarea.selectionStart = startLine;
        textarea.selectionEnd = selectionEnd;
        textarea.focus();
        document.execCommand('insertText', false, newText);

        setTimeout(() => {
          textarea.selectionStart = newSelectionStart;
          textarea.selectionEnd = newSelectionEnd;
        }, 0);
      } else {
        // 単一カーソル位置での処理
        if (e.shiftKey) {
          // Shift+Tab: 現在行のインデント解除
          const beforeCursor = value.substring(0, selectionStart);
          const lineStart = beforeCursor.lastIndexOf('\n') + 1;
          const lineEnd = value.indexOf('\n', selectionStart);
          const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
          const currentLine = value.substring(lineStart, actualLineEnd);

          let newLine = currentLine;
          let removedChars = 0;

          if (currentLine.startsWith('  ')) {
            newLine = currentLine.substring(2);
            removedChars = 2;
          } else if (currentLine.startsWith('\t')) {
            newLine = currentLine.substring(1);
            removedChars = 1;
          }

          if (removedChars > 0) {
            textarea.selectionStart = lineStart;
            textarea.selectionEnd = actualLineEnd;
            textarea.focus();
            document.execCommand('insertText', false, newLine);

            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = selectionStart - removedChars;
            }, 0);
          }
        } else {
          // Tab: インデント追加
          insertTextWithUndo('  ');
        }
      }
      return;
    }

    // Ctrl/Cmd + B: 太字
    if (modKey && e.key === 'b') {
      e.preventDefault();
      wrapSelection('**', '**');
      return;
    }

    // Ctrl/Cmd + I: イタリック
    if (modKey && e.key === 'i') {
      e.preventDefault();
      wrapSelection('*', '*');
      return;
    }

    // Ctrl/Cmd + K: リンク
    if (modKey && e.key === 'k') {
      e.preventDefault();
      const selectedText = value.substring(selectionStart, selectionEnd);
      if (selectedText) {
        wrapSelection('[', '](url)');
      } else {
        insertTextWithUndo('[リンクテキスト](url)');
      }
      return;
    }

    // Ctrl/Cmd + E: インラインコード
    if (modKey && e.key === 'e') {
      e.preventDefault();
      wrapSelection('`', '`');
      return;
    }

    // Ctrl/Cmd + /: コメントトグル
    if (modKey && e.key === '/') {
      e.preventDefault();
      toggleComment();
      return;
    }

    // Ctrl/Cmd + Enter: 現在行の下に新規行を挿入
    if (modKey && e.key === 'Enter') {
      e.preventDefault();
      const afterCursor = value.substring(selectionStart);
      const currentLineEnd = afterCursor.indexOf('\n');
      const lineEnd = currentLineEnd === -1 ? value.length : selectionStart + currentLineEnd;

      textarea.selectionStart = textarea.selectionEnd = lineEnd;
      insertTextWithUndo('\n', lineEnd + 1);
      return;
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
          {/* エディタコンテナ（ハイライトoverlayとtextareaを重ねて表示） */}
          <div className="relative flex-1">
            {/* 背景のハイライト表示レイヤー */}
            <div
              ref={highlightRef}
              className="absolute inset-0 p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 font-mono text-sm overflow-auto
                         pointer-events-none whitespace-pre-wrap break-words
                         transition-colors duration-200"
              style={{ color: 'transparent' }}
            >
              <div className="min-h-[600px]">
                {renderHighlightedText(markdown || ' ')}
              </div>
            </div>
            {/* 実際のtextarea（テキストをほぼ透明に） */}
            <textarea
              ref={textareaRef}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              className="relative w-full h-full p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       bg-transparent font-mono text-sm resize-none min-h-[600px]"
              placeholder="ここにマークダウンを入力..."
              spellCheck={false}
              style={{
                // textareaのテキストをほぼ透明にして、背景のハイライトレイヤーの色を完全に表示
                color: 'rgba(0, 0, 0, 0.01)',
                caretColor: isDark ? '#f3f4f6' : '#111827',
                // 選択範囲の色を設定
                WebkitTextFillColor: 'rgba(0, 0, 0, 0.01)',
              }}
            />
          </div>
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
                          [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:pb-2 [&_h1]:border-b-2 [&_h1]:border-gray-300 dark:[&_h1]:border-gray-600
                          [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-gray-200 dark:[&_h2]:border-gray-700
                          [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100 [&_h3]:mb-3 [&_h3]:mt-4
                          [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-gray-900 dark:[&_h4]:text-gray-100 [&_h4]:mb-2 [&_h4]:mt-3
                          [&_h5]:text-base [&_h5]:font-semibold [&_h5]:text-gray-900 dark:[&_h5]:text-gray-100 [&_h5]:mb-2 [&_h5]:mt-3
                          [&_h6]:text-sm [&_h6]:font-medium [&_h6]:text-gray-700 dark:[&_h6]:text-gray-300 [&_h6]:mb-2 [&_h6]:mt-2
                          [&_p]:text-gray-800 dark:[&_p]:text-gray-200 [&_p]:mb-4 [&_p]:leading-relaxed
                          [&_li]:text-gray-800 dark:[&_li]:text-gray-200
                          [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_a]:font-medium
                          [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100 [&_strong]:font-bold
                          [&_em]:text-gray-800 dark:[&_em]:text-gray-200 [&_em]:italic
                          [&_code]:text-pink-600 dark:[&_code]:text-pink-400 [&_code]:bg-gray-200 dark:[&_code]:bg-gray-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
                          [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-900 [&_pre]:text-gray-900 dark:[&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4
                          [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
                          [&_blockquote]:text-gray-700 dark:[&_blockquote]:text-gray-300 [&_blockquote]:italic [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 dark:[&_blockquote]:border-gray-600
                          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-gray-800 dark:[&_ul]:text-gray-200 [&_ul]:my-4
                          [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-gray-800 dark:[&_ol]:text-gray-200 [&_ol]:my-4
                          [&_table]:border-collapse [&_table]:border [&_table]:border-gray-300 dark:[&_table]:border-gray-600 [&_table]:w-full [&_table]:my-6
                          [&_th]:border [&_th]:border-gray-300 dark:[&_th]:border-gray-600 [&_th]:px-4 [&_th]:py-2 [&_th]:bg-gray-100 dark:[&_th]:bg-gray-800 [&_th]:text-gray-900 dark:[&_th]:text-gray-100 [&_th]:font-semibold
                          [&_td]:border [&_td]:border-gray-300 dark:[&_td]:border-gray-600 [&_td]:px-4 [&_td]:py-2 [&_td]:text-gray-800 dark:[&_td]:text-gray-200
                          [&_hr]:border-gray-300 dark:[&_hr]:border-gray-600 [&_hr]:my-8">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const isInline = !className || !language;

                    return !isInline ? (
                      <SyntaxHighlighter
                        style={isDark ? oneDark : oneLight}
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: '0.5rem',
                          backgroundColor: isDark ? '#282c34' : '#fafafa',
                        }}
                        codeTagProps={{
                          style: {
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          }
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>

      {/* ヘルプセクション */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            💡 マークダウン記法
          </h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>• インライン数式: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">$数式$</code></li>
            <li>• ブロック数式: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">$$数式$$</code></li>
            <li>• コードブロック: <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">```言語名```</code></li>
            <li>• GitHub Flavored Markdown（GFM）対応: テーブル、タスクリスト、取り消し線など</li>
          </ul>
        </div>

        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            ⌨️ キーボードショートカット
          </h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Tab</kbd> インデント追加 / <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Shift+Tab</kbd> インデント解除</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+B</kbd> 太字</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+I</kbd> イタリック</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+K</kbd> リンク</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+E</kbd> インラインコード</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+/</kbd> コメントトグル（追加/解除）</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+Enter</kbd> 新規行挿入</li>
            <li>• <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+Z</kbd> 元に戻す / <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl/Cmd+Shift+Z</kbd> やり直す</li>
          </ul>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            ※ コメント部分はエディタ内でグレー表示されます
          </p>
        </div>
      </div>
    </div>
  );
};

export default MarkdownEditor;
