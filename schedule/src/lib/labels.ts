import type { AwayMeal, MealSlot, Member, Rating } from "./types";

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "朝食",
  bento: "お弁当",
  dinner: "夕食",
};

export const AWAY_MEAL_LABEL: Record<AwayMeal, string> = {
  breakfast: "朝",
  lunch: "昼",
  dinner: "夕",
};

export const RATING_LABEL: Record<Rating, string> = {
  ate: "完食",
  some: "少し",
  none: "食べず",
};

export const ROLE_LABEL = { father: "父", mother: "母", child: "子ども" } as const;

// 家族全員・メンバー未指定の予定に使う色
export const FAMILY_COLOR = "#64748b";

// 予定ラベルの背景。複数人なら色を縞で並べる
export function eventBackground(memberIds: string[], members: Member[]): string {
  const colors = memberIds
    .map((id) => members.find((m) => m.id === id)?.color)
    .filter((c): c is string => !!c);
  if (colors.length === 0 || (members.length > 0 && colors.length === members.length)) return FAMILY_COLOR;
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  return `linear-gradient(90deg, ${colors
    .map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`)
    .join(", ")})`;
}
