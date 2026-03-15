import React from 'react';
import type {
  BendingResult,
  ShearResult,
  CompressionResult,
  WidthThicknessResult,
  EffectiveSectionResult,
} from './steelTypes';

type CalcTarget = 'bending' | 'shear' | 'compression';

interface ResultPanelProps {
  calcTargets: CalcTarget[];
  bendingResult: BendingResult | null;
  shearResult: ShearResult | null;
  compressionResult: CompressionResult | null;
  widthThicknessResult: WidthThicknessResult | null;
  effectiveSection: EffectiveSectionResult | null;
  F: number;
}

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm transition-colors duration-200";

function Row({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  const formatted = typeof value === 'number'
    ? (Math.abs(value) >= 1e6 ? value.toExponential(3) : value.toFixed(2))
    : value;
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
        {formatted}{unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
      ok ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
    }`}>
      {ok ? 'OK' : 'NG'}
    </span>
  );
}

const ResultPanel: React.FC<ResultPanelProps> = ({
  calcTargets,
  bendingResult,
  shearResult,
  compressionResult,
  widthThicknessResult,
  effectiveSection,
  F,
}) => {
  return (
    <div className="space-y-4">
      {/* 基本情報 */}
      <div className={cardClass}>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">基本情報</h3>
        <Row label="F (基準強度)" value={F} unit="N/mm²" />
        <Row label="ft (長期許容引張)" value={F / 1.5} unit="N/mm²" />
        <Row label="Λ (限界細長比)" value={1500 / Math.sqrt(F / 1.5)} />

        {/* 幅厚比チェック */}
        {widthThicknessResult && widthThicknessResult.checks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">幅厚比</p>
              <StatusBadge ok={widthThicknessResult.isOk} />
            </div>
            {widthThicknessResult.warning && (
              <div className="mb-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                {widthThicknessResult.warning}
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                  <th className="py-1">部位</th>
                  <th className="py-1 text-right">幅厚比</th>
                  <th className="py-1 text-right">規定値</th>
                  <th className="py-1 text-center">判定</th>
                </tr>
              </thead>
              <tbody>
                {widthThicknessResult.checks.map((c, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-1 text-gray-700 dark:text-gray-300">{c.part}</td>
                    <td className="py-1 text-right font-mono text-gray-800 dark:text-gray-200">{c.ratio.toFixed(2)}</td>
                    <td className="py-1 text-right font-mono text-gray-800 dark:text-gray-200">{c.limit.toFixed(2)}</td>
                    <td className="py-1 text-center"><StatusBadge ok={c.isOk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 有効断面 */}
            {effectiveSection && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">有効断面性能</p>
                <Row label="ΔH" value={effectiveSection.deltaH} unit="mm" />
                <Row label="ΔB" value={effectiveSection.deltaB} unit="mm" />
                {effectiveSection.deltaC !== undefined && (
                  <Row label="ΔC" value={effectiveSection.deltaC} unit="mm" />
                )}
                <Row label="Aeff (有効断面積)" value={effectiveSection.Aeff} unit="mm²" />
                <Row label="Zx,eff (有効断面係数)" value={effectiveSection.Zxeff} unit="mm³" />
                <Row label="Zy,eff (有効断面係数)" value={effectiveSection.Zyeff} unit="mm³" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 曲げ許容応力度 */}
      {calcTargets.includes('bending') && bendingResult && (
        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
            曲げ許容応力度
          </h3>
          <div className="mb-2">
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
              {bendingResult.method === 'technical-standard' ? '技術基準解説書' : '鋼構造許容応力度設計規準'}
            </span>
          </div>

          {bendingResult.method === 'technical-standard' && (
            <>
              <Row label="i (T形断面二次半径)" value={bendingResult.i_T ?? 0} unit="mm" />
              <Row label="fb1" value={bendingResult.fb1 ?? 0} unit="N/mm²" />
              <Row label="fb2" value={bendingResult.fb2 ?? 0} unit="N/mm²" />
            </>
          )}

          {bendingResult.method === 'aij-standard' && bendingResult.region && (
            <>
              {bendingResult.Me !== undefined && (
                <Row label="Me (弾性横座屈モーメント)" value={bendingResult.Me / 1e6} unit="kN·m" />
              )}
              {bendingResult.My !== undefined && (
                <Row label="My (降伏モーメント)" value={bendingResult.My / 1e6} unit="kN·m" />
              )}
              {bendingResult.lambdaB !== undefined && (
                <Row label="λb (曲げ材の細長比)" value={bendingResult.lambdaB} />
              )}
              {bendingResult.pLambdaB !== undefined && (
                <Row label="pλb (塑性限界)" value={bendingResult.pLambdaB} />
              )}
              {bendingResult.eLambdaB !== undefined && (
                <Row label="eλb (弾性限界)" value={bendingResult.eLambdaB} />
              )}
              {bendingResult.nu !== undefined && (
                <Row label="ν (安全率)" value={bendingResult.nu} />
              )}
              <Row label="座屈域" value={
                bendingResult.region === 'plastic' ? '塑性域'
                : bendingResult.region === 'inelastic' ? '非弾性横座屈域'
                : '弾性横座屈域'
              } />
            </>
          )}

          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <Row label="fb (長期)" value={bendingResult.fb} unit="N/mm²" />
            <Row label="fb (短期)" value={bendingResult.fb_short} unit="N/mm²" />
          </div>
        </div>
      )}

      {/* せん断許容応力度 */}
      {calcTargets.includes('shear') && shearResult && (
        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
            せん断許容応力度
          </h3>
          <Row label="fs (長期)" value={shearResult.fs_long} unit="N/mm²" />
          <Row label="fs (短期)" value={shearResult.fs_short} unit="N/mm²" />
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">せん断負担面積</p>
            <Row label="Asy (y方向)" value={shearResult.Asy} unit="mm²" />
            <Row label="κy" value={shearResult.kappaY} />
            <Row label="Asx (x方向)" value={shearResult.Asx} unit="mm²" />
            <Row label="κx" value={shearResult.kappaX} />
          </div>
        </div>
      )}

      {/* 圧縮許容応力度 */}
      {calcTargets.includes('compression') && compressionResult && (
        <div className={cardClass}>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
            圧縮許容応力度
          </h3>
          <Row label="λ (細長比)" value={compressionResult.lambda} />
          <Row label="Λ (限界細長比)" value={compressionResult.Lambda} />
          <Row label="ν (安全率)" value={compressionResult.nu} />
          <Row label="領域" value={compressionResult.region === 'short' ? '短柱 (λ≤Λ)' : '長柱 (λ>Λ)'} />
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <Row label="fc (長期)" value={compressionResult.fc} unit="N/mm²" />
            <Row label="fc (短期)" value={compressionResult.fc_short} unit="N/mm²" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultPanel;
