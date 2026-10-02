# 公開ガイド（阿部家カレンダー）

スマホでも進められる手順です。所要時間の目安：20分。すべて無料枠で使えます。

> 🔐 `service_role` キーは Vercel の環境変数にだけ入れ、チャットなどには貼らないでください。

## 1. Supabase（データベース）

1. https://supabase.com で「New project」（名前の例：`abe-family`、リージョンは `Northeast Asia (Tokyo)`）
   - 予約システムと同じプロジェクトに相乗りせず、**新しいプロジェクト**にするのがおすすめです
2. 左メニュー **SQL Editor** → `supabase/schema.sql` の中身を貼り付けて **Run**
3. 続けて `supabase/seed.sql` を貼り付けて **Run**（家族5人が入ります）
4. **Project Settings → API** で次の2つを控える
   - `Project URL`
   - `service_role` キー（secret）

## 2. Vercel（公開）

1. https://vercel.com で「Add New… → Project」→ このリポジトリ（`abesekkotsuin`）を Import
   - **予約システムとは別の Vercel プロジェクト**として追加します（プロジェクト名の例：`abe-family`）
   - **Root Directory** で「Edit」→ **`schedule`** を選ぶ（重要）
2. **Environment Variables** に次の3つを追加

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | 控えた Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 控えた service_role キー |
| `FAMILY_KEY` | 好きな合言葉（英数字で長めに。例：`abe-xxxx-2026`） |
| `ANTHROPIC_API_KEY` | 献立の提案に使う Claude の API キー（下の「4.」で取得） |

3. **Deploy**

## 3. スマホに入れる（夫婦それぞれ1回だけ）

1. `https://（公開URL）/?key=（FAMILY_KEY の合言葉）` を Safari で開く
2. 共有ボタン →「ホーム画面に追加」

1回開けばその端末は1年間そのまま使えます。合言葉なしのURLを他の人が開いても中は見えません。

## 4. 献立の提案（AI）を使えるようにする

1. https://console.anthropic.com でアカウントを作る
2. **Billing** でクレジットを購入（最初は $5〜10 で十分です）。念のため **Limits** で月の上限（例：$10）も設定しておくと安心です
3. **API Keys** →「Create Key」で作ったキー（`sk-ant-…`）を、Vercel の環境変数 `ANTHROPIC_API_KEY` に入れる
4. Vercel で **Redeploy**

費用の目安：1週間分の献立を1回作るのが約30円。週1回＋組み替え数回で、月300〜500円ほどです。

> すでに第1段階で Supabase を設定済みの場合は、`supabase/schema.sql` をもう一度 SQL Editor で **Run** してください
> （好み・ルールを保存する `app_settings` テーブルが追加されます。何度実行しても安全です）。
