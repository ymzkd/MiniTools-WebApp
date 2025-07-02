# Undo/Redo機能の改善 - 変更内容

## 🎯 ユーザー要求と実装内容

### 1. **挿入・削除操作の個別履歴化**
**要求**: 複数回の挿入・削除を一つずつの履歴として個別にUndo

**実装内容**:
- ✅ 各行・列の挿入・削除操作を個別の履歴として保存
- ✅ 一つの操作につき一つのUndo操作で元に戻せる
- ✅ "2行目の前に挿入" "3列目を削除"などの具体的な操作名を記録

### 2. **セル編集履歴の最適化**
**要求**: テキストボックス内の編集は編集完了時(Enter、フォーカス外れ)に一つの履歴として保存

**実装された変更**:
- ✅ **編集開始時**: `startCellEdit()`で元の値を記録
- ✅ **編集中**: リアルタイムで表示更新するが履歴は保存しない
- ✅ **編集完了時**: 以下のタイミングで履歴を保存
  - Enterキー押下時
  - テキストボックスからフォーカスが外れた時(onBlur)
  - 他のセルをクリックした時
- ✅ **Escapeキー**: 変更を破棄して元の値に戻す

### 3. **Redo機能の修正**
**要求**: Redoが正常に機能していない問題を解決

**修正内容**:
- ✅ **履歴インデックス管理**: `saveToHistory()`内での履歴インデックス更新ロジックを修正
- ✅ **状態復元処理**: Undo/Redo実行後にKaTeXの再レンダリングを追加
- ✅ **編集状態管理**: Undo/Redo実行前に現在の編集を完了
- ✅ **フラグ管理**: `isUndoRedoOperation`フラグの適切なタイミングでのリセット

## 🔧 技術的な変更詳細

### セル編集状態の管理
```typescript
// 新しい状態変数
const [editStartValue, setEditStartValue] = useState<string>('');
const [isEditing, setIsEditing] = useState(false);

// 編集開始
const startCellEdit = () => {
  if (!isEditing) {
    setEditStartValue(currentCellContent);
    setIsEditing(true);
  }
};

// 編集完了(履歴保存)
const finishCellEdit = () => {
  if (isEditing && editStartValue !== currentCellContent) {
    saveToHistory(`Edit cell (${activeCell.row + 1}, ${activeCell.col + 1})`);
  }
  setIsEditing(false);
};
```

### 履歴保存ロジックの改善
```typescript
const saveToHistory = (actionType: string) => {
  // 履歴インデックスの適切な管理
  setHistory((prev: HistoryState[]) => {
    const newHistory = prev.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    if (newHistory.length > 50) {
      newHistory.shift();
      setHistoryIndex(Math.min(historyIndex, 48));
      return newHistory;
    }
    
    setHistoryIndex(newHistory.length - 1);
    return newHistory;
  });
};
```

### Undo/Redo機能の強化
```typescript
const undo = () => {
  // 編集中の場合は先に編集を完了
  if (isEditing) {
    finishCellEdit();
  }
  
  // 状態復元後にKaTeXを再レンダリング
  setTimeout(() => {
    setIsUndoRedoOperation(false);
    if (window.katex) {
      renderAllCells();
      generateLatex();
    }
  }, 100);
};
```

## 🎮 新しい動作フロー

### セル編集の場合
1. **テキストボックスをクリック** → 編集開始、元の値を記録
2. **文字を入力** → リアルタイムで表示更新(履歴保存なし)
3. **Enterキーまたはフォーカス外れ** → 編集完了、履歴に保存
4. **Escapeキー** → 変更を破棄して元の値に戻す

### 行・列操作の場合
1. **行・列の挿入ボタンをクリック** → 即座に履歴保存＋操作実行
2. **行・列の削除ボタンをクリック** → 即座に履歴保存＋操作実行
3. **Ctrl+Z** → 一つの操作ずつ元に戻る

### Undo/Redo操作
1. **編集中にCtrl+Z** → 現在の編集を完了してからUndo実行
2. **状態復元** → すべての状態(行列、選択状態、表示設定)を復元
3. **再レンダリング** → KaTeXによる数式とプレビューの再描画

## ✅ 解決された問題

### 1. **細かすぎる編集履歴**
- **修正前**: 文字を1文字入力するたびに履歴が保存される
- **修正後**: 編集完了時に一度だけ履歴が保存される

### 2. **Redoの不具合**
- **修正前**: 履歴インデックスの管理ミスでRedoが正常に動作しない
- **修正後**: 履歴の追加・削除・復元が正しく管理される

### 3. **編集状態とUndo/Redoの競合**
- **修正前**: 編集中にUndo/Redoすると状態が不整合になる
- **修正後**: Undo/Redo前に編集を適切に完了させる

### 4. **表示の不整合**
- **修正前**: Undo/Redo後にKaTeXレンダリングが更新されない
- **修正後**: 状態復元後に自動的に再レンダリング

## 🎯 使用例

### 典型的な編集フロー
```
1. セル(1,1)をクリックしてフォーカス         → 編集開始
2. "x^2"と入力                           → リアルタイム表示更新
3. Enterキーを押す                        → 履歴保存「Edit cell (1,1)」
4. 2行目を挿入                           → 履歴保存「Insert row after row 1」  
5. セル(2,1)に"y^2"と入力                → リアルタイム表示更新
6. 他のセルをクリック                      → 履歴保存「Edit cell (2,1)」
7. Ctrl+Z                              → セル(2,1)の編集をUndo
8. Ctrl+Z                              → 行挿入をUndo
9. Ctrl+Z                              → セル(1,1)の編集をUndo
10. Ctrl+Y                             → セル(1,1)の編集をRedo
```

この改善により、より直感的で効率的な編集エクスペリエンスを提供できるようになりました！