# Japanese address API (Jageocoder)

MiniToolsとは独立したDokploy Application。地図ライブラリや背景タイルは変更しない。
住所→座標と座標→近傍住所候補を提供する。店舗・施設名検索や正確な地番判定ではない。
検索時に外部ネットワークを使わず、公開デモRPCやNominatimへの自動フォールバックもない。

## 今回の開発構成

| 用途 | Dokploy Application | 接続先 |
|---|---|---|
| 住所API | `geocoding-api` / `kkvAxDoyAD-R0QnswckSv` | 内部DNS `http://geocoding-api-zhax2n:8000` (公開ドメインなし) |
| 比較用MiniTools | `minitools-geocoding-preview` / `y_ni5zmQv-3RGQHk6tdEB` | `http://minitools-geocoding.100-105-176-107.sslip.io/hazard` (tailnet) |
| 既存本番 | `minitools` | 変更なし。Nominatimのまま |

ソースは `ymzkd/MiniTools-WebApp` の `feat/local-geocoding`。
APIのDockerfileは `services/jageocoder/Dockerfile`、ビルドコンテキストは `/services/jageocoder`。
APIはホストのポートに公開せず、`dokploy-network` 上のMiniToolsからのみ参照する。
比較用MiniToolsには `MLIT_API_KEY` をコピーせず、Hazard Mapは既存の内部jiban-apiを参照。
既存PRの自動プレビュー環境も変更しない。

## 開発側の切替 (UI切替なし)

MiniToolsの**実行時**環境変数:

```dotenv
# 未指定時もnominatim。既存のブラウザ直接呼び出しを維持する。
GEOCODING_PROVIDER=nominatim

# ローカル住所APIを使う比較用インスタンスでは以下にする:
# GEOCODING_PROVIDER=jageocoder
# GEOCODING_API_URL=http://geocoding-api-zhax2n:8000
```

設定変更後、対象の比較用MiniToolsだけを再デプロイし、ブラウザを再読み込みする。
`/api/geocoding/config` でprovider・出典・制約を確認できる。
API障害時は502、未一致は `result: null`。自動的にNominatimへは送らない。
API側とMiniTools側それぞれ全利用者合計120リクエスト/分に制限。
MiniToolsの上流タイムアウト8秒、API側同時接続32、辞書検索は1ワーカーで直列化。
1,500mより遠い逆引き候補は返さない (`MAX_REVERSE_DISTANCE_M` で変更可能)。
検索結果は近似位置。画面および印刷レポートには辞書の出典と注意書きを引き継ぐ。

ローカル開発ではExpressを `PORT=3001` で起動。Viteの `/api/geocoding` は
`MINITOOLS_API_URL` (既定 `http://127.0.0.1:3001`) に転送する。

## 辞書の導入・更新

今回使用する全国住居表示・地番辞書は `jukyo_all_20250423_v22.zip` (2025-04-23)。
圧縮4.5GB、展開約16.1GB、逆引きインデックス用の追加容量が必要。
新規導入時だけ公式配布ZIPをダウンロードし、配布元掲載のSHA1を検証する。
API起動時や検索時にデータの再取得はしない。

```bash
python services/jageocoder/install_dictionary.py \
  --data-dir /home/ymzkd/geocoding-data/vol \
  --archive /home/ymzkd/geocoding-data/archives/jukyo_all_20250423_v22.zip
docker build -t minitools-jageocoder:dev services/jageocoder
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v /home/ymzkd/geocoding-data/vol:/data \
  minitools-jageocoder:dev python prepare.py
```

Dokployでは `/home/ymzkd/geocoding-data/vol` を `/data` にbind mount。
辞書・RtreeのファイルにコンテナのUID 10001が読み書きできる権限を与える。
SQLite本体はJageocoderの `mode=r` で開くが、Rtreeライブラリは索引を読み書きで開く。
辞書のREADMEを必ず同じ場所に残す。ライセンス全文はAPIの `/license` で取得可能。
更新はAPIを止めている間に別ディレクトリへ展開・索引生成・検証し、mount先を切り替える。
元の辞書をインプレースで上書きしない。

## エンドポイント

- `GET /health` — readiness / 辞書名 / 外部検索なし
- `GET /search?q=東京都新宿区西新宿2-8-1` — `result: {lat,lng,address,level,matched,approximate}` またはnull
- `GET /reverse?lat=35.6896&lng=139.6917` — 近傍候補。同じ形式に `distance_m` を追加
- `GET /license` — 同梱READMEの利用条件・出典全文
- `GET /dataset` — 導入したZIPのURL・版・ハッシュ

ユーザー入力の住所をアクセスログへ残さないようuvicornのアクセスログは無効。
検索キャッシュはプロセス内のみ、前方・逆引きそれぞれ最大2,048件。

## 検証

```bash
# Python仮想環境に requirements.txt とテスト用httpxを導入した上で:
cd services/jageocoder
python -m unittest discover -s tests -v

# リポジトリルート:
node --test --test-concurrency=1 tests/geocoding.test.mjs
npm run build
```

辞書データの利用条件はソフトウェアのMITライセンスとは別。
元データは国土交通省の位置参照情報、国土地理院住居表示住所、Geolonia住所データ、
デジタル庁アドレス・ベース・レジストリ、法務省登記所備付地図データ等。
詳細と必須表記は実際に導入した `dictionary/README.md` を正とする。
