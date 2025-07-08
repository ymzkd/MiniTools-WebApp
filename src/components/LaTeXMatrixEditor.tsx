import React, { useState, useEffect, useRef } from 'react';

interface MatrixData {
  type: string;
  rows: number;
  cols: number;
  cells: string[][];
}

interface CellPosition {
  row: number;
  col: number;
}

interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

interface ContextMenuData {
  x: number;
  y: number;
  type: 'row' | 'col' | 'cell';
  index: number;
}

interface HistoryEntry {
  matrix: MatrixData;
  activeCell: CellPosition;
  timestamp: number;
}

interface UndoRedoState {
  history: HistoryEntry[];
  currentIndex: number;
}

// KaTeX の型定義を拡張
declare global {
  interface Window {
    katex: {
      render: (tex: string, element: HTMLElement, options?: any) => void;
    };
    parseTimeout?: number;
  }
}

const LaTeXMatrixEditor: React.FC = () => {
  // 基本状態
  const [matrix, setMatrix] = useState<MatrixData>({
    type: 'pmatrix',
    rows: 3,
    cols: 3,
    cells: [
      ['a_{11}', 'a_{12}', 'a_{13}'],
      ['a_{21}', 'a_{22}', 'a_{23}'],
      ['a_{31}', 'a_{32}', 'a_{33}']
    ]
  });

  // セル選択関連
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: 0, col: 0 });
  const [selectedRange, setSelectedRange] = useState<SelectionRange>({
    start: { row: 0, col: 0 },
    end: { row: 0, col: 0 }
  });
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>('single');

  // その他の状態
  const [currentCellContent, setCurrentCellContent] = useState('a_{11}');
  const [originalCellContent, setOriginalCellContent] = useState('a_{11}');
  const [latexCode, setLatexCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [parseError, setParseError] = useState('');
  const [symmetricMode, setSymmetricMode] = useState(false);
  const [triangularPreference, setTriangularPreference] = useState<'upper' | 'lower'>('upper');
  const [showHelp, setShowHelp] = useState(false);
  const [showZeros, setShowZeros] = useState(true);
  const [isEscapePressed, setIsEscapePressed] = useState(false);
  const [syncDirection, setSyncDirection] = useState<'code-to-table' | 'table-to-code' | 'idle'>('idle');

  const [undoRedoState, setUndoRedoState] = useState<UndoRedoState>({
    history: [{
      matrix: {
        type: 'pmatrix',
        rows: 3,
        cols: 3,
        cells: [
          ['a_{11}', 'a_{12}', 'a_{13}'],
          ['a_{21}', 'a_{22}', 'a_{23}'],
          ['a_{31}', 'a_{32}', 'a_{33}']
        ]
      },
      activeCell: { row: 0, col: 0 },
      timestamp: Date.now()
    }],
    currentIndex: 0
  });

  // コンテキストメニュー
  const [contextMenu, setContextMenu] = useState<ContextMenuData | null>(null);

  // クリップボード
  const [clipboardData, setClipboardData] = useState<string[][] | null>(null);

  // refs
  const cellKatexRefs = useRef<{[key: string]: HTMLElement}>({});
  const previewRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const cellEditorRef = useRef<HTMLInputElement>(null);

  // KaTeX動的ロード
  useEffect(() => {
    const loadKaTeX = async () => {
      if (!window.katex) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.8/katex.min.js';
        script.onload = () => {
          generateLatex();
          renderAllCells();
        };
        document.head.appendChild(script);
      } else {
        generateLatex();
        renderAllCells();
      }
    };
    loadKaTeX();
  }, [matrix]);

  // アクティブセル変更時のハイライト更新
  useEffect(() => {
    if (window.katex && previewRef.current) {
      applyHighlight();
    }
  }, [activeCell, selectedRange]);

  // アクティブセル変更時に編集ボックスの内容を更新
  useEffect(() => {
    if (matrix.cells[activeCell.row] && matrix.cells[activeCell.row][activeCell.col] !== undefined) {
      const cellValue = matrix.cells[activeCell.row][activeCell.col];
      setCurrentCellContent(cellValue);
      setOriginalCellContent(cellValue);
    }
  }, [activeCell, matrix.cells]);

  // セル内容変更時の個別レンダリング
  useEffect(() => {
    if (window.katex) {
      renderCellContent(activeCell.row, activeCell.col, currentCellContent);
      // 少し遅延させて再度レンダリングを試行（エラー回復のため）
      setTimeout(() => {
        renderCellContent(activeCell.row, activeCell.col, currentCellContent);
      }, 100);
    }
  }, [currentCellContent]);

  // ゼロ表示切り替え時の再レンダリング
  useEffect(() => {
    if (window.katex) {
      generateLatex();
      renderAllCells();
    }
  }, [showZeros]);

  // コンテキストメニューを閉じる
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 選択範囲にセルが含まれているかチェック
  const isCellInSelection = (row: number, col: number): boolean => {
    if (selectionMode === 'single') {
      return row === activeCell.row && col === activeCell.col;
    }
    
    const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
    const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
    const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
    const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);
    
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  // セル選択
  const selectCell = (row: number, col: number, extend: boolean = false) => {
    if (extend && selectionMode === 'range') {
      setSelectedRange(prev => ({ ...prev, end: { row, col } }));
    } else {
      setActiveCell({ row, col });
      setSelectedRange({ start: { row, col }, end: { row, col } });
      setSelectionMode('single');
    }
  };

  // 範囲選択開始
  const startRangeSelection = (row: number, col: number) => {
    setIsSelecting(true);
    setSelectionMode('range');
    setSelectedRange({ start: { row, col }, end: { row, col } });
    setActiveCell({ row, col });
  };

  // 範囲選択更新
  const updateRangeSelection = (row: number, col: number) => {
    if (isSelecting && selectionMode === 'range') {
      setSelectedRange(prev => ({ ...prev, end: { row, col } }));
    }
  };

  // 範囲選択終了
  const endRangeSelection = () => {
    setIsSelecting(false);
  };

  // 全選択
  const selectAllCells = () => {
    setSelectionMode('range');
    setSelectedRange({
      start: { row: 0, col: 0 },
      end: { row: matrix.rows - 1, col: matrix.cols - 1 }
    });
  };

  // 選択されたセルをコピー
  const copySelectedCells = () => {
    const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
    const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
    const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
    const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);

    const copiedData: string[][] = [];
    for (let i = minRow; i <= maxRow; i++) {
      const row: string[] = [];
      for (let j = minCol; j <= maxCol; j++) {
        row.push(matrix.cells[i][j] || '');
      }
      copiedData.push(row);
    }

    setClipboardData(copiedData);

    // システムクリップボードにも保存（TSV形式）
    const tsvData = copiedData.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsvData);

    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1000);
  };

  // 選択されたセルを切り取り
  const cutSelectedCells = () => {
    copySelectedCells();
    
    clearSelectedCells();
  };

  // 選択されたセルをクリア
  const clearSelectedCells = () => {
    const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
    const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
    const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
    const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);

    const newCells = [...matrix.cells];
    
    for (let i = minRow; i <= maxRow; i++) {
      for (let j = minCol; j <= maxCol; j++) {
        newCells[i][j] = '';
        
        // 対称行列モードが有効で、対称可能な領域内の非対角成分の場合
        const minDim = Math.min(matrix.rows, matrix.cols);
        if (symmetricMode && 
            i < minDim && 
            j < minDim &&
            i !== j) {
          newCells[j][i] = '';
        }
      }
    }

    setMatrix(prev => ({ ...prev, cells: newCells }));
    
    // アクティブセルの内容も更新
    if (activeCell.row >= minRow && activeCell.row <= maxRow &&
        activeCell.col >= minCol && activeCell.col <= maxCol) {
      setCurrentCellContent('');
    }
    
    // セルの再レンダリング
    setTimeout(() => {
      if (window.katex) {
        renderAllCells();
        generateLatex();
      }
    }, 0);
  };

  // クリップボードデータを貼り付け
  const pasteClipboardData = () => {
    if (!clipboardData) return;

    const startRow = activeCell.row;
    const startCol = activeCell.col;
    const newCells = [...matrix.cells];

    // 必要に応じて行列を拡張
    const requiredRows = startRow + clipboardData.length;
    const requiredCols = startCol + (clipboardData[0]?.length || 0);

    // 行を追加
    while (newCells.length < requiredRows) {
      newCells.push(Array(matrix.cols).fill(''));
    }

    // 列を追加
    if (requiredCols > matrix.cols) {
      const additionalCols = requiredCols - matrix.cols;
      newCells.forEach(row => {
        for (let i = 0; i < additionalCols; i++) {
          row.push('');
        }
      });
    }

    // データを貼り付け
    clipboardData.forEach((row, i) => {
      row.forEach((cell, j) => {
        const targetRow = startRow + i;
        const targetCol = startCol + j;
        if (targetRow < newCells.length && targetCol < newCells[targetRow].length) {
          newCells[targetRow][targetCol] = cell;
          
          // 対称行列モードが有効で、対称可能な領域内の非対角成分の場合
          const minDim = Math.min(newCells.length, Math.max(...newCells.map(row => row.length)));
          if (symmetricMode && 
              targetRow < minDim && 
              targetCol < minDim &&
              targetRow !== targetCol) {
            newCells[targetCol][targetRow] = cell;
          }
        }
      });
    });

    const newMatrix = {
      ...matrix,
      rows: newCells.length,
      cols: Math.max(...newCells.map(row => row.length)),
      cells: newCells
    };
    
    // アクティブセルの内容も更新
    setCurrentCellContent(newCells[activeCell.row][activeCell.col] || '');
    
    setMatrix(newMatrix);
    addToHistory(newMatrix, activeCell);
    
    // セルの再レンダリング
    setTimeout(() => {
      if (window.katex) {
        renderAllCells();
        generateLatex();
      }
    }, 0);
  };

  // 行を任意の位置に挿入
  const insertRowAt = (index: number, before: boolean = false) => {
    const insertIndex = before ? index : index + 1;
    const newRow = Array(matrix.cols).fill('');
    const newCells = [...matrix.cells];
    newCells.splice(insertIndex, 0, newRow);

    const newMatrix = {
      ...matrix,
      rows: matrix.rows + 1,
      cells: newCells
    };

    const newActiveCell = activeCell.row >= insertIndex 
      ? { ...activeCell, row: activeCell.row + 1 }
      : activeCell;

    setMatrix(newMatrix);
    setActiveCell(newActiveCell);
    addToHistory(newMatrix, newActiveCell);
  };

  // 列を任意の位置に挿入
  const insertColAt = (index: number, before: boolean = false) => {
    const insertIndex = before ? index : index + 1;
    const newCells = matrix.cells.map(row => {
      const newRow = [...row];
      newRow.splice(insertIndex, 0, '');
      return newRow;
    });

    const newMatrix = {
      ...matrix,
      cols: matrix.cols + 1,
      cells: newCells
    };

    const newActiveCell = activeCell.col >= insertIndex 
      ? { ...activeCell, col: activeCell.col + 1 }
      : activeCell;

    setMatrix(newMatrix);
    setActiveCell(newActiveCell);
    addToHistory(newMatrix, newActiveCell);
  };

  // 行を削除
  const deleteRowAt = (index: number) => {
    if (matrix.rows <= 1) return;

    const newCells = matrix.cells.filter((_, i) => i !== index);
    const newMatrix = {
      ...matrix,
      rows: matrix.rows - 1,
      cells: newCells
    };

    const newActiveCell = activeCell.row >= index && activeCell.row > 0
      ? { ...activeCell, row: activeCell.row - 1 }
      : activeCell.row >= newMatrix.rows
      ? { ...activeCell, row: newMatrix.rows - 1 }
      : activeCell;

    setMatrix(newMatrix);
    setActiveCell(newActiveCell);
    addToHistory(newMatrix, newActiveCell);
  };

  // 列を削除
  const deleteColAt = (index: number) => {
    if (matrix.cols <= 1) return;

    const newCells = matrix.cells.map(row => row.filter((_, j) => j !== index));
    const newMatrix = {
      ...matrix,
      cols: matrix.cols - 1,
      cells: newCells
    };

    const newActiveCell = activeCell.col >= index && activeCell.col > 0
      ? { ...activeCell, col: activeCell.col - 1 }
      : activeCell.col >= newMatrix.cols
      ? { ...activeCell, col: newMatrix.cols - 1 }
      : activeCell;

    setMatrix(newMatrix);
    setActiveCell(newActiveCell);
    addToHistory(newMatrix, newActiveCell);
  };

  // コンテキストメニューを表示
  const showContextMenu = (e: React.MouseEvent, type: 'row' | 'col' | 'cell', index: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type,
      index
    });
  };

  // LaTeXコード解析
  const parseLatexMatrix = (latexCode: string) => {
    try {
      setParseError('');
      
      // matrix環境を抽出
      const matrixRegex = /\\begin\{(\w+matrix)\}([\s\S]*?)\\end\{\1\}/;
      const match = latexCode.match(matrixRegex);
      
      if (!match) {
        throw new Error('Valid matrix environment not found');
      }
      
      const matrixType = match[1];
      const content = match[2].trim();
      
      // 行を分割（\\で区切り）
      const rows = content.split('\\\\').map(row => row.trim()).filter(row => row);
      
      if (rows.length === 0) {
        throw new Error('No matrix rows found');
      }
      
      // 各行のセルを分割（&で区切り）
      const cells = rows.map(row => 
        row.split('&').map(cell => cell.trim())
      );
      
      // 列数を統一（最大列数に合わせる）
      const maxCols = Math.max(...cells.map(row => row.length));
      const normalizedCells = cells.map(row => {
        while (row.length < maxCols) {
          row.push('');
        }
        return row;
      });
      
      // 状態を更新
      setMatrix({
        type: matrixType,
        rows: normalizedCells.length,
        cols: maxCols,
        cells: normalizedCells
      });
      
      // アクティブセルをリセット
      setActiveCell({ row: 0, col: 0 });
      setSelectedRange({ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
      setSelectionMode('single');
      
      // 編集ボックスの内容も更新
      setCurrentCellContent(normalizedCells[0][0] || '');
      
      // セルの再レンダリング
      setTimeout(() => {
        if (window.katex) {
          renderAllCells();
          setSyncDirection('idle');
          setTimeout(() => {
            generateLatex();
          }, 10);
        }
      }, 50);
      
    } catch (error) {
      setParseError((error as Error).message);
    }
  };

  // LaTeXコード生成
  const generateLatex = () => {
    if (syncDirection === 'code-to-table') {
      return;
    }
    
    const { type, cells } = matrix;
    const matrixContent = cells.map(row => 
      row.map(cell => {
        if (isZeroValue(cell) && !showZeros) {
          return ''; // ゼロ成分をブランクに
        }
        return cell || '0'; // ゼロ成分を明示的に表示
      }).join(' & ')
    ).join(' \\\\\n');
    
    const latexString = `\\begin{${type}}\n${matrixContent}\n\\end{${type}}`;
    setLatexCode(latexString);
    
    // 通常のレンダリング
    if (window.katex && previewRef.current) {
      try {
        window.katex.render(latexString, previewRef.current, {
          displayMode: true,
          throwOnError: false,
          output: 'mathml'
        });
        
        // ハイライト適用
        setTimeout(() => applyHighlight(), 50);
      } catch (error) {
        previewRef.current.innerHTML = `<span style="color: red;">Rendering error: ${(error as Error).message}</span>`;
      }
    }
  };

  // セルの数式をレンダリング
  const renderCellContent = (row: number, col: number, content: string) => {
    const cellKey = `${row}-${col}`;
    const cellElement = cellKatexRefs.current[cellKey];
    
    if (cellElement && window.katex) {
      // ゼロ成分の表示切り替え
      const displayContent = isZeroValue(content) && !showZeros ? '' : (content || '0');
      
      try {
        window.katex.render(displayContent, cellElement, {
          displayMode: false,
          throwOnError: false,
          output: 'mathml'
        });
        
        // セルサイズに合わせてスケール調整
        setTimeout(() => adjustCellScale(cellElement), 0);
      } catch (error) {
        try {
          window.katex.render(displayContent, cellElement, {
            displayMode: false,
            throwOnError: false,
            output: 'mathml'
          });
        } catch (secondError) {
          cellElement.textContent = displayContent;
        }
        
        setTimeout(() => {
          if (window.katex && cellElement) {
            try {
              window.katex.render(displayContent, cellElement, {
                displayMode: false,
                throwOnError: false,
                output: 'mathml'
              });
              setTimeout(() => adjustCellScale(cellElement), 0);
            } catch (retryError) {
            }
          }
        }, 100);
      }
    }
  };

  // セル内容のスケール調整
  const adjustCellScale = (cellElement: HTMLElement) => {
    if (!cellElement) return;
    
    const container = cellElement.parentElement;
    if (!container) return;
    
    // リセット
    cellElement.style.transform = '';
    cellElement.style.fontSize = '';
    
    const containerWidth = container.clientWidth - 8; // パディング考慮
    const containerHeight = container.clientHeight - 8;
    const contentWidth = cellElement.scrollWidth;
    const contentHeight = cellElement.scrollHeight;
    
    if (contentWidth > containerWidth || contentHeight > containerHeight) {
      const scaleX = containerWidth / contentWidth;
      const scaleY = containerHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      if (scale < 1) {
        cellElement.style.transform = `scale(${scale})`;
        cellElement.style.transformOrigin = 'center';
      }
    }
  };

  // 全セルの数式をレンダリング
  const renderAllCells = () => {
    if (!window.katex) return;
    
    matrix.cells.forEach((row, i) => {
      row.forEach((cell, j) => {
        renderCellContent(i, j, cell);
      });
    });
  };

  // ハイライト適用
  const applyHighlight = () => {
    if (!previewRef.current) return;
    
    // ハイライト用の特別なレンダリング
    const { type, cells } = matrix;
    const minDim = Math.min(matrix.rows, matrix.cols);
    const highlightCells = cells.map((row, i) => 
      row.map((cell, j) => {
        const displayContent = isZeroValue(cell) && !showZeros ? '' : (cell || '0');
        if (isCellInSelection(i, j)) {
          // 選択されたセルに色とスタイルを適用
          return `\\color{red}{\\mathbf{${displayContent}}}`;
        }
        // 対称行列モードが有効で、対称成分を明るいグリーンでハイライト
        if (symmetricMode && 
            i < minDim && j < minDim &&
            i === activeCell.col && j === activeCell.row &&
            activeCell.row !== activeCell.col) {
          return `\\color{lime}{\\mathbf{${displayContent}}}`;
        }
        return displayContent;
      })
    );
    
    const highlightMatrixContent = highlightCells.map(row => 
      row.join(' & ')
    ).join(' \\\\\n');
    
    const highlightLatexString = `\\begin{${type}}\n${highlightMatrixContent}\n\\end{${type}}`;
    
    if (window.katex && previewRef.current) {
      try {
        window.katex.render(highlightLatexString, previewRef.current, {
          displayMode: true,
          throwOnError: false,
          output: 'mathml'
        });
      } catch (error) {
        // エラーの場合は通常のレンダリングに戻す
        const normalLatexString = `\\begin{${type}}\n${cells.map(row => row.map(cell => (isZeroValue(cell) && !showZeros) ? '' : (cell || '0')).join(' & ')).join(' \\\\\n')}\n\\end{${type}}`;
        window.katex.render(normalLatexString, previewRef.current, {
          displayMode: true,
          throwOnError: false,
          output: 'mathml'
        });
      }
    }
  };

  // 現在のセル内容を更新（対称行列モード対応）
  const updateCurrentCell = (value: string) => {
    setCurrentCellContent(value);
    
    setSyncDirection('table-to-code');
    
    let newCells;
    
    setTimeout(() => {
      setSyncDirection('idle');
    }, 100);
    
    // 対称行列モードが有効で、対称可能な領域内の非対角成分の場合
    const minDim = Math.min(matrix.rows, matrix.cols);
    if (symmetricMode && 
        activeCell.row < minDim && 
        activeCell.col < minDim &&
        activeCell.row !== activeCell.col) {
      
      // 対称位置も更新
      newCells = matrix.cells.map((r, i) => 
        r.map((c, j) => {
          if (i === activeCell.row && j === activeCell.col) return value;
          if (i === activeCell.col && j === activeCell.row) return value;
          return c;
        })
      );
      
      // 対称位置のセルも再レンダリング（強制的に）
      if (window.katex) {
        renderCellContent(activeCell.col, activeCell.row, value);
        renderCellContent(activeCell.row, activeCell.col, value);
        generateLatex();
      }
      setTimeout(() => {
        if (window.katex) {
          renderCellContent(activeCell.col, activeCell.row, value);
          renderCellContent(activeCell.row, activeCell.col, value); // 現在のセルも強制再レンダリング
          generateLatex(); // プレビューも確実に更新
        }
      }, 50);
    } else {
      // 通常の更新
      newCells = matrix.cells.map((r, i) => 
        r.map((c, j) => (i === activeCell.row && j === activeCell.col) ? value : c)
      );
      
      // 対称モードではない場合も確実にプレビュー更新と現在セルの強制再レンダリング
      if (window.katex) {
        renderCellContent(activeCell.row, activeCell.col, value);
        generateLatex();
      }
      setTimeout(() => {
        if (window.katex) {
          renderCellContent(activeCell.row, activeCell.col, value); // 現在のセルを強制再レンダリング
          generateLatex();
        }
      }, 50);
    }
    
    const newMatrix = { ...matrix, cells: newCells };
    setMatrix(newMatrix);
  };

  const commitCellEdit = (value: string) => {
    updateCurrentCell(value);
    const newCells = matrix.cells.map((r, i) => 
      r.map((c, j) => (i === activeCell.row && j === activeCell.col) ? value : c)
    );
    const newMatrix = { ...matrix, cells: newCells };
    addToHistory(newMatrix, activeCell);
    
    if (window.katex) {
      renderCellContent(activeCell.row, activeCell.col, value);
    }
  };

  // 行列タイプ変更
  const changeMatrixType = (type: string) => {
    const newMatrix = { ...matrix, type };
    setMatrix(newMatrix);
    addToHistory(newMatrix, activeCell);
  };

  // 対称行列への変換を実行
  const applySymmetricTransformation = () => {
    const minDim = Math.min(matrix.rows, matrix.cols);
    const newCells = matrix.cells.map((row, _) => [...row]);
    
    for (let i = 0; i < minDim; i++) {
      for (let j = i + 1; j < minDim; j++) { // 上三角部分のみを処理
        if (triangularPreference === 'upper') {
          // 上三角優先：上三角の値を下三角にコピー
          newCells[j][i] = newCells[i][j];
        } else {
          // 下三角優先：下三角の値を上三角にコピー
          newCells[i][j] = newCells[j][i];
        }
      }
    }
    
    const newMatrix = { ...matrix, cells: newCells };
    setMatrix(newMatrix);
    addToHistory(newMatrix, activeCell);
    
    // 現在のセルの内容も更新
    setCurrentCellContent(newCells[activeCell.row][activeCell.col] || '');
    
    // セルの再レンダリングと同期
    setTimeout(() => {
      if (window.katex) {
        renderAllCells();
        generateLatex(); // プレビューも確実に更新
      }
    }, 0);
  };

  // 対称行列モード切り替え
  const toggleSymmetricMode = () => {
    const newSymmetricMode = !symmetricMode;
    setSymmetricMode(newSymmetricMode);
    
    // 対称モードをONにした時は自動的に対称変換を実行
    if (newSymmetricMode) {
      // 少し遅延させて状態が確実に更新されてから実行
      setTimeout(() => {
        applySymmetricTransformation();
      }, 50);
    }
  };

  // セルにフォーカスを移動するユーティリティ関数
  const focusCell = (row: number, col: number) => {
    const tableElement = tableRef.current;
    if (!tableElement) return;
    
    // テーブル内の指定されたセルを検索（行・列ヘッダーを除く）
    const cellSelector = `[data-row="${row}"][data-col="${col}"]`;
    const cellElement = tableElement.querySelector(cellSelector) as HTMLElement;
    
    if (cellElement) {
      cellElement.focus();
    }
  };

  // キーボードナビゲーション（簡素化版）
  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    let newRow = row;
    let newCol = col;
    let shouldMove = true;
    
    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Tab: 左に移動、行の端で上の行の最後へ
          if (col > 0) {
            newCol = col - 1;
          } else if (row > 0) {
            newRow = row - 1;
            newCol = matrix.cols - 1;
          } else {
            newRow = matrix.rows - 1;
            newCol = matrix.cols - 1;
          }
        } else {
          // Tab: 右に移動、行の端で次の行の最初へ
          if (col < matrix.cols - 1) {
            newCol = col + 1;
          } else if (row < matrix.rows - 1) {
            newRow = row + 1;
            newCol = 0;
          } else {
            newRow = 0;
            newCol = 0;
          }
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (row > 0) {
          newRow = row - 1;
        } else {
          shouldMove = false; // 境界で停止
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (row < matrix.rows - 1) {
          newRow = row + 1;
        } else {
          shouldMove = false; // 境界で停止
        }
        break;
      case 'Enter':
        e.preventDefault();
        // セル編集テキストボックスにフォーカスを移動
        if (cellEditorRef.current) {
          cellEditorRef.current.focus();
          cellEditorRef.current.select(); // テキストを全選択
        }
        return; // セル移動は行わない
      case 'ArrowLeft':
        e.preventDefault();
        if (col > 0) {
          newCol = col - 1;
        } else {
          shouldMove = false; // 境界で停止
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (col < matrix.cols - 1) {
          newCol = col + 1;
        } else {
          shouldMove = false; // 境界で停止
        }
        break;
      default:
        return;
    }
    
    if (shouldMove) {
      selectCell(newRow, newCol, e.shiftKey);
      // 移動先のセルにフォーカスを移動
      setTimeout(() => focusCell(newRow, newCol), 0);
    }
  };

  // LaTeXコード手動編集
  const handleLatexCodeChange = (value: string) => {
    setLatexCode(value);
    
    const currentLength = latexCode.length;
    const newLength = value.length;
    const isLargeChange = Math.abs(newLength - currentLength) > 20;
    
    setSyncDirection('code-to-table');
    
    if (isLargeChange) {
      parseLatexMatrix(value);
    } else {
      clearTimeout(window.parseTimeout);
      window.parseTimeout = setTimeout(() => {
        parseLatexMatrix(value);
      }, 500);
    }
  };

  // セルの値がゼロかどうかを判定
  const isZeroValue = (value: string): boolean => {
    if (!value || value.trim() === '') return true;
    const numValue = parseFloat(value.trim());
    return !isNaN(numValue) && numValue === 0;
  };

  const addToHistory = (newMatrix: MatrixData, newActiveCell: CellPosition) => {
    setUndoRedoState(prev => {
      const newHistory = prev.history.slice(0, prev.currentIndex + 1);
      newHistory.push({
        matrix: newMatrix,
        activeCell: newActiveCell,
        timestamp: Date.now()
      });
      
      if (newHistory.length > 50) {
        newHistory.shift();
        return {
          history: newHistory,
          currentIndex: newHistory.length - 1
        };
      }
      
      return {
        history: newHistory,
        currentIndex: newHistory.length - 1
      };
    });
  };

  const undo = () => {
    if (undoRedoState.currentIndex > 0) {
      const newIndex = undoRedoState.currentIndex - 1;
      const historyEntry = undoRedoState.history[newIndex];
      
      setMatrix(historyEntry.matrix);
      setActiveCell(historyEntry.activeCell);
      setCurrentCellContent(historyEntry.matrix.cells[historyEntry.activeCell.row][historyEntry.activeCell.col]);
      setUndoRedoState(prev => ({ ...prev, currentIndex: newIndex }));
      
      if (cellEditorRef.current) {
        cellEditorRef.current.blur();
      }
    }
  };

  const redo = () => {
    if (undoRedoState.currentIndex < undoRedoState.history.length - 1) {
      const newIndex = undoRedoState.currentIndex + 1;
      const historyEntry = undoRedoState.history[newIndex];
      
      setMatrix(historyEntry.matrix);
      setActiveCell(historyEntry.activeCell);
      setCurrentCellContent(historyEntry.matrix.cells[historyEntry.activeCell.row][historyEntry.activeCell.col]);
      setUndoRedoState(prev => ({ ...prev, currentIndex: newIndex }));
      
      if (cellEditorRef.current) {
        cellEditorRef.current.blur();
      }
    }
  };

  const canUndo = undoRedoState.currentIndex > 0;
  const canRedo = undoRedoState.currentIndex < undoRedoState.history.length - 1;

  // コピー機能
  const copyToClipboard = () => {
    navigator.clipboard.writeText(latexCode).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // キーボードイベントリスナー（行列テーブルにフォーカスがある場合のみ）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      if (!activeElement) return;
      
      const isInCellEditor = cellEditorRef.current && activeElement === cellEditorRef.current;
      const isInLatexTextarea = activeElement.tagName.toLowerCase() === 'textarea' && 
                               activeElement.className.includes('font-mono');
      const isInOtherInput = activeElement.tagName.toLowerCase() === 'input' || 
                            activeElement.tagName.toLowerCase() === 'textarea' ||
                            activeElement.contentEditable === 'true';
      
      if (isInCellEditor || isInLatexTextarea) return;
      
      if (isInOtherInput) return;
      
      const matrixEditor = document.querySelector('.latex-matrix-editor');
      const isInMatrixEditor = matrixEditor && (
        matrixEditor.contains(activeElement) ||
        activeElement.closest('.latex-matrix-editor')
      );
      
      if (!isInMatrixEditor) return;
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'c':
            e.preventDefault();
            e.stopPropagation();
            copySelectedCells();
            break;
          case 'v':
            e.preventDefault();
            e.stopPropagation();
            pasteClipboardData();
            break;
          case 'a':
            e.preventDefault();
            e.stopPropagation();
            selectAllCells();
            break;
          case 'z':
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            break;
          case 'y':
            e.preventDefault();
            e.stopPropagation();
            redo();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedRange, clipboardData, undo, redo, copySelectedCells, pasteClipboardData, selectAllCells]);

  return (
    <div className="w-full px-4 py-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-200">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">
        LaTeX Matrix Editor
      </h1>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Editor Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">Matrix Editor</h2>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-6 h-6 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300 text-sm font-bold transition-colors"
              title="Show help"
            >
              ?
            </button>
          </div>
          
          {/* Controls */}
          <div className="mb-4 space-y-3">
            {/* Matrix Type */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                Matrix Type
              </label>
              <select 
                value={matrix.type}
                onChange={(e) => changeMatrixType(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="matrix">matrix (no brackets)</option>
                <option value="pmatrix">pmatrix ( )</option>
                <option value="bmatrix">bmatrix [ ]</option>
                <option value="vmatrix">vmatrix | |</option>
                <option value="Vmatrix">Vmatrix || ||</option>
                <option value="smallmatrix">smallmatrix</option>
              </select>
            </div>
            
            {/* Undo/Redo Controls */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Undo/Redo
              </label>
              <div className="flex gap-2">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    canUndo
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Undo (Ctrl+Z)"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    canRedo
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
                >
                  ↷ Redo
                </button>
              </div>
            </div>
            
            {/* Matrix Info */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                Size: {matrix.rows} × {matrix.cols}
              </label>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Selected: Row {activeCell.row + 1}, Col {activeCell.col + 1}
                {selectionMode === 'range' && (
                  <span className="ml-2">
                    Range: ({Math.min(selectedRange.start.row, selectedRange.end.row) + 1},{Math.min(selectedRange.start.col, selectedRange.end.col) + 1}) to ({Math.max(selectedRange.start.row, selectedRange.end.row) + 1},{Math.max(selectedRange.start.col, selectedRange.end.col) + 1})
                  </span>
                )}
              </div>
            </div>
            
            

            {/* Display Options */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                Display Options
              </label>
              <div className="flex gap-2 flex-wrap items-center">
                <button 
                  onClick={() => setShowZeros(!showZeros)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    showZeros 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                >
                  Show Zeros: {showZeros ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Symmetric Matrix Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                Symmetric Matrix Mode
              </label>
              <div className="flex gap-2 flex-wrap items-center">
                <button 
                  onClick={toggleSymmetricMode}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    symmetricMode 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                >
                  {symmetricMode ? 'ON' : 'OFF'}
                </button>
                <button 
                  onClick={() => {
                    setTriangularPreference(prev => {
                      const newPref = prev === 'upper' ? 'lower' : 'upper';
                      // 対称モードが有効な場合のみ設定変更後に対称変換を再適用
                      if (symmetricMode) {
                        setTimeout(() => {
                          applySymmetricTransformation();
                        }, 50);
                      }
                      return newPref;
                    });
                  }}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    triangularPreference === 'upper' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-orange-500 text-white'
                  }`}
                >
                  Priority: {triangularPreference === 'upper' ? 'Upper ▲' : 'Lower ▼'}
                </button>
                {matrix.rows !== matrix.cols && (
                  <span className="text-xs text-orange-500 dark:text-orange-400">Non-square: symmetric editing available for {Math.min(matrix.rows, matrix.cols)}×{Math.min(matrix.rows, matrix.cols)} portion</span>
                )}
                {symmetricMode && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">Auto-symmetric editing enabled</span>
                )}
              </div>
            </div>

            {/* Import LaTeX - Hidden for now */}
            {/* 
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Import from LaTeX
              </label>
              <button 
                onClick={() => {
                  const input = prompt('Paste your LaTeX matrix code:');
                  if (input) {
                    parseLatexMatrix(input);
                  }
                }}
                className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
              >
                Import LaTeX
              </button>
              {parseError && (
                <div className="mt-2 text-red-600 text-xs">
                  Parse error: {parseError}
                </div>
              )}
            </div>
            */}
          </div>
          
          {/* Matrix Table */}
          <div className="matrix-table-container overflow-x-auto overflow-y-visible max-w-full">
            <table ref={tableRef} className="matrix-table" style={{ margin: '20px auto', minWidth: 'fit-content' }}>
              <thead>
                <tr>
                  <th className="matrix-col-header w-8"></th>
                  {Array.from({ length: matrix.cols }, (_, j) => (
                    <th key={j} className="matrix-col-header" style={{ position: 'relative' }}>
                      {j + 1}
                      <div className="col-controls">
                        <button
                          className="insert-btn"
                          onClick={() => insertColAt(j, true)}
                          title={`Insert column before column ${j + 1}`}
                        >
                          ←
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => deleteColAt(j)}
                          title={`Delete column ${j + 1}`}
                          disabled={matrix.cols <= 1}
                        >
                          ×
                        </button>
                        <button
                          className="insert-btn"
                          onClick={() => insertColAt(j)}
                          title={`Insert column after column ${j + 1}`}
                        >
                          →
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.cells.map((row, i) => (
                  <tr key={i} className="matrix-row">
                    <td 
                      className="matrix-row-header" 
                      onContextMenu={(e) => showContextMenu(e, 'row', i)}
                    >
                      {i + 1}
                      <div className="row-controls">
                        <button
                          className="insert-btn"
                          onClick={() => insertRowAt(i, true)}
                          title={`Insert row before row ${i + 1}`}
                        >
                          ↑
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => deleteRowAt(i)}
                          title={`Delete row ${i + 1}`}
                          disabled={matrix.rows <= 1}
                        >
                          ×
                        </button>
                        <button
                          className="insert-btn"
                          onClick={() => insertRowAt(i)}
                          title={`Insert row after row ${i + 1}`}
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    {row.map((cell, j) => {
                      const isSelected = isCellInSelection(i, j);
                      const isActive = activeCell.row === i && activeCell.col === j;
                      const minDim = Math.min(matrix.rows, matrix.cols);
                      const isInSymmetricRegion = i < minDim && j < minDim;
                      const isSymmetricPair = symmetricMode && 
                                            isInSymmetricRegion &&
                                            activeCell.row === j && 
                                            activeCell.col === i && 
                                            i !== j;
                      const isDiagonal = i === j;
                      
                      return (
                        <td key={j}>
                          <div
                            tabIndex={0}
                            data-row={i}
                            data-col={j}
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey) {
                                // Ctrl+クリックで複数選択モード
                                if (selectionMode === 'single') {
                                  setSelectionMode('range');
                                  setSelectedRange({ start: activeCell, end: { row: i, col: j } });
                                } else {
                                  setSelectedRange(prev => ({ ...prev, end: { row: i, col: j } }));
                                }
                              } else if (e.shiftKey) {
                                // Shift+クリックで範囲選択
                                selectCell(i, j, true);
                              } else {
                                // 通常のクリック
                                selectCell(i, j);
                              }
                              // クリック後にセルにフォーカスを設定
                              e.currentTarget.focus();
                            }}
                            onMouseDown={(e) => {
                              if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                                startRangeSelection(i, j);
                              }
                            }}
                            onMouseEnter={() => updateRangeSelection(i, j)}
                            onMouseUp={() => endRangeSelection()}
                            onKeyDown={(e) => handleKeyDown(e, i, j)}
                            onContextMenu={(e) => showContextMenu(e, 'cell', i * matrix.cols + j)}
                            className={`w-20 h-12 border-2 rounded-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center relative overflow-hidden matrix-cell ${
                              isActive
                                ? 'selected'
                                : isSelected
                                ? 'in-selection'
                                : isSymmetricPair
                                ? 'border-green-400 bg-green-50 dark:bg-green-900'
                                : isDiagonal
                                ? 'border-gray-300 dark:border-gray-600 bg-yellow-50 dark:bg-yellow-900 hover:border-gray-400 dark:hover:border-gray-500'
                                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                            }`}
                          >
                            <div
                              ref={(el) => {
                                if (el) cellKatexRefs.current[`${i}-${j}`] = el;
                              }}
                              className="katex-cell text-center max-w-full max-h-full"
                              style={{ 
                                fontSize: '14px',
                                lineHeight: '1.2'
                              }}
                            >
                              {cell || '0'}
                            </div>
                            {isSymmetricPair && (
                              <div className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-full"></div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cell Editor */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
              Edit Cell ({activeCell.row + 1}, {activeCell.col + 1})
            </label>
            <input
              ref={cellEditorRef}
              type="text"
              value={currentCellContent}
              onChange={(e) => updateCurrentCell(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCellEdit(currentCellContent);
                  e.currentTarget.blur(); // フォーカスを外す
                  // アクティブセルにフォーカスを戻す
                  focusCell(activeCell.row, activeCell.col);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEscapePressed(true);
                  setCurrentCellContent(originalCellContent);
                  
                  const newCells = matrix.cells.map((row, rowIndex) =>
                    row.map((cell, colIndex) =>
                      rowIndex === activeCell.row && colIndex === activeCell.col
                        ? originalCellContent
                        : cell
                    )
                  );
                  setMatrix({ ...matrix, cells: newCells });
                  
                  e.currentTarget.blur(); // フォーカスを外す
                  // アクティブセルにフォーカスを戻す
                  focusCell(activeCell.row, activeCell.col);
                  
                  setTimeout(() => setIsEscapePressed(false), 100);
                }
              }}
              onBlur={() => {
                if (!isEscapePressed) {
                  commitCellEdit(currentCellContent);
                }
              }}
              onBlur={() => {
                if (window.katex) {
                  renderCellContent(activeCell.row, activeCell.col, currentCellContent);
                  generateLatex();
                }
              }}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Enter LaTeX expression..."
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Tip: Use horizontal scroll in the table and preview areas when matrix is large
            </div>
          </div>
          
          {/* Help Popup */}
          {showHelp && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">How to Use</h3>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl font-bold"
                  >
                    ×
                  </button>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                  <p>• <strong>Selection:</strong> Click cells to select, drag to select range, Ctrl+click for multi-select</p>
                  <p>• <strong>Table Operations:</strong> Use +/- buttons on row/column headers for insertion/deletion</p>
                  <p>• <strong>Context Menu:</strong> Right-click for additional operations</p>
                  <p>• <strong>Keyboard Shortcuts:</strong> Ctrl+C/V for copy/paste, Ctrl+A for select all (when table is focused)</p>
                  <p>• <strong>Navigation:</strong> Tab/Shift+Tab and arrow keys for cell navigation</p>
                  <p>• <strong>Large Matrices:</strong> Both the table and preview areas support horizontal scrolling when content is wider than the panel</p>
                  <p>• <strong>Color Coding:</strong> Active cell (red in preview), symmetric pairs (lime in preview, green border/background), diagonal cells (yellow background), multi-selection (purple background)</p>
                  <p>• <strong>Symmetric Mode:</strong> Toggle ON for automatic symmetric matrix editing. Priority setting (Upper/Lower) can be set anytime and controls which triangular values are copied when mode is enabled. Works with non-square matrices for the symmetric portion.</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Preview Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transition-colors duration-200">
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">LaTeX Preview</h2>
          
          {/* Rendered Matrix */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg min-h-24 overflow-x-auto">
            <div className="flex items-center justify-center min-w-fit">
              <div ref={previewRef} className="text-center"></div>
            </div>
          </div>
          
          {/* LaTeX Code */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
                LaTeX Code (Editable)
              </label>
              <button
                onClick={copyToClipboard}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  copySuccess 
                    ? 'bg-green-500 text-white' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {copySuccess ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <textarea
              value={latexCode}
              onChange={(e) => handleLatexCodeChange(e.target.value)}
              className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-x-auto bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Paste LaTeX matrix code here or edit generated code..."
              style={{ resize: 'vertical' }}
            />
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <p>You can paste existing LaTeX matrix code here. Supported: matrix, pmatrix, bmatrix, vmatrix, Vmatrix, smallmatrix</p>
              {parseError && (
                <p className="text-red-600 dark:text-red-400 mt-1">Parse error: {parseError}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y 
          }}
        >
          {contextMenu.type === 'row' && (
            <>
              <div 
                className="context-menu-item"
                onClick={() => {
                  insertRowAt(contextMenu.index, true);
                  setContextMenu(null);
                }}
              >
                Insert Row Above
              </div>
              <div 
                className="context-menu-item"
                onClick={() => {
                  insertRowAt(contextMenu.index);
                  setContextMenu(null);
                }}
              >
                Insert Row Below
              </div>
              <div 
                className={`context-menu-item ${matrix.rows <= 1 ? 'disabled' : ''}`}
                onClick={() => {
                  if (matrix.rows > 1) {
                    deleteRowAt(contextMenu.index);
                    setContextMenu(null);
                  }
                }}
              >
                Delete Row
              </div>
            </>
          )}
          {contextMenu.type === 'col' && (
            <>
              <div 
                className="context-menu-item"
                onClick={() => {
                  insertColAt(contextMenu.index, true);
                  setContextMenu(null);
                }}
              >
                Insert Column Left
              </div>
              <div 
                className="context-menu-item"
                onClick={() => {
                  insertColAt(contextMenu.index);
                  setContextMenu(null);
                }}
              >
                Insert Column Right
              </div>
              <div 
                className={`context-menu-item ${matrix.cols <= 1 ? 'disabled' : ''}`}
                onClick={() => {
                  if (matrix.cols > 1) {
                    deleteColAt(contextMenu.index);
                    setContextMenu(null);
                  }
                }}
              >
                Delete Column
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LaTeXMatrixEditor;
