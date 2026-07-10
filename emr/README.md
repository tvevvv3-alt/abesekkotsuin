# 阿部接骨院 電子カルテ（MVP）

iPhone / iPad / PC のブラウザから使える院内専用の電子カルテです。
Next.js（App Router）+ Supabase + Vercel 構成。白基調のシンプルな医療系UIで、
タップ操作中心・入力スピード優先で設計しています。

## 実装済み画面（MVP）

1. ログイン
2. 患者一覧
3. 患者検索（氏名・フリガナ・患者ID・電話番号）
4. 患者新規登録
5. 患者詳細
6. 初診カルテ
7. 再診カルテ
8. エコー画像・写真アップロード（複数枚・撮影日・時系列表示）
9. 過去カルテ一覧
10. 経過表示（患者詳細内のカルテ履歴・画像時系列）
11. スタッフ申し送り
12. スタッフ管理（院長のみ）

## 権限

| 役割 | 患者 | カルテ | 画像 | スタッフ管理 |
|------|------|--------|------|------|
| 院長 | 閲覧/編集/削除 | 作成/追記/削除 | 追加/削除 | ○ |
| 施術者 | 閲覧 | 作成/追記 | 追加 | × |
| 受付 | 登録/編集/検索 | × | × | × |

権限は Supabase の Row Level Security（RLS）で強制しています。

## セットアップ手順

### 1. Supabase プロジェクト作成
1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. **SQL Editor** に `supabase/schema.sql` を貼り付けて実行
   （テーブル・Enum・RLS・Storage バケットが作成されます）

### 2. 最初のスタッフ（院長）を登録
1. **Authentication → Users → Add user** でメール/パスワードのユーザーを作成
2. 作成された User UID をコピー
3. SQL Editor で以下を実行（UID・氏名を置き換え）
   ```sql
   insert into public.staff (id, name, role)
   values ('<User-UID>', '阿部 院長', 'director');
   ```
4. 以降のスタッフ追加はアプリ内の「スタッフ管理」画面から可能です。

### 3. 環境変数
`.env.example` を `.env.local` にコピーし、Supabase の
**Project Settings → API** から値を設定：
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 4. ローカル起動
```bash
cd emr
npm install
npm run dev
```
`http://localhost:3000` を開く。

### 5. Vercel デプロイ
1. GitHub リポジトリを Vercel にインポート
2. **Root Directory** を `emr` に設定
3. 環境変数 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を登録
4. デプロイ

## ディレクトリ構成
```
emr/
├─ supabase/schema.sql          # DB定義・RLS・Storage
├─ src/
│  ├─ middleware.ts             # 未認証リダイレクト
│  ├─ app/
│  │  ├─ login/                 # ログイン
│  │  └─ (app)/                 # 認証必須エリア
│  │     ├─ patients/           # 一覧・検索・新規・詳細・編集
│  │     │  └─ [id]/charts/     # 初診/再診カルテ・詳細・編集
│  │     ├─ handover/           # 申し送り
│  │     └─ admin/staff/        # スタッフ管理（院長）
│  ├─ components/               # ChipGroup / PatientForm / ChartForm / ImageManager 等
│  └─ lib/
│     ├─ supabase/              # client / server / middleware
│     ├─ constants.ts           # 施術チップ・権限ヘルパー
│     └─ types.ts               # DB型
```

## 設計上のポイント（拡張しやすさ）
- カルテの臨床項目は `charts.data`（jsonb）に格納。項目追加時は
  `types.ts` の `ChartData` と `ChartForm` のフィールド定義に足すだけ。
- 施術チップは `constants.ts` の `MACHINES` / `METHODS` を編集すれば増減可能。
- 権限判定は `constants.ts` のヘルパー＋DBの RLS に集約。

## 今後の改善候補（運用フィードバックで）
- カルテのPDF出力 / 印刷
- 疼痛スコアの推移グラフ
- 予約・来院管理
- 全文検索の高速化（患者数増加時）
