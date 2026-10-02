import type { MealOption } from "./types";

// 1〜2歳に注意が必要な食材。AI の提案に含まれていたらカードに注意を出す（最終判断は家族）。
const RULES: { words: string[]; note: string; maxMonths: number }[] = [
  { words: ["はちみつ", "蜂蜜", "ハチミツ"], note: "はちみつは1歳未満は不可", maxMonths: 12 },
  { words: ["餅", "もち"], note: "餅は窒息の危険", maxMonths: 72 },
  { words: ["ナッツ", "ピーナッツ", "アーモンド", "くるみ"], note: "ナッツ類はそのままは避ける", maxMonths: 60 },
  { words: ["ミニトマト", "ぶどう", "ブドウ", "さくらんぼ"], note: "丸い食材は4等分に切る", maxMonths: 48 },
  { words: ["刺身", "生魚", "生卵", "卵かけ", "生ハム", "たたき"], note: "生ものは避ける", maxMonths: 36 },
  { words: ["こんにゃくゼリー", "白玉"], note: "のどに詰まりやすい", maxMonths: 72 },
  { words: ["いか", "イカ", "たこ", "タコ"], note: "いか・たこは噛み切りにくい", maxMonths: 36 },
];

export function toddlerWarnings(option: MealOption, ageMonths: number | null): string[] {
  if (ageMonths == null) return [];
  const text = [option.title, ...option.dishes, option.toddler_note ?? ""].join(" ");
  return RULES.filter((r) => ageMonths < r.maxMonths && r.words.some((w) => text.includes(w))).map((r) => r.note);
}

export function ageInMonths(birth: string | null, on: string): number | null {
  if (!birth) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = on.split("-").map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  return months < 0 ? null : months;
}
