// Hazard Map の設計用荷重レポート（react-pdf / ベクターPDF）。
// レイアウト・配色は提供されたデザインテンプレート（設計用地域情報レポート）に準拠。
// このファイルは重い @react-pdf/renderer を読み込むため、アプリ本体から静的 import せず、
// generate.tsx 経由の動的 import からのみ到達する（初期表示に乗せない）。
import {
  Document, Page, View, Text, Image, Font, StyleSheet,
  Svg, Polygon, Line, Circle, Defs, LinearGradient, Stop,
} from '@react-pdf/renderer';
import type { HazardReportData } from './types';

// 日本語フォント。public/fonts に同梱し、ビルド後は同一オリジンの /fonts/... で配信される。
// react-pdf は生成時にだけ取得し、使用グリフのみを PDF に埋め込む（出力は軽量）。
// 見出し=Noto Serif JP、本文=Noto Sans JP（数値の強調に Bold を併用）。
Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: '/fonts/NotoSansJP-Regular.otf' },
    { src: '/fonts/NotoSansJP-Bold.otf', fontWeight: 700 },
  ],
});
Font.register({ family: 'NotoSerifJP', src: '/fonts/NotoSerifJP-SemiBold.otf' });
Font.registerHyphenationCallback((word) => [word]); // 日本語の任意位置改行を許可

// テンプレートは A4(794×1123px @96dpi)前提。react-pdf は pt(72dpi)なので px×0.75 で換算。
const p = (px: number) => px * 0.75;

const C = {
  ink: '#1c1c1a',
  navy: '#243b53',
  sub: '#6b6862',
  faint: '#9a978f',
  line: '#d9d6cf',
  line2: '#e2dfd8',
  rowLine: '#efece5',
  locBg: '#f8f7f3',
  // 地図
  mapBg: '#f1efe9',
  dash: '#5a6f93',
  red: '#c0392b',
  cap: '#7a776f',
  // 海岸線図
  land: '#f1ede4',
  coast: '#3f6f8f',
  landLabel: '#8a6a4a',
  // 積雪(青)
  snowBar: '#3f5e8c', snowDot: '#3f5e8c', snowBg: '#f3f5f9', snowText: '#2c4163',
  snowBoxBd: '#e3e8f0', snowBoxLbl: '#7a8298', snowBoxSub: '#5a6f93',
  // 風(緑)
  windBar: '#3f7d78', windBg: '#f0f5f4', windText: '#2c5854',
  windBoxBd: '#dde9e7', windBoxLbl: '#6f8d89', windBoxTxt: '#41615d',
  // 地震(茶)
  eqBar: '#9c6a44', eqBg: '#f6f1ec', eqText: '#6e4a2e',
  eqBoxBd: '#ece0d4', eqBoxLbl: '#9c7e63', eqBoxTxt: '#6e5238',
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: p(11),
    color: C.ink,
    paddingTop: 42,
    paddingBottom: 30,
    paddingHorizontal: 40,
    lineHeight: 1.4,
  },
  serif: { fontFamily: 'NotoSerifJP' },

  // ── ヘッダー ──
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottomWidth: 1.5, borderBottomColor: C.navy, paddingBottom: p(10),
  },
  title: { fontFamily: 'NotoSerifJP', fontSize: p(25), letterSpacing: p(25) * 0.04, color: C.ink, lineHeight: 1.1 },
  subtitle: { fontSize: p(11), color: C.sub, marginTop: p(6) },
  metaWrap: { alignItems: 'flex-end' },
  metaRow: { flexDirection: 'row', fontSize: p(10), color: C.ink, marginBottom: p(2) },
  metaLabel: { color: C.faint, marginRight: p(8) },

  // ── 所在地バー ──
  loc: { marginTop: p(12), borderWidth: 1, borderColor: C.line, backgroundColor: C.locBg },
  locRow: { flexDirection: 'row', alignItems: 'stretch' },
  locLeft: { flexGrow: 1.3, flexBasis: 0, padding: p(11), borderRightWidth: 1, borderRightColor: C.line2 },
  locLabel: { fontSize: p(9.5), letterSpacing: p(9.5) * 0.16, color: C.faint },
  placeName: { fontFamily: 'NotoSerifJP', fontSize: p(17), marginTop: p(4) },
  coordRow: { flexDirection: 'row', marginTop: p(7), fontSize: p(11.5) },
  coordItem: { marginRight: p(22), flexDirection: 'row' },
  coordLabel: { color: C.faint, marginRight: p(4) },
  locRight: { flexGrow: 1, flexBasis: 0, flexDirection: 'row' },
  metricCell: { flexGrow: 1, flexBasis: 0, padding: p(11), alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: p(9.5), letterSpacing: p(9.5) * 0.12, color: C.faint },
  metricVal: { fontSize: p(21), fontWeight: 700, marginTop: p(3), color: C.navy },
  unitSm: { fontSize: p(11), fontWeight: 400, color: C.sub },
  locNote: { borderTopWidth: 1, borderTopColor: C.line2, paddingVertical: p(5), paddingHorizontal: p(14), fontSize: p(9.5), color: C.faint },

  // ── 地図行 ──
  mapRow: { marginTop: p(12), flexDirection: 'row', height: p(300) },
  mapBox: { flexGrow: 1.85, flexBasis: 0, marginRight: p(10), borderWidth: 1, borderColor: C.line, position: 'relative', backgroundColor: C.mapBg, overflow: 'hidden' },
  mapImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  mapPlaceholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderTxt: { fontSize: p(11), color: C.cap },
  mapCaption: {
    position: 'absolute', bottom: p(8), left: p(9), right: p(9),
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  mapCapPill: { backgroundColor: 'rgba(248,247,243,0.85)', paddingVertical: p(2), paddingHorizontal: p(5), fontSize: p(9), color: C.cap },
  mapCapRight: { backgroundColor: 'rgba(248,247,243,0.85)', paddingVertical: p(2), paddingHorizontal: p(5), fontSize: p(8.5), color: C.faint },

  // ── 海岸線距離カード ──
  shoreCard: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  shoreHead: { paddingVertical: p(7), paddingHorizontal: p(11), borderBottomWidth: 1, borderBottomColor: C.line2, fontSize: p(10), letterSpacing: p(10) * 0.1, color: '#3a3833' },
  shoreFig: { position: 'relative', overflow: 'hidden', height: p(300) - p(58) },
  shoreFoot: { borderTopWidth: 1, borderTopColor: C.line2, paddingVertical: p(6), paddingHorizontal: p(11), fontSize: p(8.5), color: C.faint, lineHeight: 1.5 },
  shoreLandLbl: { position: 'absolute', left: p(14), top: p(30), fontSize: p(9), color: C.landLabel },
  shoreSeaLbl: { position: 'absolute', right: p(16), bottom: p(18), fontSize: p(9), color: C.coast },
  shoreCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  shoreDistBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, paddingVertical: p(3), paddingHorizontal: p(8), flexDirection: 'row', alignItems: 'baseline' },
  shoreDist: { fontSize: p(13), fontWeight: 700, color: C.navy },
  shoreDistUnit: { fontSize: p(9), color: C.sub, marginLeft: p(2) },
  shoreMuted: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  mutedTxt: { fontSize: p(10), color: C.faint, textAlign: 'center', paddingHorizontal: p(10), lineHeight: 1.5 },

  // ── 荷重カード ──
  cardRow: { marginTop: p(14), flexDirection: 'row' },
  card: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: C.line, flexDirection: 'column' },
  accent: { height: p(3) },
  cardHead: { paddingTop: p(9), paddingHorizontal: p(12), paddingBottom: p(8), borderBottomWidth: 1, borderBottomColor: C.line2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: 'NotoSerifJP', fontSize: p(15) },
  cardDot: { width: p(8), height: p(8), borderRadius: p(4) },
  cardLaw: { fontSize: p(9), color: C.faint, marginTop: p(2) },
  valBlock: { paddingVertical: p(11), paddingHorizontal: p(12), alignItems: 'center' },
  valLabel: { fontSize: p(9), letterSpacing: p(9) * 0.14, color: C.sub },
  valNum: { fontSize: p(26), fontWeight: 700, lineHeight: 1.05, marginTop: p(2) },
  valUnit: { fontSize: p(11), fontWeight: 400, color: C.sub, marginLeft: p(3) },
  tbl: { paddingTop: p(4), paddingHorizontal: p(12), fontSize: p(11) },
  tr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: p(6), borderBottomWidth: 1, borderBottomColor: C.rowLine },
  trLast: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: p(6) },
  trLabel: { color: C.sub },
  trValB: { fontWeight: 700 },
  box: { borderWidth: 1, padding: p(8), paddingHorizontal: p(10) },
  boxLabel: { fontSize: p(8.5), letterSpacing: p(8.5) * 0.1, marginBottom: p(4) },
  boxText: { fontSize: p(9.5), lineHeight: 1.6 },
  note: { fontSize: p(9), color: C.faint, lineHeight: 1.6 },
  cardMuted: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: p(16) },

  // ── フッター ──
  footer: { marginTop: p(12), borderTopWidth: 1, borderTopColor: C.line, paddingTop: p(8), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  footDisc: { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: p(8), color: C.faint, lineHeight: 1.5, paddingRight: p(16) },
  footBrand: { width: p(110), flexShrink: 0, alignItems: 'flex-end' },
  footBrandName: { fontFamily: 'NotoSerifJP', fontSize: p(9), color: C.navy },
  footBrandSub: { fontSize: p(9), color: C.faint, marginTop: p(2) },
});

const fmtDistKm = (m: number | null | undefined): string =>
  m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;

const minus = (v: number) => String(v).replace('-', '−');

// 値+単位の大きな数字
function BigVal({ value, unit, color }: { value: string; unit?: string; color: string }) {
  return (
    <Text style={[s.valNum, { color }]}>
      {value}
      {unit ? <Text style={s.valUnit}>{unit}</Text> : null}
    </Text>
  );
}

function TRow({ k, v, bold, last }: { k: string; v: string; bold?: boolean; last?: boolean }) {
  return (
    <View style={last ? s.trLast : s.tr}>
      <Text style={s.trLabel}>{k}</Text>
      <Text style={bold ? s.trValB : undefined}>{v}</Text>
    </View>
  );
}

// カードの外枠（アクセントバー＋見出し）。children に本文。
function Card({
  title, law, accent, children,
}: { title: string; law: string; accent: string; children: React.ReactNode }) {
  return (
    <View style={s.card} wrap={false}>
      <View style={[s.accent, { backgroundColor: accent }]} />
      <View style={s.cardHead}>
        <View style={s.cardTitleRow}>
          <Text style={s.cardTitle}>{title}</Text>
          <View style={[s.cardDot, { backgroundColor: accent }]} />
        </View>
        <Text style={s.cardLaw}>{law}</Text>
      </View>
      {children}
    </View>
  );
}

function CardMuted({ text }: { text: string }) {
  return (
    <View style={s.cardMuted}>
      <Text style={s.mutedTxt}>{text}</Text>
    </View>
  );
}

// 海岸線距離の模式図（装飾。実データは距離のみ）。
function ShoreFigure({ distM }: { distM: number | null }) {
  if (distM == null) {
    return (
      <View style={s.shoreFig}>
        <View style={s.shoreMuted}>
          <Text style={s.mutedTxt}>取得できませんでした</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={s.shoreFig}>
      <Svg viewBox="0 0 200 130" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        <Defs>
          <LinearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#dfe9f0" />
            <Stop offset="1" stopColor="#cfe0ea" />
          </LinearGradient>
        </Defs>
        <Polygon points="0,0 200,0 36,130 0,130" fill={C.land} />
        <Polygon points="200,0 200,130 36,130" fill="url(#sea)" />
        <Line x1="160" y1="-10" x2="36" y2="140" stroke={C.coast} strokeWidth={1.6} />
        <Line x1="58" y1="52" x2="116" y2="86" stroke={C.red} strokeWidth={1.3} strokeDasharray="4 3" />
        <Circle cx="58" cy="52" r="4" fill={C.red} />
      </Svg>
      <Text style={s.shoreLandLbl}>陸</Text>
      <Text style={s.shoreSeaLbl}>海</Text>
      <View style={s.shoreCenter}>
        <View style={s.shoreDistBox}>
          <Text style={s.shoreDist}>{distM < 1000 ? String(Math.round(distM)) : (distM / 1000).toFixed(distM < 10000 ? 2 : 1)}</Text>
          <Text style={s.shoreDistUnit}>{distM < 1000 ? 'm' : 'km'}</Text>
        </View>
      </View>
    </View>
  );
}

export function HazardReportDocument({ data }: { data: HazardReportData }) {
  const { point, snow, wind, seismic, shore } = data;
  const dateDot = data.generatedAt.slice(0, 10).replace(/-/g, '.');
  const shoreM = shore?.nearestM ?? null;

  return (
    <Document title={`Hazard Report ${point.lat.toFixed(4)},${point.lng.toFixed(4)}`} author="MiniTools Hazard Map">
      <Page size="A4" style={s.page}>
        {/* ヘッダー */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.title}>設計積雪量・風速・地域係数レポート</Text>
            <Text style={s.subtitle}>建築基準法告示に基づく 積雪・風・地震 の地域諸元</Text>
          </View>
          <View style={s.metaWrap}>
            <View style={s.metaRow}><Text style={s.metaLabel}>作成日</Text><Text>{dateDot}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>座標系</Text><Text>WGS84 / 世界測地系</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>出　典</Text><Text>国土地理院 ほか</Text></View>
          </View>
        </View>

        {/* 所在地バー */}
        <View style={s.loc}>
          <View style={s.locRow}>
            <View style={s.locLeft}>
              <Text style={s.locLabel}>所在地 / LOCATION</Text>
              <Text style={s.placeName}>{data.placeName ?? '所在地情報なし（海上など）'}</Text>
              <View style={s.coordRow}>
                <View style={s.coordItem}><Text style={s.coordLabel}>緯度</Text><Text>{point.lat.toFixed(6)}</Text></View>
                <View style={s.coordItem}><Text style={s.coordLabel}>経度</Text><Text>{point.lng.toFixed(6)}</Text></View>
              </View>
            </View>
            <View style={s.locRight}>
              <View style={[s.metricCell, { borderRightWidth: 1, borderRightColor: C.line2 }]}>
                <Text style={s.metricLabel}>標高</Text>
                <Text style={s.metricVal}>{data.elevation != null ? data.elevation.toFixed(1) : '—'}<Text style={s.unitSm}> m</Text></Text>
              </View>
              <View style={[s.metricCell, { borderRightWidth: 1, borderRightColor: C.line2 }]}>
                <Text style={s.metricLabel}>海率</Text>
                <Text style={s.metricVal}>{data.seaRatio != null ? (data.seaRatio * 100).toFixed(1) : '—'}<Text style={s.unitSm}> %</Text></Text>
              </View>
              <View style={s.metricCell}>
                <Text style={s.metricLabel}>陸率</Text>
                <Text style={s.metricVal}>{data.landRatio != null ? (data.landRatio * 100).toFixed(1) : '—'}<Text style={s.unitSm}> %</Text></Text>
              </View>
            </View>
          </View>
          <Text style={s.locNote}>※ 海率は対象地点を中心とする半径 {data.radiusKm} km の円内に占める海面積の割合。</Text>
        </View>

        {/* 地図 ＋ 海岸線距離 */}
        <View style={s.mapRow}>
          <View style={s.mapBox}>
            {data.mapImage ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={s.mapImg} src={data.mapImage} />
            ) : (
              <View style={s.mapPlaceholder}><Text style={s.mapPlaceholderTxt}>地図を取得できませんでした</Text></View>
            )}
            <View style={s.mapCaption}>
              <Text style={s.mapCapPill}>対象地点（赤点）／ 海率算定円 R = {data.radiusKm} km（破線）</Text>
              <Text style={s.mapCapRight}>© 国土地理院</Text>
            </View>
          </View>
          <View style={s.shoreCard}>
            <Text style={s.shoreHead}>海岸線・湖岸線までの距離</Text>
            <ShoreFigure distM={shoreM} />
            <Text style={s.shoreFoot}>最寄りの海岸線・湖岸線までの直線距離。地表面粗度区分の判定の目安。</Text>
          </View>
        </View>

        {/* 3カード */}
        <View style={s.cardRow}>
          {/* 積雪 */}
          <Card title="設計用積雪量" law="平成12年建設省告示 第1455号" accent={C.snowBar}>
            {snow && snow.usable ? (
              <>
                <View style={[s.valBlock, { backgroundColor: C.snowBg }]}>
                  <Text style={s.valLabel}>積雪深 d</Text>
                  <BigVal value={snow.noSnow ? '0' : (snow.depthCm != null ? snow.depthCm.toFixed(0) : '—')} unit="cm" color={C.snowText} />
                </View>
                {snow.noSnow ? (
                  <View style={{ padding: p(12) }}><Text style={s.note}>積雪荷重の対象区域外（第0区・積雪なし）。</Text></View>
                ) : (
                  <>
                    <View style={s.tbl}>
                      <TRow k="地域区分" v={`第 ${snow.zone} 区`} bold />
                      <TRow k="α（標高係数）" v={String(snow.alpha)} />
                      <TRow k="β（海率係数）" v={minus(snow.beta)} />
                      <TRow k="γ（定数項）" v={String(snow.gamma)} />
                      <TRow k="R（海率計算半径）" v={`${snow.R} km`} last />
                    </View>
                    <View style={[s.box, { margin: p(12), marginTop: 'auto', backgroundColor: C.snowBg, borderColor: C.snowBoxBd }]}>
                      <Text style={[s.boxLabel, { color: C.snowBoxLbl }]}>算定式</Text>
                      <Text style={[s.boxText, { color: C.snowText }]}>d =（α×標高＋β×海率＋γ）×100</Text>
                      {data.elevation != null && data.seaRatio != null && snow.depthCm != null && (
                        <Text style={[s.boxText, { color: C.snowBoxSub, marginTop: p(3), fontSize: p(9.5) }]}>
                          ={'　'}（{snow.alpha}×{data.elevation.toFixed(1)} + ({minus(snow.beta)})×{data.seaRatio.toFixed(3)} + {snow.gamma}）×100 = {snow.depthCm.toFixed(0)}
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </>
            ) : (
              <CardMuted text={'海上または区域外のため\nこの地点では値を採用しません。'} />
            )}
          </Card>

          {/* 風 */}
          <View style={{ width: p(10) }} />
          <Card title="設計基準風速" law="平成12年建設省告示 第1454号" accent={C.windBar}>
            {wind && wind.usable ? (
              <>
                <View style={[s.valBlock, { backgroundColor: C.windBg }]}>
                  <Text style={s.valLabel}>基準風速 V0</Text>
                  <BigVal value={String(wind.Vo)} unit="m/s" color={C.windText} />
                </View>
                <View style={s.tbl}>
                  <TRow k="地域区分" v={`第 ${wind.zone} 区`} bold />
                  <TRow k="海岸線まで" v={fmtDistKm(shoreM)} last />
                </View>
                <View style={[s.box, { margin: p(12), marginBottom: 0, backgroundColor: C.windBg, borderColor: C.windBoxBd }]}>
                  <Text style={[s.boxLabel, { color: C.windBoxLbl }]}>海岸線・湖岸線までの距離（第1454号）</Text>
                  <Text style={[s.boxText, { color: C.windBoxTxt }]}>地表面粗度区分の判定用の距離（地図上に測線を表示）。区分の確定・個別パラメータは設計者判断による。</Text>
                </View>
                <View style={{ marginTop: 'auto', padding: p(12) }}>
                  <Text style={s.note}>基準風速 V0 は、各地の再現期間 50 年の 10 分間平均風速に相当する値。</Text>
                </View>
              </>
            ) : (
              <CardMuted text={'海上または区域外のため\nこの地点では値を採用しません。'} />
            )}
          </Card>

          {/* 地震 */}
          <View style={{ width: p(10) }} />
          <Card title="地震地域係数" law="昭和55年建設省告示 第1793号" accent={C.eqBar}>
            {seismic && seismic.usable ? (
              <>
                <View style={[s.valBlock, { backgroundColor: C.eqBg }]}>
                  <Text style={s.valLabel}>地域係数 Z</Text>
                  <BigVal value={seismic.Z.toFixed(1)} color={C.eqText} />
                </View>
                <View style={s.tbl}>
                  <TRow k="地域区分" v={`第 ${seismic.zone} 区`} bold />
                  <TRow k="係数 Z の範囲" v="0.7 〜 1.0" last />
                </View>
                <View style={[s.box, { margin: p(12), marginBottom: 0, backgroundColor: C.eqBg, borderColor: C.eqBoxBd }]}>
                  <Text style={[s.boxLabel, { color: C.eqBoxLbl }]}>区分の目安</Text>
                  <View style={{ flexDirection: 'column' }}>
                    {[['第 1 区', 'Z = 1.0'], ['第 2 区', 'Z = 0.9'], ['第 3 区', 'Z = 0.8 / 0.7']].map(([a, b]) => (
                      <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: p(3) }}>
                        <Text style={[s.boxText, { color: C.eqBoxTxt, fontSize: p(9.5) }]}>{a}</Text>
                        <Text style={[s.boxText, { color: C.eqBoxTxt, fontSize: p(9.5) }]}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ marginTop: 'auto', padding: p(12) }}>
                  <Text style={s.note}>地震力の算定に用いる地域別の低減係数。値が大きいほど想定地震動が大きい。</Text>
                </View>
              </>
            ) : (
              <CardMuted text={'海上または区域外のため\nこの地点では値を採用しません。'} />
            )}
          </Card>
        </View>

        {/* フッター */}
        <View style={s.footer} fixed>
          <Text style={s.footDisc}>
            免責: 本レポートは設計検討の補助を目的とした参考情報です。地域区分・各係数は告示・データの境界付近で誤差を含む場合があり、最終的な設計用荷重の決定は資格ある技術者による確認・判断が必要です。
            データ出典: 国土数値情報（都市地域A09・行政区域N03・湖沼W09／国土交通省・CC BY 4.0）/ 国土地理院（標高・背景地図）/ OpenStreetMap（住所検索 Nominatim・ODbL）。
          </Text>
          <View style={s.footBrand}>
            <Text style={s.footBrandName}>Hazard Map</Text>
            <Text style={s.footBrandSub}>設計用地域情報レポート</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
