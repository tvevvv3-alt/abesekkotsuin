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

3. **Deploy**

## 3. スマホに入れる（夫婦それぞれ1回だけ）

1. `https://（公開URL）/?key=（FAMILY_KEY の合言葉）` を Safari で開く
2. 共有ボタン →「ホーム画面に追加」

1回開けばその端末は1年間そのまま使えます。合言葉なしのURLを他の人が開いても中は見えません。

## 4. レシートの読み取り（ショートカット）を設定する

アプリの「家にある食材」→「📝 文字で登録」の画面下にある「ショートカットの作り方」の手順で、
夫婦それぞれの iPhone に1回だけ設定します（3分）。読み取りは iPhone の中で行うので無料です。

> すでに Supabase を設定済みの場合は、`supabase/schema.sql` をもう一度 SQL Editor で **Run** してください
> （設定とレシピ追加用のテーブルが増えます。何度実行しても安全です）。

## （任意）AI に献立を考えてもらう

ふだんはレシピ集から選ぶので費用はかかりません。AI（Claude）に考えてもらいたくなったときだけ、
https://console.anthropic.com で API キーを作り、Vercel の環境変数に次の2つを追加して Redeploy します。
1週間分で約30円かかります。

| Name | Value |
| --- | --- |
| `MEAL_PLANNER` | `ai` |
| `ANTHROPIC_API_KEY` | 作ったキー（`sk-ant-…`） |
