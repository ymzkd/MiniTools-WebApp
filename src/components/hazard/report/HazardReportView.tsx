// 設計用地域情報レポートの印刷用ビュー（HTML）。
// 提供されたデザインテンプレートを忠実に再現。ブラウザの「印刷 → PDFに保存」で出力するため、
// フォントはユーザーのローカル書体（本文=ゴシック / 見出し=明朝）を font stack で参照する
// （アプリ側のフォント取得は無し）。print.tsx が renderToStaticMarkup して iframe に流し込む。
// 背景色は使わず、罫線・文字色・カード上端のアクセント罫で構成する（印刷の「背景のグラフィック」
// 設定に依存せず常に同じ見た目で出力され、インクも節約できる）。
import type { CSSProperties } from 'react';
import type { HazardReportData } from './types';

// ローカル日本語フォント。インストール済みのものを順に使う（Win=游/メイリオ, Mac=ヒラギノ, 他=Noto）。
const SANS =
  '"Yu Gothic UI","Yu Gothic",YuGothic,"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP",Meiryo,"MS PGothic",sans-serif';
const MINCHO =
  '"Yu Mincho",YuMincho,"YuMincho","Hiragino Mincho ProN","Hiragino Mincho Pro","Noto Serif JP","MS PMincho","MS Mincho",serif';

const fmtDistKm = (m: number | null | undefined): string =>
  m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
const minus = (v: number) => String(v).replace('-', '−');

const muted: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '16px',
  fontSize: '10.5px',
  color: 'rgb(154,151,143)',
  lineHeight: 1.6,
};

function CardShell({
  title, law, accent, children,
}: { title: string; law: string; accent: string; children: React.ReactNode }) {
  return (
    // アクセントは背景塗りでなくカード上端の色付き罫（border は印刷で必ず出る）。
    <div style={{ flex: 1, border: '1px solid rgb(217,214,207)', borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 12px 8px', borderBottom: '1px solid rgb(226,223,216)' }}>
        <div style={{ fontFamily: MINCHO, fontWeight: 600, fontSize: '15px' }}>{title}</div>
        <div style={{ fontSize: '9px', color: 'rgb(154,151,143)', marginTop: '2px' }}>{law}</div>
      </div>
      {children}
    </div>
  );
}

const rowStyle = (last?: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: last ? undefined : '1px solid rgb(239,236,229)',
  fontVariantNumeric: 'tabular-nums',
});

export function HazardReportView({ data }: { data: HazardReportData }) {
  const { point, snow, wind, seismic, shore } = data;
  const dateDot = data.generatedAt.slice(0, 10).replace(/-/g, '.');
  const shoreM = shore?.nearestM ?? null;
  const sheet: CSSProperties = {
    width: '210mm',
    minHeight: '297mm',
    background: '#fff',
    padding: '15mm 14mm 12mm',
    color: 'rgb(28,28,26)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: SANS,
  };

  return (
    <div style={sheet}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid rgb(36,59,83)', paddingBottom: '10px' }}>
        <div>
          <div style={{ fontFamily: MINCHO, fontWeight: 700, fontSize: '25px', letterSpacing: '0.04em', color: 'rgb(28,28,26)' }}>
            設計積雪量・風速・地域係数レポート
          </div>
          <div style={{ fontSize: '11px', color: 'rgb(107,104,98)', marginTop: '6px' }}>
            建築基準法告示に基づく 積雪・風・地震 の地域諸元
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '10px', color: 'rgb(58,56,51)', lineHeight: 1.7 }}>
          <div><span style={{ color: 'rgb(154,151,143)' }}>作成日</span>&nbsp;&nbsp;{dateDot}</div>
          <div><span style={{ color: 'rgb(154,151,143)' }}>座標系</span>&nbsp;&nbsp;WGS84 / 世界測地系</div>
          <div><span style={{ color: 'rgb(154,151,143)' }}>出&nbsp;&nbsp;典</span>&nbsp;&nbsp;国土地理院 ほか</div>
        </div>
      </div>

      {/* 所在地バー */}
      <div style={{ marginTop: '12px', border: '1px solid rgb(217,214,207)' }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ flex: '1.3 1 0', padding: '11px 14px', borderRight: '1px solid rgb(226,223,216)' }}>
            <div style={{ fontSize: '9.5px', letterSpacing: '0.16em', color: 'rgb(154,151,143)' }}>所在地 / LOCATION</div>
            <div style={{ fontFamily: MINCHO, fontWeight: 600, fontSize: '17px', marginTop: '4px', letterSpacing: '0.02em' }}>
              {data.placeName ?? '所在地情報なし（海上など）'}
            </div>
            <div style={{ display: 'flex', gap: '22px', marginTop: '7px', fontSize: '11.5px', fontVariantNumeric: 'tabular-nums' }}>
              <div><span style={{ color: 'rgb(154,151,143)' }}>緯度</span>&nbsp; <b style={{ fontWeight: 500 }}>{point.lat.toFixed(3)}</b></div>
              <div><span style={{ color: 'rgb(154,151,143)' }}>経度</span>&nbsp; <b style={{ fontWeight: 500 }}>{point.lng.toFixed(3)}</b></div>
            </div>
          </div>
          <div style={{ flex: '1 1 0', display: 'flex' }}>
            <Metric label="標高" value={data.elevation != null ? data.elevation.toFixed(1) : '—'} unit="m" border />
            <Metric label="海率" value={data.seaRatio != null ? (data.seaRatio * 100).toFixed(1) : '—'} unit="%" border />
            <Metric label="陸率" value={data.landRatio != null ? (data.landRatio * 100).toFixed(1) : '—'} unit="%" />
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgb(226,223,216)', padding: '5px 14px', fontSize: '9.5px', color: 'rgb(154,151,143)' }}>
          ※ 海率は対象地点を中心とする半径 {data.radiusKm} km の円内に占める海面積の割合。
        </div>
      </div>

      {/* 地図（全幅。指定地点中心・積雪算定円が全体に収まるよう描画） */}
      <div style={{ marginTop: '12px', height: '300px', border: '1px solid rgb(217,214,207)', position: 'relative', overflow: 'hidden' }}>
        {data.mapImage ? (
          <img src={data.mapImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '236px', height: '236px', border: '1.5px dashed rgb(90,111,147)', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '9px', height: '9px', borderRadius: '50%', border: '2px solid rgb(192,57,43)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(20px)', textAlign: 'center', fontSize: '11px', color: 'rgb(122,119,111)' }}>地図を取得できませんでした</div>
          </>
        )}
        {/* 地図キャプション（地図画像上の可読性のための薄い下地のみ残す） */}
        <div style={{ position: 'absolute', bottom: '8px', left: '9px', right: '9px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '9px', color: 'rgb(122,119,111)', background: 'rgba(255,255,255,0.82)', padding: '2px 6px' }}>
            対象地点（赤点）／ 海率算定円 R = {data.radiusKm} km（破線）
            {shoreM != null ? `／ 最寄りの海岸線・湖岸線への測線（橙破線）` : ''}
          </div>
          <div style={{ fontSize: '8.5px', color: 'rgb(154,151,143)', background: 'rgba(255,255,255,0.82)', padding: '2px 6px' }}>© 国土地理院</div>
        </div>
      </div>

      {/* 3カード */}
      <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
        {/* 積雪 */}
        <CardShell title="設計用積雪量" law="平成12年建設省告示 第1455号" accent="rgb(63,94,140)">
          {snow && snow.usable ? (
            <>
              <ValueBlock label="積雪深 d" value={snow.noSnow ? '0' : (snow.depthCm != null ? snow.depthCm.toFixed(0) : '—')} unit="cm" color="rgb(44,65,99)" />
              {snow.noSnow ? (
                <div style={{ padding: '10px 12px', fontSize: '11px', color: 'rgb(107,104,98)' }}>積雪荷重の対象区域外（第0区・積雪なし）。</div>
              ) : (
                <>
                  <div style={{ padding: '4px 12px 0', fontSize: '11px' }}>
                    <Row k="地域区分" v={`第 ${snow.zone} 区`} bold />
                    <Row k="α（標高係数）" v={String(snow.alpha)} />
                    <Row k="β（海率係数）" v={minus(snow.beta)} />
                    <Row k="γ（定数項）" v={String(snow.gamma)} />
                    <Row k="R（海率計算半径）" v={`${snow.R} km`} last />
                  </div>
                  <div style={{ margin: 'auto 12px 12px', border: '1px solid rgb(227,232,240)', padding: '8px 10px' }}>
                    <div style={{ fontSize: '8.5px', letterSpacing: '0.1em', color: 'rgb(122,130,152)', marginBottom: '4px' }}>算定式</div>
                    <div style={{ fontSize: '10px', lineHeight: 1.6, color: 'rgb(44,65,99)', fontVariantNumeric: 'tabular-nums' }}>d =（α×標高＋β×海率＋γ）×100</div>
                    {data.elevation != null && data.seaRatio != null && snow.depthCm != null && (
                      <div style={{ fontSize: '9.5px', lineHeight: 1.6, color: 'rgb(90,111,147)', fontVariantNumeric: 'tabular-nums', marginTop: '3px' }}>
                        =（{snow.alpha}×{data.elevation.toFixed(1)} + ({minus(snow.beta)})×{data.seaRatio.toFixed(3)} + {snow.gamma}）×100 = {snow.depthCm.toFixed(0)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={muted}>海上または区域外のため、この地点では値を採用しません。</div>
          )}
        </CardShell>

        {/* 風 */}
        <CardShell title="設計基準風速" law="平成12年建設省告示 第1454号" accent="rgb(63,125,120)">
          {wind && wind.usable ? (
            <>
              <ValueBlock label="基準風速 V₀" value={String(wind.Vo)} unit="m/s" color="rgb(44,88,84)" />
              <div style={{ padding: '4px 12px 0', fontSize: '11px' }}>
                <Row k="地域区分" v={`第 ${wind.zone} 区`} bold />
                <Row k="海岸線まで" v={fmtDistKm(shoreM)} last />
              </div>
              <div style={{ margin: '10px 12px 0', border: '1px solid rgb(221,233,231)', padding: '8px 10px' }}>
                <div style={{ fontSize: '8.5px', letterSpacing: '0.1em', color: 'rgb(111,141,137)', marginBottom: '4px' }}>海岸線・湖岸線までの距離（第1454号）</div>
                <div style={{ fontSize: '9.5px', lineHeight: 1.6, color: 'rgb(65,97,93)' }}>地表面粗度区分の判定用の距離（地図上に測線を表示）。区分の確定・個別パラメータは設計者判断による。</div>
              </div>
              <div style={{ marginTop: 'auto', padding: '10px 12px 12px' }}>
                <div style={{ fontSize: '9px', color: 'rgb(154,151,143)', lineHeight: 1.6 }}>基準風速 V₀ は、各地の再現期間 50 年の 10 分間平均風速に相当する値。</div>
              </div>
            </>
          ) : (
            <div style={muted}>海上または区域外のため、この地点では値を採用しません。</div>
          )}
        </CardShell>

        {/* 地震 */}
        <CardShell title="地震地域係数" law="昭和55年建設省告示 第1793号" accent="rgb(156,106,68)">
          {seismic && seismic.usable ? (
            <>
              <ValueBlock label="地域係数 Z" value={seismic.Z.toFixed(1)} color="rgb(110,74,46)" />
              <div style={{ padding: '4px 12px 0', fontSize: '11px' }}>
                <Row k="地域区分" v={`第 ${seismic.zone} 区`} bold />
                <Row k="係数 Z の範囲" v="0.7 〜 1.0" last />
              </div>
              <div style={{ margin: '10px 12px 0', border: '1px solid rgb(236,224,212)', padding: '8px 10px' }}>
                <div style={{ fontSize: '8.5px', letterSpacing: '0.1em', color: 'rgb(156,126,99)', marginBottom: '4px' }}>区分の目安</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9.5px', color: 'rgb(110,82,56)', fontVariantNumeric: 'tabular-nums' }}>
                  {[['第 1 区', 'Z = 1.0'], ['第 2 区', 'Z = 0.9'], ['第 3 区', 'Z = 0.8 / 0.7']].map(([a, b]) => (
                    <div key={a} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{a}</span><span>{b}</span></div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 'auto', padding: '10px 12px 12px' }}>
                <div style={{ fontSize: '9px', color: 'rgb(154,151,143)', lineHeight: 1.6 }}>地震力の算定に用いる地域別の低減係数。値が大きいほど想定地震動が大きい。</div>
              </div>
            </>
          ) : (
            <div style={muted}>海上または区域外のため、この地点では値を採用しません。</div>
          )}
        </CardShell>
      </div>

      {/* フッター */}
      <div style={{ marginTop: '12px', borderTop: '1px solid rgb(217,214,207)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
        <div style={{ flex: 1, fontSize: '8px', color: 'rgb(154,151,143)', lineHeight: 1.5 }}>
          データ出典: 国土数値情報（都市地域A09・行政区域N03・湖沼W09／国土交通省・CC BY 4.0）/ 国土地理院（標高・背景地図）/ OpenStreetMap（住所検索 Nominatim・ODbL）。
        </div>
        <div style={{ textAlign: 'right', fontSize: '9px', color: 'rgb(107,104,98)', lineHeight: 1.7, whiteSpace: 'nowrap' }}>
          <div style={{ fontFamily: MINCHO, fontWeight: 600, color: 'rgb(36,59,83)' }}>Hazard Map</div>
          <div>設計用地域情報レポート</div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, unit, border }: { label: string; value: string; unit?: string; border?: boolean }) {
  return (
    <div style={{ flex: '1 1 0', padding: '11px 12px', textAlign: 'center', borderRight: border ? '1px solid rgb(226,223,216)' : undefined }}>
      <div style={{ fontSize: '9.5px', letterSpacing: '0.12em', color: 'rgb(154,151,143)' }}>{label}</div>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '21px', fontWeight: 700, marginTop: '3px', color: 'rgb(36,59,83)' }}>
        {value}
        {unit ? <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgb(107,104,98)', marginLeft: '2px' }}>{unit}</span> : null}
      </div>
    </div>
  );
}

function ValueBlock({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div style={{ padding: '11px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: '9px', letterSpacing: '0.14em', color: 'rgb(107,104,98)' }}>{label}</div>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '26px', fontWeight: 700, color, lineHeight: 1.05, marginTop: '2px' }}>
        {value}
        {unit ? <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgb(107,104,98)', marginLeft: '3px' }}>{unit}</span> : null}
      </div>
    </div>
  );
}

function Row({ k, v, bold, last }: { k: string; v: string; bold?: boolean; last?: boolean }) {
  return (
    <div style={rowStyle(last)}>
      <span style={{ color: 'rgb(107,104,98)' }}>{k}</span>
      <span style={{ fontWeight: bold ? 600 : undefined }}>{v}</span>
    </div>
  );
}
