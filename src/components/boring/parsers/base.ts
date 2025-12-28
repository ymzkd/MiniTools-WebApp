// 共通ユーティリティ関数

import type { DTDVersion } from './types';
import { SOIL_COLORS } from '../types';

/**
 * XMLドキュメントからDTDバージョンを検出
 * @param xmlDoc XMLドキュメント
 * @returns DTDバージョン または null
 */
export function detectDTDVersion(xmlDoc: Document): DTDVersion | null {
  const root = xmlDoc.documentElement;
  if (!root) return null;

  const versionAttr = root.getAttribute('DTD_version')?.trim();
  if (!versionAttr) return null;

  // サポートされているバージョンのみ返す
  if (versionAttr === '2.10' || versionAttr === '3.00' || versionAttr === '4.00') {
    return versionAttr;
  }

  return null;
}

/**
 * テキスト取得ヘルパー関数
 * @param tagName タグ名
 * @param parent 親要素（オプション）
 * @param xmlDoc XMLドキュメント（parent未指定時に使用）
 * @returns テキストコンテンツ または undefined
 */
export function getText(
  tagName: string,
  parent?: Element,
  xmlDoc?: Document
): string | undefined {
  const element = parent
    ? parent.getElementsByTagName(tagName)[0]
    : xmlDoc?.getElementsByTagName(tagName)[0];
  return element?.textContent?.trim() || undefined;
}

/**
 * 数値取得ヘルパー関数
 * @param tagName タグ名
 * @param parent 親要素（オプション）
 * @param xmlDoc XMLドキュメント（parent未指定時に使用）
 * @returns 数値 または undefined
 */
export function getNumber(
  tagName: string,
  parent?: Element,
  xmlDoc?: Document
): number | undefined {
  const text = getText(tagName, parent, xmlDoc);
  return text ? parseFloat(text) : undefined;
}

/**
 * 土質名と土質記号から色を判定
 * @param soilName 土質名
 * @param soilSymbol 土質記号
 * @returns 色コード
 */
export function determineSoilColor(soilName: string, soilSymbol: string): string {
  // 土質記号または土質名から色を判定
  for (const [key, color] of Object.entries(SOIL_COLORS)) {
    if (soilName.includes(key) || soilSymbol.includes(key)) {
      return color;
    }
  }
  return SOIL_COLORS['デフォルト'];
}
