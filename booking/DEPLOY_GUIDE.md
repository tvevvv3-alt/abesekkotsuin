# 本番公開ガイド（阿部接骨院 予約システム）

スマホでも進められる手順です。上から順に進めてください。
所要時間の目安：20〜30分。すべて無料枠で可能です。

> 🔐 セキュリティ：`service_role`（秘密鍵）は誰にも共有せず、チャットにも貼らないでください。
> 使うのは **Project URL** と **anon public** キーの2つだけです。

---

## フェーズ1：Supabase（データベース）

### 1-1. プロジェクト作成
1. https://supabase.com にアクセスし「Start your project」でサインアップ
2. 「New project」→ 名前（例：`abe-booking`）・データベースパスワードを設定
   （パスワードは控えておく）
3. リージョンは `Northeast Asia (Tokyo)` を推奨
4. 作成完了まで1〜2分待つ

> 💡 電子カルテ(emr)と同じ Supabase プロジェクトを使うと、将来 patients/staff を
> 共有してカルテ連携がしやすくなります。分けても動作します。

### 1-2. テーブル・権限を作成（schema.sql）
1. 左メニュー **SQL Editor** → 「New query」
2. GitHub の `booking/supabase/schema.sql` を開き、中身をすべてコピー
3. SQL Editor に貼り付けて **Run**
4. 「Success」と出ればOK（テーブル・RLS・予約ロジック関数が作成されます）

### 1-3. 初期データ・サンプルを入れる（seed.sql）
1. 同じく `booking/supabase/seed.sql` の中身をコピー
2. SQL Editor に貼り付けて **Run**
3. 担当者4名（阿部・澁谷・萩原・林）、メニュー、機器、料金、勤務時間、
   デモ予約が入ります（実運用前にデモ予約は削除可）

### 1-4. 管理画面ログイン用のスタッフを作成
1. 左メニュー **Authentication → Users → Add user**
2. あなたのメールとパスワードを入力して作成
   （「Auto Confirm User」をオンにするとすぐ使えます）
   ※ これは管理画面にログインするための「ログインアカウント」です。
     予約表に並ぶ担当者（阿部・澁谷…）とは別物で、seed で登録済みです。

### 1-5. 接続情報を控える
左メニュー **Project Settings → API** で以下2つをメモ：
- `Project URL`（例：https://xxxx.supabase.co）
- `anon public` キー（`eyJ…` で始まる長い文字列）

---

## フェーズ2：Vercel（公開）

### 2-1. GitHub と接続
1. https://vercel.com に GitHub アカウントでサインアップ
2. 「Add New… → Project」で このリポジトリ（`abesekkotsuin`）を Import

### 2-2. ルートディレクトリを指定（重要）
1. Import 設定画面の **Root Directory** で「Edit」→ **`booking`** を選択
   （リポジトリ直下ではなく `booking` フォルダを指定します）
2. Framework は自動で **Next.js** と認識されます

### 2-3. 環境変数を設定
「Environment Variables」に以下2つを追加：

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | フェーズ1-5でメモした Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | フェーズ1-5でメモした anon public キー |

### 2-4. デプロイ
1. **Deploy** を押す（1〜2分）
2. 完了後の URL を開く
   - 患者予約：`https://（あなたのURL）/`
   - 管理画面：`https://（あなたのURL）/admin`
     （フェーズ1-4で作ったメール／パスワードでログイン）

---

## 動作確認チェックリスト

- [ ] 患者予約：メニュー選択 → 担当者・日時 → 情報入力 → 予約完了
- [ ] 管理画面：予約表に担当者の列が並び、たった今の予約が表示される
- [ ] 予約表で空き時間をドラッグ → 「予約を追加／休診にする」が出る
- [ ] スタッフ管理でスタッフを追加 → 予約表に列が増える
- [ ] 休日・休診登録：月カレンダーで日付選択 → 休診にすると患者側が予約不可

---

## ローカルで試すだけなら

```bash
cd booking
cp .env.example .env.local   # URL と anon キーを記入
npm install
npm run dev                  # http://localhost:3000
```

---

## よくあるつまずき

- **管理画面に入れない**：フェーズ1-4のユーザー作成と「Auto Confirm」を確認。
- **予約枠が全部グレー**：seed.sql を実行したか、その日が営業日（月〜土）かを確認。
  予約公開設定で未公開の月にしていないかも確認。
- **画面は出るがデータが出ない**：環境変数のURL/キーの貼り間違い、または Vercel の
  Root Directory が `booking` になっているかを確認。
- **変更が反映されない**：GitHub に push 後、Vercel が自動で再デプロイします（数分）。

困ったら、その画面のスクリーンショットを送ってください。設定値を一緒に確認します。
