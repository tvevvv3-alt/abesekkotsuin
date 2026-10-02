import type { MealPlan } from "./types";

// その日に「お米を食べる」と言えるか。
// 選んだ案がお米ならOK。まだ選んでいなければ、どの案を選んでもお米のときだけOK。
export function dayHasRice(plans: MealPlan[]): boolean {
  return plans.some((p) => {
    if (p.options.length === 0) return false;
    if (p.chosen) return !!p.options.find((o) => o.label === p.chosen)?.rice;
    return p.options.every((o) => o.rice);
  });
}

// 日曜始まりの週（カレンダーと同じ区切り）
export function weekRange(date: string): { from: string; to: string } {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const f = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: f(start), to: f(end) };
}

export function riceDays(plans: MealPlan[]): { rice: number; planned: number } {
  const byDate: Record<string, MealPlan[]> = {};
  for (const p of plans) (byDate[p.date] ??= []).push(p);
  const dates = Object.keys(byDate);
  return { rice: dates.filter((d) => dayHasRice(byDate[d])).length, planned: dates.length };
}
