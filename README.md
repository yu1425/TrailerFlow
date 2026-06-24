# TrailerFlow

> 映画館の予告編タイムを、ずっと。

TrailerFlow は、映画館で本編前に流れる「予告編タイム」を Web 上で連続再生するサービスの MVP です。ユーザーは映画を検索するのではなく、サイトを開くと予告編が次々と流れます。見ながら「観たい」「次へ」「この系統もっと」「今は違う」を操作でき、好みは匿名のままブラウザ単位で学習されます。

- **ログイン不要** — `localStorage` に保存する `anonymousUserId` で識別します。
- **動画は保存しません** — YouTube 埋め込みプレイヤーのみを使います。
- **Manual Curation Mode** — TMDb 商用契約前でも、手動キュレーションした公式 YouTube 予告編で公開 β 運用が可能です。

## 技術スタック

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase / PostgreSQL
- YouTube IFrame Player API
- YouTube Data API v3（候補自動取得用）
- TMDb API（個人検証用 / Bearer トークン認証）

## ディレクトリ構成

```
app/            ページと API ルート (page.tsx, watchlist, channels, about, admin/*, api/*)
components/     UI コンポーネント (TrailerPlayer, ActionBar, ...)
lib/            ドメインロジック (tmdb, feed, contentFeed, dataMode, ...)
types/          共有の型定義 (content.ts — curation 用型も含む)
supabase/       schema.sql (contents/content_trailers/content_tags/official_channels 含む)
scripts/        sync-tmdb.ts / import-manual-trailers.ts / import-youtube-candidates.ts
data/           manual-trailers.csv (手動キュレーション用 CSV)
```

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env.local` を作成し、値を埋めます。

```bash
cp .env.example .env.local
```

| 変数 | 用途 | 公開範囲 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | クライアント可 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon キー | クライアント可 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role キー | **サーバー専用** |
| `TMDB_ACCESS_TOKEN` | TMDb v4 API Read Access Token | **サーバー専用** |
| `ADMIN_SECRET` | 同期 / 管理 API 保護用（任意） | **サーバー専用** |
| `YOUTUBE_API_KEY` | YouTube Data API v3 キー（候補自動取得用） | **サーバー専用** |
| `DATA_MODE` | フィードのデータソース (`manual` / `tmdb` / `mixed`) | **サーバー専用** |
| `NEXT_PUBLIC_DEBUG_PANEL` | `true` で画面隅に KPI デバッグパネルを表示（任意） | クライアント可 |

> `SUPABASE_SERVICE_ROLE_KEY`、`TMDB_ACCESS_TOKEN`、`YOUTUBE_API_KEY` は絶対にクライアントへ出さないでください。クライアントで使うのは `NEXT_PUBLIC_*` の変数だけです。

### 3. Supabase スキーマの適用

`supabase/schema.sql` をプロジェクトに適用します。いずれかの方法で実行してください。

- **Supabase ダッシュボード**: SQL Editor に `supabase/schema.sql` の内容を貼り付けて実行。
- **Supabase CLI**:
  ```bash
  supabase db push --file supabase/schema.sql
  ```
- **psql**:
  ```bash
  psql "$DATABASE_URL" -f supabase/schema.sql
  ```

スキーマ適用時に `channels` テーブルへ既定チャンネル（ロビー / 新作 / 人気 / 日本映画 / アクション / 恋愛 / ホラー / アニメ / ランダム）が seed されます。

### 4. TMDb API トークンの取得

1. <https://www.themoviedb.org/> でアカウントを作成。
2. Settings → API から API を申請。
3. **API Read Access Token (v4 auth)** をコピーし、`TMDB_ACCESS_TOKEN` に設定します（`Authorization: Bearer <token>` として使われます）。

### 5. 開発サーバーの起動

```bash
npm run dev
```

<http://localhost:3000> を開きます。データがまだ無い場合は、先に下記の同期を実行してください。

## TMDb データの同期

popular / now playing / upcoming / top rated の各リストから映画と「ベストな予告編」を取得し、Supabase に upsert します。region は `JP`、language は `ja-JP`（予告編が無ければ `en-US`）を優先します。

### CLI から（推奨）

```bash
# .env.local を読み込んで実行（各リスト 1 ページ）
export $(grep -v '^#' .env.local | xargs) && npm run sync:tmdb

# 各リストを 3 ページ分まで取得
export $(grep -v '^#' .env.local | xargs) && npm run sync:tmdb -- 3
```

### API から

```bash
# ADMIN_SECRET 未設定なら認証不要
curl -X POST http://localhost:3000/api/admin/sync/tmdb \
  -H "Content-Type: application/json" \
  -d '{"pages": 1}'

# ADMIN_SECRET を設定している場合は Bearer トークンが必須
curl -X POST http://localhost:3000/api/admin/sync/tmdb \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pages": 2}'
```

レスポンスには処理件数とエラー一覧が含まれます。1 件の失敗で全体が止まらないよう、映画単位でエラーをスキップして継続します。

> **TMDb personal API は個人検証用です。** TMDb の利用規約上、personal API key を使った公開サービスの運用は許可されていない場合があります。公開 β / 商用利用には Manual Curation Mode（下記）を使うか、TMDb の商用ライセンスを取得してください。

## Manual Curation Mode

TMDb 商用契約前に公開 β 品質のフィードを構築するための仕組みです。公式 YouTube 予告編を手動または半自動で登録・承認し、承認済みコンテンツだけを公開フィードに流します。

### データモデル

| テーブル | 説明 |
| --- | --- |
| `contents` | キュレーション対象コンテンツ。`content_type` (movie/anime/game/tv/travel/restaurant)、`source` (manual/youtube/tmdb/wikidata)、`curation_status` (draft/candidate/approved/rejected/needs_review) を持つ |
| `content_trailers` | コンテンツに紐づく YouTube 予告編。`youtube_video_key` でユニーク |
| `content_tags` | 自由形式のタグ（ジャンル、テーマなど） |
| `official_channels` | YouTube 候補自動取得用の公式チャンネル一覧 |

### DATA_MODE

`DATA_MODE` 環境変数でフィードのデータソースを切り替えます。

| 値 | 動作 | 推奨用途 |
| --- | --- | --- |
| `manual` | `contents` テーブルの approved データのみ | **公開 β** |
| `tmdb` | 従来の `movies` / `trailers` テーブルのみ | 個人ローカル検証 |
| `mixed` | approved contents を優先し、不足分を TMDb で補填 | **開発中のデフォルト** |

### 手動 CSV インポート

1. `data/manual-trailers.csv` を編集します。列:

   ```
   content_type,title,original_title,overview,short_copy,release_date,
   genres,tags,language,country,official_url,youtube_video_key,
   trailer_title,channel_title,channel_id
   ```

2. インポート実行:

   ```bash
   export $(grep -v '^#' .env.local | xargs) && npm run import:manual
   ```

3. `/admin/curation` で確認し、`approved` に変更するとフィードに出ます。

### YouTube 候補自動取得

YouTube Data API v3 を使い、登録した公式チャンネルの最新動画からタイトルに「予告」「Trailer」等を含む動画を自動収集します。

1. YouTube API キーの取得:
   - <https://console.cloud.google.com/> → APIs & Services → YouTube Data API v3 を有効化
   - API キーを作成し `YOUTUBE_API_KEY` に設定

2. 公式チャンネルの登録:

   ```sql
   INSERT INTO official_channels (id, channel_title, content_type, language)
   VALUES
     ('UCxxxxxx', '東宝MOVIEチャンネル', 'movie', 'ja'),
     ('UCyyyyyy', 'Warner Bros. Japan', 'movie', 'ja');
   ```

3. 候補取得実行:

   ```bash
   export $(grep -v '^#' .env.local | xargs) && npm run import:youtube
   ```

4. 取得された動画は `curation_status = 'candidate'` で保存されます。**候補はフィードに出ません。** `/admin/curation` で内容を確認し、`approved` にしたものだけが公開されます。

### 管理 UI (Admin Curation)

`/admin/curation` でキュレーション管理ができます。

- **一覧**: candidate / approved / rejected / needs_review / draft をタブ切替
- **プレビュー**: YouTube 埋め込みプレイヤーで予告編を確認
- **サムネイル**: maxresdefault / hqdefault を並べて表示
- **編集**: タイトル、概要、短いコピー、タグ、品質スコア (0–100)、ステータス
- **クイック操作**: 承認 / 却下 / 要レビューをワンクリックで切替
- **YouTube で開く**: 元動画をブラウザで確認
- **公式チャンネル名**: 取得元チャンネルを表示

`ADMIN_SECRET` を設定している場合、API (`/api/admin/curation`) は `Authorization: Bearer <ADMIN_SECRET>` を要求します。`/admin/curation` を開くと初回にアンロック欄が表示されるので、`ADMIN_SECRET` を入力してください（このブラウザの `localStorage` にのみ保存され、以降の取得・更新で Bearer トークンとして送信されます）。本番では併せて Basic Auth やネットワーク制限を追加してください。

### キュレーションワークフロー

```
CSV / YouTube自動取得
  ↓
draft / candidate（フィードに出ない）
  ↓
/admin/curation でレビュー
  ↓ 承認
approved（フィードに出る）
  ↓ 問題があれば
needs_review / rejected
```

## 操作方法（連続視聴体験）

- 初回は「予告編を浴びはじめる」ボタンで再生開始（自動再生制限の回避）。
- 予告編が終わると自動で次へ。終了直前/切替時は「次の予告編」カードを一瞬表示し、黒画面のちらつきを防ぎます。
- 言語トグル（日本語 / English）で予告編の優先言語を切替。日本語予告が無い作品は自動的に英語予告へフォールバックします。詳細パネルには「日本語予告 / 英語予告」を表示。
- 同一作品はセッション内で再登場しません。最近見た作品は最大 200 件まで `localStorage` に保存し、フィード取得時に強く除外します。

### キーボードショートカット（PC）

| キー | 動作 |
| --- | --- |
| `Space` | 再生 / 一時停止 |
| `→` | 次へ |
| `W` | 観たい |
| `L` | この系統もっと |
| `D` | 今は違う |
| `M` | ミュート切替 |
| `?` | ショートカット一覧の表示切替 |

### デバッグパネル

`NEXT_PUBLIC_DEBUG_PANEL=true` を設定すると、画面右下にセッション KPI（経過時間 / 視聴本数 / スキップ数 / 観たい登録数 / 平均視聴秒数 / 残りキュー数）が表示されます。実機検証時の確認用で、本番では未設定にしてください。

## 実機検証で見るべき KPI

「連続視聴体験の気持ちよさ」を測るため、初回実機検証では以下を観測します。デバッグパネル（上記）はセッション単位の即時確認に、サーバー側の `user_events` テーブルは集計分析に使えます。

| KPI | 定義 | 算出のヒント（`user_events`） |
| --- | --- | --- |
| **平均視聴本数** | 1 セッションあたり再生した予告編の本数 | `play_start` 数 ÷ セッション数 |
| **10本以上視聴率** | 10 本以上見たセッションの割合 | `play_start` を匿名ユーザー×日付でグルーピングし、本数 ≥ 10 の比率 |
| **平均滞在時間** | 1 セッションの開始〜最終イベントの時間 | 各セッションの `created_at` の max − min の平均 |
| **スキップ率** | 最後まで見ずに送った割合 | `skip` ÷ (`skip` + `play_end`) |
| **観たい登録率** | 視聴本数に対する「観たい」登録の割合 | `watchlist_add` ÷ `play_start` |
| **再訪率** | 翌日以降に再び訪れた匿名ユーザーの割合 | `anonymous_user_id` ごとの利用日数が 2 日以上の比率 |

> これらは収益化より前に「体験そのものの心地よさ」を判断するための指標です。スキップ率が高すぎる場合はフィードのジャンル/言語マッチや並び順を、平均視聴本数が伸びない場合は遷移演出や初回ロード体験を見直してください。

## 公開β前チェックリスト

公開 β を出す前に、以下を順に確認してください。

- [ ] **承認済み予告編が 50 本以上**（`/admin/curation` の「公開中」ヒーロー数値で確認）
- [ ] **`DATA_MODE=manual`**（公開 β では TMDb を使わない）
- [ ] **TMDb を public beta で使用しない**（`TMDB_ACCESS_TOKEN` は個人検証用のみ）
- [ ] **`npm run test:feed` が PASS**（`needs_review`/未承認がフィードに絶対出ない、初回3本が高品質、を全チャンネルで検証）
- [ ] `npm run build` がエラーなく通る
- [ ] `npm run lint` がエラーなく通る
- [ ] **OGP / Twitter Card 確認**（`NEXT_PUBLIC_SITE_URL` を本番 URL に設定し、X / Slack 等でカード表示をプレビュー）
- [ ] **スマホ実機確認**（動画が最優先で表示され、操作ボタンが親指で押せ、Safari 下バーに隠れない）
- [ ] **About / Contact 確認**（権利表記・問い合わせ先・フォロー導線が正しい）
- [ ] `NEXT_PUBLIC_X_HANDLE` を本物の X アカウントに設定
- [ ] `NEXT_PUBLIC_DEBUG_PANEL` を本番では未設定にする

> フィードは承認済みコンテンツが少なくても破綻しないよう、品質スコア順＋多様性確保＋自動ループで動作します。ただし体験の密度を上げるため、公開時点で 50 本以上を目標にしてください。

## フィードの自動テスト

`needs_review` などの未承認コンテンツが**絶対にフィードに出ない**こと、初回の3本が高品質に保たれることを、全チャンネル × 多数の反復で検証します。

```bash
export $(grep -v '^#' .env.local | xargs) && npm run test:feed
```

`✅ PASS` が2つ出れば OK です。公開β前チェックリストに含めてください。

## 本番ビルド

```bash
npm run build
npm run start
```

## OGP / SNS カード

- OG/Twitter 画像は `app/opengraph-image.tsx`（＋ `app/twitter-image.tsx`）で **`next/og` により動的生成**（1200×630 PNG）。
- 日本語コピー（「映画館の予告編タイムを、ずっと。」）が表示されるよう、**Noto Sans JP Bold**（`app/fonts/NotoSansJP-Bold.ttf`）をバンドルし `ImageResponse` の `fonts` に渡しています。外部 URL fetch は行わず、ビルド時にローカルの TTF を `readFileSync` で読み込みます。
- Noto Sans JP は [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+JP) 提供、**SIL Open Font License 1.1** です。
- `app/layout.tsx` の `metadata.openGraph` / `metadata.twitter` と `metadataBase`（`NEXT_PUBLIC_SITE_URL`）で絶対 URL を解決します。**本番 URL を `NEXT_PUBLIC_SITE_URL` に設定**してから X / Slack 等でカードをプレビューしてください。

## Vercel へのデプロイ

TrailerFlow は Next.js App Router 製なので、Vercel にそのままデプロイできます。

1. **リポジトリを Import**: <https://vercel.com/new> で GitHub 等のリポジトリを選択。Framework Preset は **Next.js** が自動検出されます（Build: `next build` / Install: `npm install`）。
2. **環境変数を設定**（Project → Settings → Environment Variables）。`.env.local` と同じキーを **Production / Preview** に登録します。

   | 変数 | 必須 | 備考 |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | クライアント可 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | クライアント可 |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **サーバー専用** |
   | `DATA_MODE` | ✅ | 公開βは `manual` |
   | `ADMIN_SECRET` | 推奨 | `/api/admin/*` 保護 |
   | `NEXT_PUBLIC_SITE_URL` | ✅ | 本番 URL（OGP 絶対 URL 用） |
   | `NEXT_PUBLIC_X_HANDLE` | 推奨 | フォロー導線 |
   | `TMDB_ACCESS_TOKEN` | 任意 | 公開βでは未使用 |
   | `YOUTUBE_API_KEY` | 任意 | 候補自動取得時のみ |
   | `NEXT_PUBLIC_DEBUG_PANEL` | ✕ | **本番では未設定**（空のまま） |

3. **Deploy** を実行。完了後、本番 URL を `NEXT_PUBLIC_SITE_URL` に設定して再デプロイ（OGP の絶対 URL を確定させるため）。
4. **デプロイ後チェック**: トップを開いて予告編が連続再生されるか／`/admin/curation` の「公開中」が 50 本以上か／X・Slack で OGP カードが出るか／スマホ実機で操作できるかを確認。

> Supabase はそのまま利用できます（Vercel と同居不要）。`SUPABASE_SERVICE_ROLE_KEY` は Server 側でのみ使われ、`NEXT_PUBLIC_*` 以外はクライアントへ出ません。CLI から入れたい場合は `vercel env add <KEY> production` も使えます。

## 注意事項 / 免責

- **TMDb personal API は個人検証用**: TMDb personal API key は個人の非商用プロジェクト向けです。公開 β / 商用利用には `DATA_MODE=manual` で Manual Curation Mode を使うか、TMDb の商用ライセンスを取得してください。"This product uses the TMDB API but is not endorsed or certified by TMDB."
- **YouTube 予告編**: 予告編は YouTube 埋め込みプレイヤーで再生します。動画ファイル自体は保存・再配信しません。各動画の権利は権利者に帰属します。YouTube Data API の利用は Google のサービス利用規約に従います。
- **Manual Curation Mode**: `DATA_MODE=manual` では TMDb API を一切使わずに運用可能です。公式チャンネルの YouTube 予告編のみを使用し、内容を手動承認してから公開するため、外部 API ライセンスへの依存を避けられます。
- **収益化前の確認**: 公開・収益化の前に、TMDb / YouTube / 各権利者の利用規約および権利関係について必ず法務確認を行ってください。
- **個人情報**: MVP ではログイン不要で、識別子はブラウザの `localStorage` に閉じています。

---

詳細な権利表記はアプリ内 `/about` ページにも掲載しています。
