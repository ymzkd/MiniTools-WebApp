// Hazard Map の設計用荷重レポート（react-pdf / ベクターPDF）。
// このファイルは重い @react-pdf/renderer を読み込むため、アプリ本体から静的 import せず、
// generate.ts 経由の動的 import からのみ到達する（初期表示に乗せない）。
import { Document, Page, View, Text, Image, Font, StyleSheet } from '@react-pdf/renderer';
import type { HazardReportData } from './types';

// 日本語フォント。public/fonts に同梱し、ビルド後は同一オリジンの /fonts/... で配信される
// （Vite preview / Netlify・Vercel の静的配信 / Dokploy の express.static いずれも対応）。
// react-pdf は生成時にだけこの URL を取得し、使用グリフのみを PDF に埋め込む（出力は軽量）。
Font.register({
  family: 'NotoSansJP',
  src: '/fonts/NotoSansJP-Regular.otf',
});
// 日本語の途中改行を許可（URLや長い住所で行があふれないように）。
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: '#1f2937',
  sub: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  band: '#1e3a5f',
  card: '#f9fafb',
  snow: '#2563eb',
  wind: '#dc2626',
  seismic: '#d97706',
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 9,
    color: C.ink,
    paddingTop: 32,
    paddingBottom: 56,
    paddingHorizontal: 36,
    lineHeight: 1.4,
  },
  // ヘッダー
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: C.band,
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: { fontSize: 16, color: C.band },
  subtitle: { fontSize: 8, color: C.sub, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  metaLabel: { fontSize: 7, color: C.faint },
  metaValue: { fontSize: 9 },

  // ロケーション
  locRow: { flexDirection: 'row', marginBottom: 14 },
  locLeft: { flex: 1, paddingRight: 12 },
  placeName: { fontSize: 12, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', marginBottom: 6 },
  cellLabel: { fontSize: 7, color: C.faint },
  cellValue: { fontSize: 10 },
  mapBox: {
    width: 220,
    height: 150,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: C.card,
  },
  mapImg: { width: '100%', height: '100%', objectFit: 'cover' },
  mapPlaceholder: { fontSize: 8, color: C.faint, margin: 'auto', textAlign: 'center' },

  // 荷重セクション
  section: { marginBottom: 12, borderWidth: 1, borderColor: C.line, borderRadius: 4 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  sectionTitle: { fontSize: 10, color: '#ffffff' },
  sectionLaw: { fontSize: 7, color: 'rgba(255,255,255,0.85)' },
  sectionBody: { flexDirection: 'row', padding: 10 },
  sectionMain: { flex: 1, paddingRight: 10 },

  // 採用値チップ
  chip: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  chipLabel: { fontSize: 7, color: 'rgba(255,255,255,0.9)' },
  chipValue: { fontSize: 13, color: '#ffffff' },

  // テーブル
  table: { borderTopWidth: 1, borderTopColor: C.line },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 3,
  },
  th: { flex: 1, color: C.sub, fontSize: 8 },
  td: { width: 110, textAlign: 'right', fontSize: 9 },

  note: { fontSize: 7, color: C.faint, marginTop: 4 },
  unavail: { fontSize: 9, color: C.faint },

  // フッター
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
  },
  disclaimer: { fontSize: 6.5, color: C.faint, lineHeight: 1.3 },
  sources: { fontSize: 6.5, color: C.faint, marginTop: 3 },
  pageNum: { position: 'absolute', bottom: 24, right: 36, fontSize: 7, color: C.faint },
});

const fmt = (n: number | null | undefined, digits = 1, unit = ''): string =>
  n == null ? '—' : `${n.toFixed(digits)}${unit}`;

const fmtDist = (m: number | null | undefined): string => {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.tr}>
      <Text style={s.th}>{k}</Text>
      <Text style={s.td}>{v}</Text>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.cell}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellValue}>{value}</Text>
    </View>
  );
}

function Section({
  title,
  law,
  color,
  children,
}: {
  title: string;
  law: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section} wrap={false}>
      <View style={[s.sectionHead, { backgroundColor: color }]}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionLaw}>{law}</Text>
      </View>
      {children}
    </View>
  );
}

function Unavailable() {
  return (
    <View style={s.sectionBody}>
      <Text style={s.unavail}>海上または区域外のため、この地点では値を採用しません。</Text>
    </View>
  );
}

export function HazardReportDocument({ data }: { data: HazardReportData }) {
  const { point, snow, wind, seismic, shore } = data;

  return (
    <Document
      title={`Hazard Report ${point.lat.toFixed(4)},${point.lng.toFixed(4)}`}
      author="MiniTools Hazard Map"
    >
      <Page size="A4" style={s.page}>
        {/* ヘッダー */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.title}>設計用荷重レポート</Text>
            <Text style={s.subtitle}>Hazard Map — 建築基準法告示に基づく地点別の設計用荷重パラメータ</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.metaLabel}>出力日</Text>
            <Text style={s.metaValue}>{data.generatedAt}</Text>
          </View>
        </View>

        {/* ロケーション */}
        <View style={s.locRow}>
          <View style={s.locLeft}>
            <Text style={s.placeName}>{data.placeName ?? '所在地情報なし（海上など）'}</Text>
            <View style={s.grid}>
              <Cell label="緯度" value={point.lat.toFixed(6)} />
              <Cell label="経度" value={point.lng.toFixed(6)} />
              <Cell label="標高" value={fmt(data.elevation, 1, ' m')} />
              <Cell
                label={`海率 / 陸率（半径 ${data.radiusKm} km 円内）`}
                value={
                  data.seaRatio != null && data.landRatio != null
                    ? `${(data.seaRatio * 100).toFixed(1)} % / ${(data.landRatio * 100).toFixed(1)} %`
                    : '—'
                }
              />
            </View>
          </View>
          <View style={s.mapBox}>
            {data.mapImage ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={s.mapImg} src={data.mapImage} />
            ) : (
              <Text style={s.mapPlaceholder}>地図を取得できませんでした</Text>
            )}
          </View>
        </View>

        {/* 積雪 */}
        <Section title="設計用積雪量" law="平12建告1455号" color={C.snow}>
          {snow && snow.usable ? (
            snow.noSnow ? (
              <View style={s.sectionBody}>
                <View style={[s.chip, { backgroundColor: C.snow }]}>
                  <Text style={s.chipLabel}>積雪深 d</Text>
                  <Text style={s.chipValue}>0 cm</Text>
                </View>
                <Text style={s.unavail}>積雪荷重の対象区域外（第0区・積雪なし）。</Text>
              </View>
            ) : (
              <View style={s.sectionBody}>
                <View style={s.sectionMain}>
                  {snow.depthCm != null && (
                    <View style={[s.chip, { backgroundColor: C.snow }]}>
                      <Text style={s.chipLabel}>垂直積雪量 d</Text>
                      <Text style={s.chipValue}>{`${snow.depthCm.toFixed(0)} cm`}</Text>
                    </View>
                  )}
                  <Text style={s.note}>
                    d = (α × 標高 + β × 海率 + γ) × 100
                    {data.elevation != null && data.seaRatio != null
                      ? ` = (${snow.alpha} × ${data.elevation.toFixed(1)} + ${snow.beta} × ${data.seaRatio.toFixed(3)} + ${snow.gamma}) × 100`
                      : ''}
                  </Text>
                </View>
                <View style={{ width: 240 }}>
                  <View style={s.table}>
                    <Row k="地域区分" v={`第${snow.zone}区`} />
                    <Row k="α（標高係数）" v={String(snow.alpha)} />
                    <Row k="β（海率係数）" v={String(snow.beta)} />
                    <Row k="γ（定数項）" v={String(snow.gamma)} />
                    <Row k="R（海率計算半径）" v={`${snow.R} km`} />
                  </View>
                </View>
              </View>
            )
          ) : (
            <Unavailable />
          )}
        </Section>

        {/* 風 */}
        <Section title="設計基準風速" law="平12建告1454号" color={C.wind}>
          {wind && wind.usable ? (
            <View style={s.sectionBody}>
              <View style={s.sectionMain}>
                <View style={[s.chip, { backgroundColor: C.wind }]}>
                  <Text style={s.chipLabel}>基準風速 V0</Text>
                  <Text style={s.chipValue}>{`${wind.Vo} m/s`}</Text>
                </View>
                {shore && shore.nearestM != null && (
                  <Text style={s.note}>
                    {`最寄りの${shore.nearestKind === 'lake' ? '湖岸線' : '海岸線'}まで: ${fmtDist(
                      shore.nearestM
                    )}（地表面粗度区分の判定の参考。区分の確定は設計者判断）`}
                  </Text>
                )}
              </View>
              <View style={{ width: 240 }}>
                <View style={s.table}>
                  <Row k="地域区分" v={`第${wind.zone}区`} />
                  <Row k="基準風速 V0" v={`${wind.Vo} m/s`} />
                </View>
              </View>
            </View>
          ) : (
            <Unavailable />
          )}
        </Section>

        {/* 地震 */}
        <Section title="地震地域係数" law="昭55建告1793号" color={C.seismic}>
          {seismic && seismic.usable ? (
            <View style={s.sectionBody}>
              <View style={s.sectionMain}>
                <View style={[s.chip, { backgroundColor: C.seismic }]}>
                  <Text style={s.chipLabel}>地震地域係数 Z</Text>
                  <Text style={s.chipValue}>{String(seismic.Z)}</Text>
                </View>
              </View>
              <View style={{ width: 240 }}>
                <View style={s.table}>
                  <Row k="地域区分" v={`第${seismic.zone}区`} />
                  <Row k="地震地域係数 Z" v={String(seismic.Z)} />
                </View>
              </View>
            </View>
          ) : (
            <Unavailable />
          )}
        </Section>

        {/* フッター */}
        <View style={s.footer} fixed>
          <Text style={s.disclaimer}>
            免責: 本レポートは設計検討の補助を目的とした参考情報です。地域区分・各係数は告示・データの境界付近で
            誤差を含む場合があり、最終的な設計用荷重の決定は資格ある技術者による確認・判断が必要です。
          </Text>
          <Text style={s.sources}>
            データ出典: 国土数値情報（都市地域A09・行政区域N03・湖沼W09／国土交通省・CC BY 4.0） / 国土地理院（標高・背景地図） / OpenStreetMap（住所検索 Nominatim・ODbL）
          </Text>
        </View>
        <Text
          style={s.pageNum}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
