# 本番公開ガイド（阿部接骨院 電子カルテ）

スマホでも進められる手順です。上から順に進めてください。
所要時間の目安：20〜30分。すべて無料枠で可能です。

> 🔐 セキュリティ：`service_role`（秘密鍵）は誰にも共有せず、チャットにも貼らないでください。
> 設定値はすべて Supabase / Vercel の画面に直接入力します。

---

## フェーズ1：Supabase（データベース）

### 1-1. プロジェクト作成
1. https://supabase.com にアクセスし「Start your project」でサインアップ
2. 「New project」→ 名前（例: `abe-emr`）・データベースパスワードを設定
   （パスワードは控えておく）
3. リージョンは `Northeast Asia (Tokyo)` を推奨
4. 作成完了まで1〜2分待つ

### 1-2. テーブル・権限を作成（schema.sql）
1. 左メニュー **SQL Editor** を開く
2. 下記URLを開き、中身をすべてコピー
   `emr/supabase/schema.sql`
   （GitHubのファイル、または raw で開くとコピーしやすい）
3. SQL Editor に貼り付けて **Run**
4. 「Success」と出ればOK（テーブル・RLS・画像バケットが作成されます）

### 1-3. 最初のスタッフ（院長）を登録
1. 左メニュー **Authentication → Users → Add user**
2. あなたのメールとパスワードを入力して作成
   （※「Auto Confirm User」をオンにするとすぐ使えます）
3. 作成されたユーザーの **User UID** をコピー
4. **SQL Editor** に戻り、下記を実行（UID・氏名を置き換え）
   ```sql
   insert into public.staff (id, name, role)
   values ('ここにUID', '阿部 院長', 'director');
   ```

### 1-4.（任意）デモ用データを入れる
実際の患者を入れる前に動作を見たい場合、`emr/supabase/seed.sql` の中身を
SQL Editor に貼って Run すると、サンプル患者・カルテが入ります。
（本番運用前に削除可能）

### 1-5. 接続情報を控える
左メニュー **Project Settings → API** で以下2つをメモ：
- `Project URL`
- `anon public` キー

---

## フェーズ2：Vercel（公開）

### 2-1. アカウント
1. https://vercel.com に「Continue with GitHub」でサインアップ
   （GitHubアカウントが必要。無ければ github.com で先に作成）

### 2-2. リポジトリを取り込む
1. Vercel で「Add New → Project」
2. `tvevvv3-alt/abesekkotsuin` を Import
3. **Root Directory** を `emr` に変更（重要）
4. Framework は自動で「Next.js」と認識されます

### 2-3. 環境変数を設定
「Environment Variables」に、フェーズ1-5の値を登録：

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | （Project URL） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | （anon public キー） |

### 2-4. デプロイ
1. **Deploy** を押す
2. 1〜2分でビルド完了 → `https://〇〇.vercel.app` のURLが発行されます

---

## フェーズ3：動作確認

1. 発行された `https://〇〇.vercel.app` を iPhone / iPad / PC で開く
2. フェーズ1-3で作ったメール・パスワードでログイン
3. 患者登録 → カルテ作成 → 画像アップロードを試す

---

## 補足

- **スタッフ追加**：以降はアプリ内「スタッフ管理」（院長ログイン時）から、
  Supabase で作成したユーザーの UID を貼って追加できます。
- **独自ドメイン**：Vercel の Project → Settings → Domains で設定可能。
- **ブランチ**：現在の開発は `claude/abe-clinic-emr-app-i69lqo`。
  本番運用に入る際は main へマージすると管理しやすくなります。
- 困ったら、エラー画面のスクリーンショットを送ってください。都度ご案内します。
