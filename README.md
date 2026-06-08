# 阿部接骨院 ホームページ

紹介で来院される方が「なんか他と違う」と感じ、スポーツ障害やケガで検索している
方にも届く ― そんな信頼感・本物感・現場感を優先したサイトです。

機器を主役にするのではなく、患者さんが **「原因がわかった」「変化を実感した」
「納得できた」** という体験を主役にしています。

技術構成は **HTML / CSS / JavaScript のみ**（フレームワーク不要）。
そのまま任意のサーバー・ホスティング（GitHub Pages / Netlify / Vercel 等）に
置くだけで公開できます。

---

## 表示方法（ローカル確認）

`index.html` をブラウザで開くだけで確認できます。Google Map や Web フォントも
読み込むため、簡易サーバー経由がより正確です。

```bash
# 例: Python の簡易サーバー
python3 -m http.server 8000
# → ブラウザで http://localhost:8000 を開く
```

---

## ファイル構成

```
.
├─ index.html              … ページ本体（全セクション）
├─ assets/
│  ├─ css/style.css        … デザイン・レイアウト・アニメーション
│  ├─ js/main.js           … スクロール演出・横スクロール・LINEリンク等
│  └─ images/              … 写真（現在はプレースホルダー画像）
└─ README.md
```

---

## 公開前に差し替える項目

### 1. 写真（最重要）

`assets/images/` 内のプレースホルダー（`.svg`）を、**実際の院の写真**に
差し替えてください。ファイル名を同じにして拡張子だけ実写真に合わせ、
`index.html` 内の `src="assets/images/◯◯.svg"` を実際の拡張子（例 `.jpg`）に
変更します。

| 差し替え先ファイル            | 使う写真                         | 使用箇所            |
| ----------------------------- | -------------------------------- | ------------------- |
| `hero.svg`                    | 施術風景                         | HERO 背景           |
| `echo.svg`                    | エコー評価                       | SECTION 3 見極める  |
| `microcurrent.svg`            | 微弱電流施術                     | SECTION 4 施術する  |
| `change.svg`                  | 変化を実感する患者の様子（任意） | 予備               |
| `taikan.svg`                  | 体幹教室（青マット上）           | SECTION 9 体幹教室  |
| `clinic.svg`                  | 院内風景（任意）                 | 予備               |
| `staff-abe.svg`               | 阿部 先生 顔写真                 | SECTION 10 スタッフ |
| `staff-shibuya.svg`           | 澁谷 先生 顔写真                 | SECTION 10 スタッフ |
| `staff-hagiwara.svg`          | 萩原 先生 顔写真                 | SECTION 10 スタッフ |
| `staff-hayashi.svg`           | 林 先生 顔写真                   | SECTION 10 スタッフ |

> 推奨: HERO は横長 1600px 以上、スタッフは縦長（4:5）。AI画像ではなく、
> 送付いただいた実際の写真を使ってください。

### 2. LINE予約・Instagram のURL

`assets/js/main.js` 冒頭の `LINKS` を実際のURLに変更してください。
（全ての「LINE予約」ボタンと Instagram リンクに一括反映されます。）

```js
var LINKS = {
  line: "https://lin.ee/REPLACE_ME",
  instagram: "https://www.instagram.com/REPLACE_ME"
};
```

### 3. 既存原稿の差し込み（`data-editable` の箇所）

指示書で「既存原稿をそのまま使用」とされた以下は、現在プレースホルダーです。
`index.html` 内の `data-editable` 属性が付いた要素を、既存の原稿に置き換えて
ください。

- **SECTION 10 スタッフ紹介** … 各スタッフの `staff__bio`（プロフィール文）
- **SECTION 11 施術メニュー・料金** … `menu__list` の項目・金額
- **SECTION 12 アクセス** … 茨木院・川西院の住所・電話・受付時間
- **FOOTER** … 住所・電話番号

### 4. Google Map

SECTION 12 の各 `iframe` の `src` を、実際の店舗位置の Google Map 埋め込みURLに
差し替えてください（現在は市名での仮表示）。Google Map →「共有」→「地図を埋め込む」
で取得した URL を使用します。

---

## デザイン方針（メンテナンス時の指針）

- 1画面1メッセージ / 余白を大きく / 写真を主役に / 文字は少なく
- スクロールに合わせた上品なフェードイン（`prefers-reduced-motion` で自動的に無効化）
- 横スクロールカード（SECTION 1・7・8）はスマホはスワイプ、PCはドラッグ対応
- スマホ閲覧最優先のレイアウト
- 配色: 温かみのあるオフホワイト + 深いスレート（信頼感）。LINEボタンのみ緑。

機器紹介サイトにしないこと。説明文を増やしすぎないこと。
