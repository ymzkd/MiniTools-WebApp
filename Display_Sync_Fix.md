# Undo/Redo 表示同期問題の修正

## 🎯 問題の概要

Undo/Redoを実行した際に、以下の3つの表示要素が正しく同期されていませんでした：

1. **数式プレビュー**（行列全体のLaTeX表示）
2. **行列テーブル内の数式表示**（各セルのKaTeX表示）  
3. **セル編集用テキストボックス**（現在選択中セルの値）

## 🔧 修正内容

### 1. **強化された再レンダリング関数**

```typescript
const forceCompleteRerender = () => {
  const updateDisplays = () => {
    if (window.katex) {
      // 1. LaTeXコード生成（最初に実行）
      generateLatex();
      
      // 2. 全セルの再レンダリング
      renderAllCells();
      
      // 3. セル編集ボックスの内容を強制更新
      if (cellEditorRef.current && matrix.cells[activeCell.row] && matrix.cells[activeCell.row][activeCell.col] !== undefined) {
        const correctValue = matrix.cells[activeCell.row][activeCell.col];
        cellEditorRef.current.value = correctValue;
        // Reactの状態も確実に同期
        if (currentCellContent !== correctValue) {
          setCurrentCellContent(correctValue);
        }
      }
      
      // 4. アクティブセルのハイライト適用
      setTimeout(() => {
        applyHighlight();
      }, 30);
    }
  };
  
  // 段階的な再レンダリングで確実に同期
  updateDisplays(); // 即座に実行
  setTimeout(updateDisplays, 50); // 短い間隔で再実行
  setTimeout(updateDisplays, 150); // さらに確実にするため
  setTimeout(updateDisplays, 300); // 最終確認
};
```

### 2. **Undo/Redo処理の最適化**

```typescript
const undo = () => {
  // ... 状態復元処理 ...
  
  // Force complete re-render with multiple attempts to ensure synchronization
  setTimeout(() => {
    setIsUndoRedoOperation(false);
    
    // Force update of all display elements
    forceCompleteRerender();
  }, 50);
};
```

### 3. **useEffect による自動同期の強化**

#### アクティブセル変更時の処理
```typescript
useEffect(() => {
  // 前のセルの編集を完了（Undo/Redo操作中は除く）
  if (!isUndoRedoOperation) {
    finishCellEdit();
  }
  
  if (matrix.cells[activeCell.row] && matrix.cells[activeCell.row][activeCell.col] !== undefined) {
    const cellContent = matrix.cells[activeCell.row][activeCell.col];
    setCurrentCellContent(cellContent);
    
    // セル編集ボックスの内容も強制更新
    if (cellEditorRef.current) {
      cellEditorRef.current.value = cellContent;
    }
  }
}, [activeCell, matrix.cells, isUndoRedoOperation]);
```

#### 行列データ変更時の処理
```typescript
// 行列データ変更時の包括的な再レンダリング
useEffect(() => {
  if (window.katex && !isUndoRedoOperation) {
    generateLatex();
    renderAllCells();
  }
}, [matrix, isUndoRedoOperation]);
```

### 4. **型安全性の改善**

```typescript
// 型注釈を追加してTypeScriptエラーを解決
setActiveCell((prev: CellPosition) => ({ ...prev, row: prev.row + 1 }));
setMatrix((prev: MatrixData) => ({ ...prev, cells: newCells }));
const newCells = matrix.cells.map((row: string[]) => { /* ... */ });
```

## 🔄 修正された動作フロー

### Undo実行時
1. **編集完了**: 現在編集中の場合は先に編集を完了
2. **状態復元**: 履歴から対象状態を復元
3. **フラグ設定**: `isUndoRedoOperation = true`で無限ループを防止
4. **段階的再レンダリング**: 複数回のタイミングで表示要素を更新
5. **同期確認**: 数式プレビュー、テーブル、テキストボックスをすべて同期

### 各表示要素の更新順序
```
1. LaTeXコード生成 → 数式プレビューの更新
2. 全セルの再レンダリング → テーブル内の数式表示更新  
3. テキストボックス強制更新 → 現在セルの値を正確に表示
4. ハイライト適用 → 選択状態の視覚的反映
```

## 🚀 解決された問題

### Before (修正前)
- ✗ Undo後に数式プレビューが古い内容のまま
- ✗ テーブル内の数式表示が更新されない
- ✗ テキストボックスに間違った値が表示
- ✗ 表示要素間の不整合

### After (修正後)  
- ✅ **数式プレビュー**: 即座に正しい行列を表示
- ✅ **テーブル表示**: 全セルのKaTeX数式が正確に更新
- ✅ **テキストボックス**: 現在選択セルの正確な値を表示
- ✅ **完全同期**: すべての表示要素が確実に一致

## 💡 技術的なポイント

### 段階的再レンダリング
```typescript
updateDisplays(); // 即座に実行
setTimeout(updateDisplays, 50); // 短い間隔で再実行
setTimeout(updateDisplays, 150); // さらに確実にするため  
setTimeout(updateDisplays, 300); // 最終確認
```

複数のタイミングで再レンダリングを実行することで、React の状態更新の非同期性に対応し、確実にすべての表示要素が同期されます。

### DOM要素の直接操作
```typescript
if (cellEditorRef.current) {
  cellEditorRef.current.value = correctValue; // DOM直接更新
}
if (currentCellContent !== correctValue) {
  setCurrentCellContent(correctValue); // React状態更新
}
```

React の状態管理に加えて、DOM要素を直接操作することで、表示の遅延や不整合を防いでいます。

### 無限ループ防止
```typescript
if (!isUndoRedoOperation) {
  finishCellEdit(); // Undo/Redo中は編集完了処理を実行しない
}
```

`isUndoRedoOperation` フラグによって、Undo/Redo処理中に新しい履歴が作成されることを防いでいます。

## 🎯 結果

この修正により、Undo/Redo操作時に**数式プレビュー**、**行列テーブル内の数式表示**、**セル編集用テキストボックス**のすべてが確実に同期され、ユーザーに一貫した編集体験を提供できるようになりました。