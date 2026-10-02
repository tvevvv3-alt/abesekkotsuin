import { STAPLES, findIngredient, normalizeText, type IngredientCategory } from "./ingredients";
import { addDays } from "./date";

// レシートの文字（iPhone の文字認識でコピーしたもの）から、食材の候補を取り出す

export type ReceiptCandidate = {
  name: string;
  category: IngredientCategory | "その他";
  quantity: string | null;
  expires_on: string | null;
};

// 合計・税・支払いなど、商品ではない行
const SKIP = /(合計|小計|税|釣|預り|お預|ポイント|値引|割引|クーポン|レジ|tel|電話|領収|現金|クレジット|カード|点数|対象|担当|店|〒|ありがとう|\d{4}[年/.-]\d{1,2})/i;

export function parseReceipt(text: string, today: string): { items: ReceiptCandidate[]; unknown: string[] } {
  const items = new Map<string, ReceiptCandidate & { count: number }>();
  const unknown: string[] = [];
  const staples = STAPLES.map(normalizeText);

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.normalize("NFKC").trim();
    if (!line || SKIP.test(line)) continue;
    // 商品名らしい部分（先頭の記号・末尾の金額を除く）
    const label = line
      .replace(/^[*＊※#\d\s]+/, "")
      .replace(/[\s¥￥]*[\d,]+\s*(円|内|外|軽|※|\*)?\s*$/, "")
      .trim();
    if (!/[぀-ヿ一-龯]/.test(label)) continue;
    // 「×2」「2点」だけを個数とみなす（「10コ入」などは内容量なので数えない）
    const countMatch = line.match(/[x×]\s*(\d+)/i) ?? line.match(/(\d+)\s*点/);
    const count = countMatch ? Number(countMatch[1]) : 1;

    const hit = findIngredient(label);
    if (hit) {
      const prev = items.get(hit.name);
      if (prev) prev.count += count;
      else
        items.set(hit.name, {
          name: hit.name,
          category: hit.category,
          quantity: null,
          expires_on: addDays(today, hit.days),
          count,
        });
    } else if (!staples.some((st) => normalizeText(label).includes(st)) && label.length >= 2) {
      unknown.push(label);
    }
  }

  return {
    items: Array.from(items.values()).map(({ count, ...c }) => ({ ...c, quantity: count > 1 ? `×${count}` : null })),
    unknown: Array.from(new Set(unknown)).slice(0, 20),
  };
}

export const SHORTCUT_NAME = "阿部家レシート";
