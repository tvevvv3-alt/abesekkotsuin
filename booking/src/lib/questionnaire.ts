// アプリ内問診票のスキーマ（項目定義）。公開フォーム・カルテ初診時で共用。
// 回答は Record<string, string | string[]> で保持。
//   text/textarea/date/tel → string
//   radio                   → string（選択ラベル）
//   checkbox                → string[]（選択ラベルの配列）
//   「その他」自由入力       → `${key}__other` に string

export type QField =
  | { key: string; label: string; type: "text" | "textarea" | "date" | "tel"; required?: boolean; placeholder?: string; linkLabel?: string }
  | { key: string; label: string; type: "radio" | "checkbox"; options: string[]; required?: boolean; other?: boolean; linkLabel?: string };

export type QSection = { title: string; note?: string; fields: QField[] };

export type QValue = Record<string, string | string[]>;

// 料金の案内（同意事項の上に表示）。担当ごとに段落で見やすく。
export const PRICE_NOTE =
  `【料金のご案内】\n` +
  `\n` +
  `■ 阿部\n` +
  `　施術30分　初診 7,700円 ／ 再診 5,500円\n` +
  `　施術60分　初診 13,200円 ／ 再診 11,000円\n` +
  `\n` +
  `■ 澁谷\n` +
  `　施術30分　初診 7,150円 ／ 再診 4,950円\n` +
  `　施術60分　初診 12,100円 ／ 再診 10,000円\n` +
  `\n` +
  `■ 萩原\n` +
  `　施術30分　初診 6,600円 ／ 再診 4,400円\n` +
  `　施術60分　初診 11,000円 ／ 再診 8,800円\n` +
  `\n` +
  `■ オプション（施術30分＋全身通電20分）\n` +
  `　一般 ＋3,300円 ／ 学生 ＋2,750円（税込）\n` +
  `\n` +
  `■ 川西整体院（50分施術）\n` +
  `　初診 12,000円 ／ 再診 10,000円\n` +
  `\n` +
  `※保険併用の場合、窓口負担が500〜1,000円程度軽減されます。\n` +
  `※最終来院日から2ヶ月以上あくと、再度初診料が発生します。\n` +
  `　（例）3/15最終来院 → 5月末まで再診扱い、6月1日より初診扱い。`;

export const Q_SECTIONS: QSection[] = [
  {
    title: "基本情報",
    fields: [
      { key: "name", label: "受診者名", type: "text", required: true, placeholder: "例）阿部 太郎" },
      { key: "kana", label: "ふりがな", type: "text", required: true, placeholder: "例）あべ たろう" },
      { key: "birth", label: "生年月日", type: "date", required: true },
      { key: "sex", label: "性別", type: "radio", options: ["男性", "女性", "回答しない"], required: true },
      { key: "postal", label: "郵便番号", type: "text", placeholder: "例）567-0851" },
      { key: "address", label: "住所", type: "text", required: true },
      { key: "phone", label: "電話番号", type: "tel", required: true },
      { key: "insured_name", label: "保険証世帯主名（ふりがな）", type: "text" },
      { key: "occupation", label: "職業", type: "text", placeholder: "例）小学6年生／主婦／会社員／パート" },
    ],
  },
  {
    title: "競技・来院のきっかけ",
    fields: [
      { key: "sport", label: "競技名", type: "text", placeholder: "例）野球／サッカー／バスケ／テニス", linkLabel: "競技名" },
      { key: "team", label: "所属チーム", type: "text", placeholder: "部活の方は学校名・チーム名" },
      { key: "referral", label: "当院をどのように知りましたか？", type: "text", placeholder: "紹介者名／ホームページ／評判／近所 など" },
    ],
  },
  {
    title: "今回の症状",
    fields: [
      { key: "symptom", label: "症状を教えてください（どこがどのように痛みますか？複数可）", type: "textarea", required: true, placeholder: "例）膝下がピキッと痛い／右肩下にして寝ていると痛い", linkLabel: "症状部位" },
      { key: "onset", label: "いつから症状がありますか？", type: "text", required: true, placeholder: "例）1ヶ月前／半年／2年前", linkLabel: "いつから" },
      { key: "place", label: "どこで？", type: "checkbox", options: ["グラウンド", "自宅", "職場"], other: true, required: true },
      { key: "cause", label: "どうなりましたか？（思い当たること）", type: "textarea", placeholder: "例）バスケ中に接触し、バランスを崩して手をついた／原因不明" },
    ],
  },
  {
    title: "受診歴・既往",
    fields: [
      { key: "other_clinic", label: "今回の痛みで、他の医療機関を受診されましたか？", type: "radio", options: ["受診していない", "整形外科／救急外来等の病院", "整骨院／鍼灸整骨院／整体院"], other: true, required: true },
      { key: "other_clinic_name", label: "整骨院や病院名", type: "text" },
      { key: "surgery", label: "過去に手術歴や長引いた怪我はありますか？（帝王切開含む）", type: "textarea", linkLabel: "既往" },
      { key: "current_dx", label: "現在、診断されている怪我や病名はありますか？", type: "textarea", linkLabel: "既往" },
    ],
  },
  {
    title: "確認事項",
    fields: [
      { key: "flags", label: "以下に当てはまるものがあればチェックしてください", type: "checkbox", options: ["ペースメーカー・埋め込み型除細動器が入っている", "人工関節が入っている", "骨折等の手術でプレートやボルトなどの金属が入っている", "その他の体内金属・医療機器が入っている", "妊娠中または妊娠の可能性がある", "てんかんの既往がある", "該当なし"] },
      { key: "exercise_freq", label: "運動頻度はどの程度ですか？", type: "radio", options: ["ほぼ毎日", "週5〜6", "週3〜4"], other: true, linkLabel: "週何回" },
      { key: "next_game", label: "近々、出たい試合・大会はありますか？（複数可。希望・優先度も自由にどうぞ）", type: "textarea", placeholder: "例）10/20の県大会に出たい／11月の新人戦は出れたら出たい、最悪12月の大会に間に合わせたい" },
    ],
  },
  {
    title: "ご要望",
    note: PRICE_NOTE,
    fields: [
      { key: "goal", label: "症状について今後どうなりたいか、伝えたいことがあればご記入ください", type: "textarea", placeholder: "例）いついつの試合に間に合わせたい／膝痛を治して思い切り遊びたい" },
      { key: "agree", label: "上記の料金について理解しました", type: "checkbox", options: ["理解しました"], required: true },
    ],
  },
];

export const ALL_FIELDS: QField[] = Q_SECTIONS.flatMap((s) => s.fields);

export function emptyQValue(): QValue {
  return {};
}

// 回答から、カルテ初診時の連携5項目を導出
export function toIntakeLinked(v: QValue): { sport: string; weekly_freq: string; symptom_area: string; onset: string; history: string } {
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : Array.isArray(v[k]) ? (v[k] as string[]).join("、") : "");
  const freq = s("exercise_freq") + (v["exercise_freq__other"] ? `（${v["exercise_freq__other"]}）` : "");
  const history = [s("surgery"), s("current_dx")].filter(Boolean).join(" ／ ");
  return {
    sport: s("sport"),
    weekly_freq: s("exercise_freq") ? freq : "",
    symptom_area: s("symptom"),
    onset: s("onset"),
    history,
  };
}

// 必須の未入力があれば、その項目ラベルの配列を返す
export function missingRequired(v: QValue): string[] {
  const miss: string[] = [];
  for (const f of ALL_FIELDS) {
    if (!f.required) continue;
    const val = v[f.key];
    const empty = val == null || (typeof val === "string" && !val.trim()) || (Array.isArray(val) && val.length === 0);
    if (empty) miss.push(f.label);
  }
  return miss;
}
