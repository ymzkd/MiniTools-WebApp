import React, { useState, useEffect } from 'react';
import katex from 'katex';

interface MathCaptionProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style: React.CSSProperties;
  rows?: number;
  tabIndex?: number;
}

const MathCaption: React.FC<MathCaptionProps> = ({
  value,
  onChange,
  placeholder = 'キャプションを入力...',
  style,
  rows = 2,
  tabIndex,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState('');

  useEffect(() => {
    if (!isEditing && value) {
      try {
        // インライン数式 $...$ を処理
        let processedText = value.replace(/\$([^$]+)\$/g, (match, math) => {
          try {
            return katex.renderToString(math, { displayMode: false });
          } catch (error) {
            console.warn('Math rendering error:', error);
            return match; // エラーの場合は元のテキストを返す
          }
        });

        // ブロック数式 $$...$$ を処理
        processedText = processedText.replace(/\$\$([^$]+)\$\$/g, (match, math) => {
          try {
            return katex.renderToString(math, { displayMode: true });
          } catch (error) {
            console.warn('Math rendering error:', error);
            return match; // エラーの場合は元のテキストを返す
          }
        });

        setRenderedHtml(processedText);
      } catch (error) {
        console.warn('Caption processing error:', error);
        setRenderedHtml(value);
      }
    }
  }, [value, isEditing]);

  const handleClick = () => {
    setIsEditing(true);
  };

  const handleDivKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsEditing(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      
      // 次のキャプション要素を探す
      const currentTabIndex = tabIndex || 0;
      const nextTabIndex = currentTabIndex + 1;
      const nextElement = document.querySelector(`[tabindex="${nextTabIndex}"]`) as HTMLElement;
      
      if (nextElement) {
        nextElement.focus();
      } else {
        // 最後の要素の場合、最初のキャプション要素に戻る
        const firstElement = document.querySelector('[tabindex="1"]') as HTMLElement;
        if (firstElement) {
          firstElement.focus();
        }
      }
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setIsEditing(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setIsEditing(false);
      
      // 次のキャプション要素を探す
      setTimeout(() => {
        const currentTabIndex = tabIndex || 0;
        const nextTabIndex = currentTabIndex + 1;
        const nextElement = document.querySelector(`[tabindex="${nextTabIndex}"]`) as HTMLElement;
        
        if (nextElement) {
          nextElement.focus();
          nextElement.click(); // キャプション要素の場合、クリックして編集モードに
        } else {
          // 最後の要素の場合、最初のキャプション要素に戻る
          const firstElement = document.querySelector('[tabindex="1"]') as HTMLElement;
          if (firstElement) {
            firstElement.focus();
            firstElement.click();
          }
        }
      }, 50);
    }
  };

  if (isEditing) {
    return (
      <textarea
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="border-blue-400 dark:border-blue-500 border rounded bg-blue-50 dark:bg-blue-900/30 bg-opacity-50 outline-none resize-none w-full text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        style={{
          ...style,
          margin: 0,
          padding: '4px',
          color: undefined, // CSSクラスの色設定を優先
        }}
        rows={rows}
        autoFocus
        tabIndex={tabIndex}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className="cursor-text border border-transparent rounded p-1 hover:bg-gray-50 dark:hover:bg-gray-700/30"
      style={{
        ...style,
        minHeight: `${Math.max(parseInt(style.fontSize as string) * 1.5, 24)}px`,
      }}
      title="クリックして編集。数式は$...$または$$...$$で囲んでください。Tabで次へ移動。"
      tabIndex={tabIndex}
      onKeyDown={handleDivKeyDown}
    >
      {value ? (
        <div
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
          className="leading-snug break-words text-gray-900 dark:text-gray-100 print:text-gray-900"
        />
      ) : (
        <div 
          className="caption-placeholder text-gray-400 dark:text-gray-500 italic"
        >
          {placeholder}
        </div>
      )}
    </div>
  );
};

export default MathCaption;