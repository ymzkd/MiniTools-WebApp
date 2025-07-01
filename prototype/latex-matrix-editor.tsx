import React, { useState, useEffect, useRef } from 'react';

// KaTeX CSS
const katexCSS = `
@import url('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.8/katex.min.css');

.katex-cell {
  transition: transform 0.1s ease;
}

.katex-cell .katex {
  font-size: inherit !important;
}

.katex-cell .katex-display {
  margin: 0 !important;
}
`;

const LaTeXMatrixEditor = () => {
  // 初期状態
  const [matrix, setMatrix] = useState({
    type: 'pmatrix',
    rows: 3,
    cols: 3,
    cells: [
      ['a_{11}', 'a_{12}', 'a_{13}'],
      ['a_{21}', 'a_{22}', 'a_{23}'],
      ['a_{31}', 'a_{32}', 'a_{33}']
    ]
  });
  
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const [currentCellContent, setCurrentCellContent] = useState('a_{11}');
  const [renderedLatex, setRenderedLatex] = useState('');
  const [latexCode, setLatexCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [parseError, setParseError] = useState('');
  const [symmetricMode, setSymmetricMode] = useState(false);
  
  const cellRefs = useRef({});
  const cellKatexRefs = useRef({});
  const previewRef = useRef(null);
  
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
  }, [activeCell]);

  // アクティブセル変更時に編集ボックスの内容を更新
  useEffect(() => {
    if (matrix.cells[activeCell.row] && matrix.cells[activeCell.row][activeCell.col] !== undefined) {
      setCurrentCellContent(matrix.cells[activeCell.row][activeCell.col]);
    }
  }, [activeCell, matrix.cells]);

  // セル内容変更時の個別レンダリング
  useEffect(() => {
    if (window.katex) {
      renderCellContent(activeCell.row, activeCell.col, currentCellContent);
    }
  }, [currentCellContent]);

  // LaTeXコード解析
  const parseLatexMatrix = (latexCode) => {
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
      
      // 編集ボックスの内容も更新
      setCurrentCellContent(normalizedCells[0][0] || '');
      
      // セルの再レンダリング
      setTimeout(() => {
        if (window.katex) {
          renderAllCells();
        }
      }, 0);
      
    } catch (error) {
      setParseError(error.message);
    }
  };

  // LaTeXコード生成
  const generateLatex = () => {
    const { type, cells } = matrix;
    const matrixContent = cells.map(row => 
      row.join(' & ')
    ).join(' \\\\ ');
    
    const latexString = `\\begin{${type}}\n${matrixContent}\n\\end{${type}}`;
    setLatexCode(latexString);
    
    // 通常のレンダリング
    if (window.katex && previewRef.current) {
      try {
        window.katex.render(latexString, previewRef.current, {
          displayMode: true,
          throwOnError: false
        });
        
        // ハイライト適用
        setTimeout(() => applyHighlight(), 50);
      } catch (error) {
        previewRef.current.innerHTML = `<span style="color: red;">Rendering error: ${error.message}</span>`;
      }
    }
  };

  // セルの数式をレンダリング
  const renderCellContent = (row, col, content) => {
    const cellKey = `${row}-${col}`;
    const cellElement = cellKatexRefs.current[cellKey];
    
    if (cellElement && window.katex) {
      try {
        // 空の場合は0を表示
        const displayContent = content || '0';
        
        window.katex.render(displayContent, cellElement, {
          displayMode: false,
          throwOnError: false
        });
        
        // セルサイズに合わせてスケール調整
        setTimeout(() => adjustCellScale(cellElement), 0);
      } catch (error) {
        cellElement.textContent = content || '0';
      }
    }
  };

  // セル内容のスケール調整
  const adjustCellScale = (cellElement) => {
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
  const applyHighlight = () => {
    if (!previewRef.current) return;
    
    // ハイライト用の特別なレンダリング
    const { type, cells } = matrix;
    const highlightCells = cells.map((row, i) => 
      row.map((cell, j) => {
        if (i === activeCell.row && j === activeCell.col) {
          // 選択されたセルに色とスタイルを適用
          return `\\color{red}{\\mathbf{${cell || '0'}}}`;
        }
        return cell || '0';
      })
    );
    
    const highlightMatrixContent = highlightCells.map(row => 
      row.join(' & ')
    ).join(' \\\\ ');
    
    const highlightLatexString = `\\begin{${type}}\n${highlightMatrixContent}\n\\end{${type}}`;
    
    if (window.katex && previewRef.current) {
      try {
        window.katex.render(highlightLatexString, previewRef.current, {
          displayMode: true,
          throwOnError: false
        });
      } catch (error) {
        // エラーの場合は通常のレンダリングに戻す
        const normalLatexString = `\\begin{${type}}\n${cells.map(row => row.map(cell => cell || '0').join(' & ')).join(' \\\\ ')}\n\\end{${type}}`;
        window.katex.render(normalLatexString, previewRef.current, {
          displayMode: true,
          throwOnError: false
        });
      }
    }
  };

  // セル値更新
  const updateCell = (row, col, value) => {
    const newCells = matrix.cells.map((r, i) => 
      r.map((c, j) => (i === row && j === col) ? value : c)
    );
    setMatrix(prev => ({ ...prev, cells: newCells }));
  };

  // 現在のセル内容を更新（対称行列モード対応）
  const updateCurrentCell = (value) => {
    setCurrentCellContent(value);
    
    // 通常の更新
    updateCell(activeCell.row, activeCell.col, value);
    
    // 対称行列モードが有効で、正方行列で、非対角成分の場合
    if (symmetricMode && 
        matrix.rows === matrix.cols && 
        activeCell.row !== activeCell.col &&
        activeCell.col < matrix.rows && 
        activeCell.row < matrix.cols) {
      
      // 対称位置も更新
      const newCells = matrix.cells.map((r, i) => 
        r.map((c, j) => {
          if (i === activeCell.row && j === activeCell.col) return value;
          if (i === activeCell.col && j === activeCell.row) return value; // 対称位置
          return c;
        })
      );
      setMatrix(prev => ({ ...prev, cells: newCells }));
      
      // 対称位置のセルも再レンダリング
      setTimeout(() => {
        if (window.katex) {
          renderCellContent(activeCell.col, activeCell.row, value);
        }
      }, 0);
    }
  };

  // セル選択
  const selectCell = (row, col) => {
    setActiveCell({ row, col });
  };

  // 行追加
  const addRow = () => {
    const newRow = Array(matrix.cols).fill('0');
    setMatrix(prev => ({
      ...prev,
      rows: prev.rows + 1,
      cells: [...prev.cells, newRow]
    }));
  };

  // 行削除
  const removeRow = () => {
    if (matrix.rows > 1) {
      setMatrix(prev => ({
        ...prev,
        rows: prev.rows - 1,
        cells: prev.cells.slice(0, -1)
      }));
      if (activeCell.row >= matrix.rows - 1) {
        setActiveCell(prev => ({ ...prev, row: matrix.rows - 2 }));
      }
    }
  };

  // 列追加
  const addColumn = () => {
    const newCells = matrix.cells.map(row => [...row, '0']);
    setMatrix(prev => ({
      ...prev,
      cols: prev.cols + 1,
      cells: newCells
    }));
  };

  // 列削除
  const removeColumn = () => {
    if (matrix.cols > 1) {
      const newCells = matrix.cells.map(row => row.slice(0, -1));
      setMatrix(prev => ({
        ...prev,
        cols: prev.cols - 1,
        cells: newCells
      }));
      if (activeCell.col >= matrix.cols - 1) {
        setActiveCell(prev => ({ ...prev, col: matrix.cols - 2 }));
      }
    }
  };

  // 行列タイプ変更
  const changeMatrixType = (type) => {
    setMatrix(prev => ({ ...prev, type }));
  };

  // 対称行列モード切り替え
  const toggleSymmetricMode = () => {
    setSymmetricMode(prev => !prev);
  };

  // 現在の行列を対称行列に変換
  const makeMatrixSymmetric = () => {
    if (matrix.rows !== matrix.cols) {
      alert('対称行列は正方行列である必要があります');
      return;
    }
    
    const newCells = matrix.cells.map((row, i) => 
      row.map((cell, j) => {
        if (i === j) {
          return cell; // 対角成分はそのまま
        } else if (i < j) {
          return cell; // 上三角はそのまま
        } else {
          return matrix.cells[j][i]; // 下三角は上三角からコピー
        }
      })
    );
    
    setMatrix(prev => ({ ...prev, cells: newCells }));
    
    // 現在のセルの内容も更新
    setCurrentCellContent(newCells[activeCell.row][activeCell.col] || '');
    
    // セルの再レンダリング
    setTimeout(() => {
      if (window.katex) {
        renderAllCells();
      }
    }, 0);
  };

  // プリセット設定
  const setPreset = (type) => {
    let newCells;
    
    switch (type) {
      case 'identity':
        newCells = matrix.cells.map((row, i) => 
          row.map((_, j) => i === j ? '1' : '0')
        );
        break;
      case 'zero':
        newCells = matrix.cells.map(row => row.map(() => '0'));
        break;
      case 'clear':
        newCells = matrix.cells.map(row => row.map(() => ''));
        break;
      case 'symmetric':
        // 対称行列のサンプルを生成
        if (matrix.rows === matrix.cols) {
          newCells = matrix.cells.map((row, i) => 
            row.map((_, j) => {
              if (i === j) return '1'; // 対角成分
              if (i < j) return `a_{${i+1}${j+1}}`; // 上三角
              return `a_{${j+1}${i+1}}`; // 下三角（対称）
            })
          );
        } else {
          alert('対称行列は正方行列である必要があります');
          return;
        }
        break;
      default:
        return;
    }
    
    setMatrix(prev => ({ ...prev, cells: newCells }));
    // 現在のセルの内容も更新
    setCurrentCellContent(newCells[activeCell.row][activeCell.col] || '');
    
    // セルの再レンダリング
    setTimeout(() => {
      if (window.katex) {
        renderAllCells();
      }
    }, 0);
  };

  // キーボードナビゲーション
  const handleKeyDown = (e, row, col) => {
    let newRow = row;
    let newCol = col;
    
    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          newCol = col > 0 ? col - 1 : matrix.cols - 1;
          if (newCol === matrix.cols - 1 && col === 0) {
            newRow = row > 0 ? row - 1 : matrix.rows - 1;
          }
        } else {
          newCol = col < matrix.cols - 1 ? col + 1 : 0;
          if (newCol === 0 && col === matrix.cols - 1) {
            newRow = row < matrix.rows - 1 ? row + 1 : 0;
          }
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        newRow = row > 0 ? row - 1 : matrix.rows - 1;
        break;
      case 'ArrowDown':
      case 'Enter':
        e.preventDefault();
        newRow = row < matrix.rows - 1 ? row + 1 : 0;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newCol = col > 0 ? col - 1 : matrix.cols - 1;
        if (newCol === matrix.cols - 1 && col === 0) {
          newRow = row > 0 ? row - 1 : matrix.rows - 1;
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        newCol = col < matrix.cols - 1 ? col + 1 : 0;
        if (newCol === 0 && col === matrix.cols - 1) {
          newRow = row < matrix.rows - 1 ? row + 1 : 0;
        }
        break;
      default:
        return;
    }
    
    selectCell(newRow, newCol);
  };

  // LaTeXコード手動編集
  const handleLatexCodeChange = (value) => {
    setLatexCode(value);
    
    // リアルタイムで解析を試行（デバウンス）
    clearTimeout(window.parseTimeout);
    window.parseTimeout = setTimeout(() => {
      parseLatexMatrix(value);
    }, 500);
  };

  // コピー機能
  const copyToClipboard = () => {
    navigator.clipboard.writeText(latexCode).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <style>{katexCSS}</style>
      
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
        LaTeX Matrix Editor
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Editor Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Matrix Editor</h2>
          
          {/* Controls */}
          <div className="mb-6 space-y-4">
            {/* Matrix Type */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Matrix Type
              </label>
              <select 
                value={matrix.type}
                onChange={(e) => changeMatrixType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="matrix">matrix (no brackets)</option>
                <option value="pmatrix">pmatrix ( )</option>
                <option value="bmatrix">bmatrix [ ]</option>
                <option value="vmatrix">vmatrix | |</option>
                <option value="Vmatrix">Vmatrix || ||</option>
                <option value="smallmatrix">smallmatrix</option>
              </select>
            </div>
            
            {/* Size Controls */}
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  Size: {matrix.rows} × {matrix.cols}
                </label>
                <div className="flex gap-2">
                  <button 
                    onClick={addRow}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    title={`Insert row after row ${activeCell.row + 1}`}
                  >
                    +Row
                  </button>
                  <button 
                    onClick={removeRow}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    disabled={matrix.rows <= 1}
                    title={`Delete row ${activeCell.row + 1}`}
                  >
                    -Row
                  </button>
                  <button 
                    onClick={addColumn}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    title={`Insert column after column ${activeCell.col + 1}`}
                  >
                    +Col
                  </button>
                  <button 
                    onClick={removeColumn}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    disabled={matrix.cols <= 1}
                    title={`Delete column ${activeCell.col + 1}`}
                  >
                    -Col
                  </button>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Selected: Row {activeCell.row + 1}, Col {activeCell.col + 1}
                </div>
              </div>
            </div>
            
            {/* Presets */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Presets
              </label>
              <div className="flex gap-2 flex-wrap">
                <button 
                  onClick={() => setPreset('identity')}
                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  Identity
                </button>
                <button 
                  onClick={() => setPreset('zero')}
                  className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                >
                  Zero
                </button>
                <button 
                  onClick={() => setPreset('clear')}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                >
                  Clear
                </button>
                <button 
                  onClick={() => setPreset('symmetric')}
                  className="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm"
                  disabled={matrix.rows !== matrix.cols}
                >
                  Symmetric
                </button>
              </div>
            </div>

            {/* Symmetric Matrix Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Symmetric Matrix Mode
              </label>
              <div className="flex gap-2 flex-wrap items-center">
                <button 
                  onClick={toggleSymmetricMode}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    symmetricMode 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                  }`}
                >
                  {symmetricMode ? 'ON' : 'OFF'}
                </button>
                <button 
                  onClick={makeMatrixSymmetric}
                  className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
                  disabled={matrix.rows !== matrix.cols}
                >
                  Make Symmetric
                </button>
                {matrix.rows !== matrix.cols && (
                  <span className="text-xs text-red-500">Square matrix required</span>
                )}
                {symmetricMode && matrix.rows === matrix.cols && (
                  <span className="text-xs text-blue-600">Auto-symmetric editing enabled</span>
                )}
              </div>
            </div>

            {/* Import LaTeX */}
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
          </div>
          
          {/* Matrix Table */}
          <div className="overflow-auto">
            <table className="mx-auto border-collapse">
              <tbody>
                {matrix.cells.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => {
                      const isActive = activeCell.row === i && activeCell.col === j;
                      const isSymmetricPair = symmetricMode && 
                                            matrix.rows === matrix.cols && 
                                            activeCell.row === j && 
                                            activeCell.col === i && 
                                            i !== j;
                      
                      return (
                        <td key={j} className="p-1">
                          <div
                            tabIndex={0}
                            onClick={() => selectCell(i, j)}
                            onKeyDown={(e) => handleKeyDown(e, i, j)}
                            className={`w-20 h-12 border-2 rounded-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center relative overflow-hidden ${
                              isActive
                                ? 'border-blue-500 bg-blue-50'
                                : isSymmetricPair
                                ? 'border-purple-400 bg-purple-50'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            <div
                              ref={(el) => cellKatexRefs.current[`${i}-${j}`] = el}
                              className="katex-cell text-center max-w-full max-h-full"
                              style={{ 
                                fontSize: '14px',
                                lineHeight: '1.2'
                              }}
                            >
                              {cell || '0'}
                            </div>
                            {isSymmetricPair && (
                              <div className="absolute top-0 right-0 w-2 h-2 bg-purple-400 rounded-full"></div>
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
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Edit Cell ({activeCell.row + 1}, {activeCell.col + 1})
            </label>
            <input
              type="text"
              value={currentCellContent}
              onChange={(e) => updateCurrentCell(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              placeholder="Enter LaTeX expression..."
            />
          </div>
          
          <div className="mt-4 text-xs text-gray-500">
            <p>Click on cells to select them, then edit in the text box above</p>
            <p>Each cell shows a scaled preview of the rendered formula</p>
            <p>Navigation: Tab/Shift+Tab, Arrow keys</p>
            <p>Row/Column operations are based on the currently selected cell</p>
            <p>Symmetric mode: Purple cells indicate symmetric pairs that will be updated together</p>
            <p>LaTeX syntax supported: ^{} for superscript, _{} for subscript, \frac{}{}, \sqrt{}, etc.</p>
          </div>
        </div>
        
        {/* Preview Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Preview</h2>
          
          {/* Rendered Matrix */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg min-h-32 flex items-center justify-center">
            <div ref={previewRef} className="text-center"></div>
          </div>
          
          {/* LaTeX Code */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-600">
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
              className="w-full h-32 p-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Paste LaTeX matrix code here or edit generated code..."
            />
            <div className="mt-2 text-xs text-gray-500">
              <p>You can paste existing LaTeX matrix code here. Supported: matrix, pmatrix, bmatrix, vmatrix, Vmatrix, smallmatrix</p>
              {parseError && (
                <p className="text-red-600 mt-1">Parse error: {parseError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LaTeXMatrixEditor;