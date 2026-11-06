// 体幹教室 申込書（施設利用上の注意・同意事項）。問診票と同じスキーマ型(QSection)を使い回す。
// 既定は下記 DEFAULT_APPLICATION_SECTIONS。settings.application_schema に保存すればそちらが優先。
import { parseSections, type QSection, type QValue } from "@/lib/questionnaire";

export const DEFAULT_APPLICATION_SECTIONS: QSection[] = [
  {
    title: "参加者情報",
    fields: [
      { key: "name", label: "参加者名", type: "text", required: true, placeholder: "例：阿部 太郎" },
      { key: "kana", label: "ふりがな", type: "text", required: true, placeholder: "例：あべ たろう" },
    ],
  },
  {
    title: "施設利用上の注意・同意事項",
    note: "下記を必読し、各項目に「理解しました」のチェックをお願いします。（2023年3月 改訂版）",
    fields: [
      { key: "ag_injury", label: "体幹教室を行なう生徒が、当院の施設・諸器具の利用およびトレーニングの指導を受けている際に、生徒自身が受けたケガおよび損害に対して、当院ならびに当院スタッフに故意または重大な過失がある場合を除き、いかなる理由があろうとも当該ケガおよび当該損害に対する責を負いません。", type: "checkbox", options: ["理解しました"], required: true },
      { key: "ag_cost", label: "また、それらに伴う費用（治療費・慰謝料・損害賠償費用など）の支払いや、体幹教室の費用の返還には応じません。", type: "checkbox", options: ["理解しました"], required: true },
      { key: "ag_dispute", label: "生徒同士の間に生じた係争やトラブルについて、当院に故意または重大な過失がある場合を除き、当院は一切関与いたしません。", type: "checkbox", options: ["理解しました"], required: true },
      { key: "ag_absence", label: "無断欠席された場合は1回分に換算します。", type: "checkbox", options: ["理解しました"], required: true },
    ],
  },
  {
    title: "ご確認ください",
    note: "特にスラックラインやパルクールは危険を伴う運動であり、常にケガや事故が起こる可能性があります。お子様と一緒にご確認ください。",
    fields: [
      { key: "ag_leave", label: "何度も指示に従わない、その他危険な行為が認められた場合、退場して頂くことがあります。", type: "checkbox", options: ["理解しました"], required: true },
      { key: "ag_damage", label: "器具を床に落とすなど、過失により施設内の設備等に損害が生じた場合は、修繕費をご本人または保護者様へ請求させて頂く場合があります。", type: "checkbox", options: ["理解しました"], required: true },
      { key: "ag_early", label: "予約時間の5分前にはお越しください。", type: "checkbox", options: ["理解しました"], required: true },
      { key: "ag_quiet", label: "何度も大声を出してさわぐ、スタッフの言うことを守れない場合は、同時にトレーニングをしている人の迷惑になるので帰っていただきます。（＊喜びや悔しい等、感情表現は問題ありません。）", type: "checkbox", options: ["理解しました"], required: true },
    ],
  },
  {
    title: "ご記入事項",
    fields: [
      { key: "postal", label: "郵便番号", type: "text", required: true, placeholder: "例：567-0851" },
      { key: "address", label: "住所", type: "text", required: true },
      { key: "birth", label: "生年月日", type: "wareki", required: true },
      { key: "phone", label: "電話番号", type: "tel", required: true },
      { key: "referral", label: "体幹教室はどのようにして知りましたか", type: "text", required: true, placeholder: "例：同じチームの阿部さん／HP／評判 など" },
      { key: "sport_team", label: "競技名・チーム名", type: "text", required: true, placeholder: "例：野球　チーム名" },
      { key: "school", label: "学校名", type: "text", required: true },
      { key: "goal", label: "目的・目標を教えてください（具体的にあれば詳しく教えてください）", type: "textarea", required: true },
      { key: "exercise_freq", label: "運動頻度はどの程度ですか", type: "radio", options: ["毎日", "週5〜6", "週3〜4", "週1〜2", "月に数日", "していない"], required: true },
    ],
  },
  {
    title: "健康状態・既往",
    fields: [
      { key: "pain", label: "現在、身体に痛みはありますか（痛みの場所もしくは病名）", type: "textarea" },
      { key: "injury_history", label: "過去にケガをしましたか", type: "textarea", placeholder: "例：小6でオスグットになった、右足がひどい捻挫をしたことがある" },
      { key: "other_clinic", label: "現在、ほかの病院や整骨院に通院されてますか", type: "text", placeholder: "例：病院名／治療している場所" },
    ],
  },
  {
    title: "ご要望・料金",
    note: "【料金（税込）】\n月4回：4,400円（翌月振替1回可能）\nフリーパス：8,150円（8回以上でお得）",
    fields: [
      { key: "request", label: "ご要望・伝えたい事、ご自由にお書きください", type: "textarea" },
      { key: "fee_agree", label: "上記の料金について理解しました", type: "checkbox", options: ["理解しました"], required: true },
    ],
  },
];

// 保存済みJSON → QSection[]。空/壊れていれば申込書の既定を返す。
export function appSections(raw: unknown): QSection[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_APPLICATION_SECTIONS;
  return parseSections(raw);
}

export type { QValue };
