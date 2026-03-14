import React, { useState, useRef, useEffect } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  step?: number;
}

/**
 * フォーカス中は自由なテキスト入力を許容し、
 * フォーカスが外れた時に数値として妥当ならば値を更新、
 * 不正な値の場合は入力前の値に戻す数値入力コンポーネント。
 */
const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  className = '',
  min,
  step,
}) => {
  const [text, setText] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const prevValueRef = useRef(value);

  // 外部から値が変更された場合（フォーカスしていない時のみ反映）
  useEffect(() => {
    if (!isFocused && value !== prevValueRef.current) {
      setText(String(value));
      prevValueRef.current = value;
    }
  }, [value, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && isFinite(parsed)) {
      if (min !== undefined && parsed < min) {
        // min制約に引っかかる場合は元に戻す
        setText(String(prevValueRef.current));
        return;
      }
      prevValueRef.current = parsed;
      onChange(parsed);
      setText(String(parsed));
    } else {
      // 不正な値 → 元に戻す
      setText(String(prevValueRef.current));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={e => setText(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      step={step}
      min={min}
    />
  );
};

export default NumberInput;
