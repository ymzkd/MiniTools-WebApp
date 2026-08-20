// 地表面粗度区分(平12建告1454号 第2)の判定。
//
// 告示の条件を、判定できるところまで機械的に整理する:
//   Ⅰ  都市計画区域外で極めて平坦かつ障害物のない区域   → **特定行政庁が規則で定める**
//   Ⅱ  (a) 都市計画区域外のうちⅠ以外。ただし高さ13m以下の建築物は除く(→Ⅲ)
//       (b) 都市計画区域内のうちⅣ以外で、海岸線・湖岸線(対岸1500m以上)から500m以内。
//           ただし ①高さ13m以下 ②海岸線等から200m超かつ高さ31m以下 は除く(→Ⅲ)
//   Ⅲ  Ⅰ・Ⅱ・Ⅳ のいずれにも該当しない区域
//   Ⅳ  都市計画区域内で都市化が極めて著しい区域         → **特定行政庁が規則で定める**
//
// Ⅰ・Ⅳ は特定行政庁の指定によるため、地点データだけから判定できるのは **Ⅱ か Ⅲ か**
// までである(指定があればそちらが優先する)。またⅡは建築物の高さで分かれるので、単一の
// 区分ではなく「高さ帯ごとの区分」を返し、画面には併記する。

export type RoughnessCategory = 'Ⅰ' | 'Ⅱ' | 'Ⅲ' | 'Ⅳ';

export interface RoughnessBand {
  /** 高さの条件（例: 「13m 以下」「13m 超」「高さによらず」） */
  height: string;
  category: RoughnessCategory;
}

export interface RoughnessResult {
  available: boolean;
  /** 高さ帯ごとの区分。判定できないときは空。 */
  bands: RoughnessBand[];
  /** 判定の根拠（都市計画区域の内外・距離の条件）。 */
  basis: string[];
  /** 判定できなかった理由（available=false のとき）。 */
  reason?: string;
}

/** 平12建告1454号の粗度区分Ⅱの距離しきい値。 */
const NEAR_M = 200; // これを超えると高さ31m以下はⅢへ
const FAR_M = 500; // これを超えるとⅡの対象外(都市計画区域内)

export interface RoughnessInput {
  /** 都市計画区域の内(true)/外(false)。不明なら null。 */
  urbanInside: boolean | null;
  /** 最寄りの海岸線・対象湖岸線までの距離(m)。不明なら null。 */
  shoreM: number | null;
  /** その最寄り線の種別(表示用)。 */
  shoreKind: 'coast' | 'lake' | null;
}

export function roughnessCases({ urbanInside, shoreM, shoreKind }: RoughnessInput): RoughnessResult {
  if (urbanInside == null) {
    return { available: false, bands: [], basis: [], reason: '都市計画区域の内外が取得できませんでした' };
  }
  const shoreLabel = shoreKind === 'lake' ? '湖岸線' : '海岸線';

  // 都市計画区域外: 高さ13m以下ならⅢ、超えればⅡ（距離は条件に入らない）。
  if (!urbanInside) {
    return {
      available: true,
      bands: [
        { height: '13m 以下', category: 'Ⅲ' },
        { height: '13m 超', category: 'Ⅱ' },
      ],
      basis: ['都市計画区域外'],
    };
  }

  // 都市計画区域内: 海岸線・湖岸線からの距離で分かれる。
  if (shoreM == null) {
    return {
      available: false,
      bands: [],
      basis: ['都市計画区域内'],
      reason: '海岸線・湖岸線までの距離が取得できませんでした',
    };
  }
  if (shoreM > FAR_M) {
    return {
      available: true,
      bands: [{ height: '高さによらず', category: 'Ⅲ' }],
      basis: ['都市計画区域内', `${shoreLabel}まで ${FAR_M}m 超`],
    };
  }
  if (shoreM > NEAR_M) {
    return {
      available: true,
      bands: [
        { height: '31m 以下', category: 'Ⅲ' },
        { height: '31m 超', category: 'Ⅱ' },
      ],
      basis: ['都市計画区域内', `${shoreLabel}まで ${NEAR_M}m 超 ${FAR_M}m 以内`],
    };
  }
  return {
    available: true,
    bands: [
      { height: '13m 以下', category: 'Ⅲ' },
      { height: '13m 超', category: 'Ⅱ' },
    ],
    basis: ['都市計画区域内', `${shoreLabel}まで ${NEAR_M}m 以内`],
  };
}
