# Undo/Redo Functionality - LaTeX Matrix Editor

## 概要 (Overview)

LaTeX Matrix Editorに包括的なUndo/Redo機能を追加しました。この機能により、すべての編集操作を元に戻したり、やり直したりできます。

## 実装された機能 (Implemented Features)

### 1. 履歴追跡 (History Tracking)
- **セル編集**: 個別のセルの値変更を追跡
- **行・列操作**: 行・列の挿入・削除操作を追跡
- **行列タイプ変更**: matrix、pmatrix、bmatrixなどのタイプ変更を追跡
- **対称行列操作**: 対称行列モードの切り替えと適用を追跡
- **LaTeX インポート**: LaTeX形式での行列インポートを追跡
- **表示設定**: ゼロ表示の切り替えを追跡
- **貼り付け操作**: クリップボードからの貼り付けを追跡

### 2. キーボードショートカット (Keyboard Shortcuts)
- **Ctrl+Z**: 元に戻す (Undo)
- **Ctrl+Y**: やり直し (Redo)
- **Ctrl+Shift+Z**: やり直し (Redo) - 代替ショートカット

### 3. UI コントロール (UI Controls)
- **Undoボタン**: ↶ Undo ボタンで操作を元に戻す
- **Redoボタン**: ↷ Redo ボタンで操作をやり直す
- **履歴表示**: 現在の操作内容を表示
- **ボタン状態**: Undo/Redoが可能な場合のみボタンが有効化

## 技術仕様 (Technical Specifications)

### データ構造
```typescript
interface HistoryState {
  matrix: MatrixData;
  activeCell: CellPosition;
  selectedRange: SelectionRange;
  selectionMode: 'single' | 'range';
  currentCellContent: string;
  symmetricMode: boolean;
  showZeros: boolean;
  timestamp: number;
  actionType: string;
}
```

### 履歴管理
- **最大履歴数**: 50操作まで保存
- **メモリ効率**: 古い履歴は自動的に削除
- **深いコピー**: 状態の完全な複製を保存
- **操作識別**: 各操作には説明的な名前を付与

### パフォーマンス最適化
- **条件付き保存**: 実際に値が変更された場合のみ履歴を保存
- **undo/redo フラグ**: 操作中の無限ループを防止
- **非同期処理**: UI の応答性を維持

## 使用方法 (Usage)

### 基本操作
1. 行列を編集（セル編集、行・列操作など）
2. **Ctrl+Z** または **Undoボタン** で操作を元に戻す
3. **Ctrl+Y** または **Redoボタン** で操作をやり直す

### 対応操作
- ✅ セル内容の編集
- ✅ 行の挿入・削除
- ✅ 列の挿入・削除
- ✅ 行列タイプの変更
- ✅ 対称行列モードの切り替え
- ✅ 対称行列の適用
- ✅ LaTeX形式でのインポート
- ✅ クリップボードからの貼り付け
- ✅ ゼロ表示設定の切り替え

### 制限事項
- 履歴は最大50操作まで
- コピー操作は履歴に含まれません（状態を変更しないため）
- ブラウザリロード時に履歴はリセット

## 実装の詳細 (Implementation Details)

### 履歴保存のタイミング
各操作関数の開始時に `saveToHistory()` を呼び出し、操作前の状態を保存しています：

```typescript
const insertRowAt = (index: number, before: boolean = false) => {
  saveToHistory(`Insert row ${before ? 'before' : 'after'} row ${index + 1}`);
  // ... 実際の操作
};
```

### Undo/Redo の実装
- `undo()`: 履歴インデックスを1つ戻し、その状態を復元
- `redo()`: 履歴インデックスを1つ進め、その状態を復元
- `isUndoRedoOperation` フラグで操作中の履歴保存を防止

### エラーハンドリング
- 境界チェック：履歴の最初/最後での操作を防止
- 状態検証：無効な状態の復元を防止
- 非同期フラグリセット：操作完了後の適切なクリーンアップ

## 今後の拡張可能性 (Future Enhancements)

1. **履歴の永続化**: ローカルストレージへの保存
2. **履歴ブラウザ**: 全履歴の可視化と任意の時点への復元
3. **マクロ機能**: 複数操作の一括Undo/Redo
4. **差分表示**: 変更箇所のハイライト表示
5. **履歴エクスポート**: 操作履歴のエクスポート機能