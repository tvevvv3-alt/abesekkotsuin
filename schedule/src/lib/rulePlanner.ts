import { STAPLES, ingredientInfo, normalizeText, sameIngredient } from "./ingredients";
import type { Recipe } from "./recipes";
import type { MealOption, MealSlot, PantryItem } from "./types";

// レシピ集から、ルールで点数をつけて A/B の献立を選ぶ（AI を使わないので無料）。
//
// 点数の考え方
//  ＋ 家にある食材を使う（期限が近いほど高い）
//  ＋「完食」が多い料理 / − 「食べず」が多い料理
//  − 最近出した料理、足りない食材が多い料理、前日と同じ種類の主菜
// お米は「1日1食」。昼が外の日は必ず朝か夜にお米。麺・パンの夕食は週2回まで（その日は朝をお米に）。

export type RuleDay = {
  date: string;
  weekday: number; // 0=日
  holiday: boolean;
  lunchOut: boolean; // 誰かが昼を外で食べる
  slots: MealSlot[]; // 作る食事
  fixedRice: boolean; // すでに選んだ食事でお米を食べる
};

export type RuleInput = {
  days: RuleDay[];
  recipes: Recipe[];
  pantry: PantryItem[];
  today: string;
  avoid: string[]; // 避けたい食材・料理（設定画面）
  recent: { date: string; recipeId: string }[]; // 最近決めた料理
  ratings: Record<string, number>; // recipeId → 食べた記録の点数
  noodleDinnersInWeek: Record<string, number>; // 週の日曜 → すでに決まっている麺・パンの夕食の数
};

export type RuleOutput = {
  days: { date: string; meals: { slot: MealSlot; options: MealOption[] }[] }[];
  note: string;
};

const NOODLE_PER_WEEK = 2;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function planByRules(input: RuleInput): RuleOutput {
  const avoid = input.avoid.map(normalizeText).filter(Boolean);
  const usable = input.recipes.filter(
    (r) => !avoid.some((a) => normalizeText(r.name).includes(a) || r.ing.some((i) => normalizeText(i).includes(a)))
  );

  // 家の食材。使うたびに weight を下げて、同じ食材ばかりにならないようにする
  const stock = input.pantry.map((p) => ({ item: p, weight: 1 }));
  // その日にまだ使える在庫（期限を過ぎる日には使わない）と、残り日数
  const stockFor = (ing: string, date: string) => {
    const s = stock.find((x) => sameIngredient(x.item.name, ing));
    if (!s) return null;
    const left = s.item.expires_on ? daysBetween(date, s.item.expires_on) : 7;
    return left < 0 ? null : { ...s, left, ref: s };
  };

  const picked: { date: string; recipeId: string }[] = [...input.recent];
  const noodleCount = { ...input.noodleDinnersInWeek };
  const usedSoon = new Set<string>();
  let lastDinnerProtein: string | null = null;

  const ingScore = (r: Recipe, date: string) =>
    r.ing.reduce((sum, i) => {
      const s = stockFor(i, date);
      if (!s) return sum - 0.8; // 買い足しが必要
      return sum + (3 + Math.max(0, 6 - s.left)) * s.weight;
    }, 0);

  const recencyPenalty = (r: Recipe, date: string) => {
    let p = 0;
    for (const x of picked) {
      if (x.recipeId !== r.id) continue;
      const d = Math.abs(daysBetween(x.date, date));
      if (d <= 7) p = Math.max(p, 15);
      else if (d <= 14) p = Math.max(p, 5);
    }
    return p;
  };

  const score = (r: Recipe, date: string) =>
    ingScore(r, date) + (input.ratings[r.id] ?? 0) - recencyPenalty(r, date) + Math.random() * 4;

  const consume = (r: Recipe, date: string) => {
    for (const i of r.ing) {
      const s = stockFor(i, date);
      if (!s) continue;
      if (s.left <= 3) usedSoon.add(s.item.name);
      s.ref.weight *= 0.3;
    }
  };

  // 候補を点数順に。A と B は別の料理・できれば別の種類（肉と魚など）
  const pickTwo = (cands: Recipe[], date: string, extra: (r: Recipe) => number = () => 0): [Recipe, Recipe | null] | null => {
    const inPlan = new Set(picked.filter((x) => x.date === date).map((x) => x.recipeId));
    const ranked = cands
      .filter((r) => !inPlan.has(r.id))
      .map((r) => ({ r, s: score(r, date) + extra(r) }))
      .sort((a, b) => b.s - a.s);
    if (ranked.length === 0) return null;
    const a = ranked[0].r;
    const b = (ranked.find((x) => x.r.id !== a.id && x.r.protein !== a.protein) ?? ranked.find((x) => x.r.id !== a.id))?.r ?? null;
    return [a, b];
  };

  const toOption = (date: string, label: string, r: Recipe, dishes: string[], extraIng: string[] = []): MealOption => {
    const all = Array.from(new Set([...r.ing, ...extraIng]));
    const uses: string[] = [];
    const missing: string[] = [];
    for (const i of all) {
      const s = stockFor(i, date);
      if (s) uses.push(s.item.name);
      else if (!STAPLES.includes(i)) missing.push(ingredientInfo(i)?.name ?? i);
    }
    return {
      label,
      title: r.name,
      dishes,
      rice: r.rice,
      toddler_note: r.toddler || null,
      uses: Array.from(new Set(uses)),
      missing,
      recipe_id: r.id,
    };
  };

  const soups = usable.filter((r) => r.slot === "soup");
  const sides = usable.filter((r) => r.slot === "side");
  const bestOf = (list: Recipe[], date: string, exclude: string[]) =>
    list
      .filter((r) => !r.ing.some((i) => exclude.includes(i)))
      .map((r) => ({ r, s: score(r, date) }))
      .sort((a, b) => b.s - a.s)[0]?.r ?? list[0];

  const out: RuleOutput["days"] = [];
  let riceDays = 0;
  const noodleDays: string[] = [];

  for (const day of input.days) {
    const meals: RuleOutput["days"][number]["meals"] = [];
    const has = (s: MealSlot) => day.slots.includes(s);
    const weekday = day.weekday >= 1 && day.weekday <= 5 && !day.holiday;
    const wk = weekStart(day.date);

    // ── その日のお米をどこで食べるか ──
    let riceAt: "dinner" | "breakfast" | null = null;
    let noodleDinner = false;
    const dinners = usable.filter((r) => r.slot === "dinner");
    if (!day.fixedRice) {
      if (has("dinner")) {
        const canNoodle = !day.lunchOut && has("breakfast") && (noodleCount[wk] ?? 0) < NOODLE_PER_WEEK;
        if (canNoodle) {
          const bestRice = Math.max(...dinners.filter((r) => r.rice).map((r) => score(r, day.date)));
          const bestNoodle = Math.max(...dinners.filter((r) => r.noodle).map((r) => score(r, day.date)));
          noodleDinner = bestNoodle >= bestRice - 1;
        }
        riceAt = noodleDinner ? "breakfast" : "dinner";
      } else if (has("breakfast")) {
        riceAt = "breakfast";
      }
    }

    // ── 朝食 ──
    if (has("breakfast")) {
      let cands = usable.filter((r) => r.slot === "breakfast");
      if (riceAt === "breakfast") cands = cands.filter((r) => r.rice);
      if (weekday) cands = cands.filter((r) => r.min <= 15);
      const two = pickTwo(cands, day.date, (r) => (!weekday && r.min > 15 ? 2 : 0));
      if (two) {
        const [a, b] = two;
        consume(a, day.date);
        picked.push({ date: day.date, recipeId: a.id });
        if (b) picked.push({ date: day.date, recipeId: b.id });
        meals.push({
          slot: "breakfast",
          options: [toOption(day.date, "A", a, a.sides), ...(b ? [toOption(day.date, "B", b, b.sides)] : [])],
        });
      }
    }

    // ── お弁当（長男・次男） ──
    if (has("bento")) {
      const two = pickTwo(usable.filter((r) => r.slot === "bento"), day.date);
      if (two) {
        const [a, b] = two;
        consume(a, day.date);
        picked.push({ date: day.date, recipeId: a.id });
        if (b) picked.push({ date: day.date, recipeId: b.id });
        meals.push({ slot: "bento", options: [toOption(day.date, "A", a, a.sides), ...(b ? [toOption(day.date, "B", b, b.sides)] : [])] });
      }
    }

    // ── 夕食：主菜 ＋ ご飯 ＋ 汁物 ＋ 副菜 ──
    if (has("dinner")) {
      const variety = (r: Recipe) => (r.protein === lastDinnerProtein ? -3 : 0);
      let a: Recipe | undefined;
      let b: Recipe | null = null;
      if (noodleDinner) {
        a = pickTwo(dinners.filter((r) => r.noodle), day.date, variety)?.[0];
        b = pickTwo(dinners.filter((r) => r.rice && r.id !== a?.id), day.date, (r) => variety(r) + (r.protein !== a?.protein ? 2 : 0))?.[0] ?? null;
      } else {
        const cands = riceAt === "dinner" ? dinners.filter((r) => r.rice) : dinners;
        const two = pickTwo(cands, day.date, variety);
        if (two) [a, b] = two;
      }
      if (a) {
        const soup = bestOf(soups, day.date, a.ing);
        const build = (label: string, r: Recipe) => {
          const side = bestOf(sides, day.date, [...r.ing, ...(soup?.ing ?? [])]);
          const dishes: string[] = [];
          const extra: string[] = [];
          if (r.rice && !r.riceDish) dishes.push("ご飯");
          if (!r.riceDish && !r.noodle && soup) {
            dishes.push(soup.name);
            extra.push(...soup.ing);
          }
          if (side) {
            dishes.push(side.name);
            extra.push(...side.ing);
            picked.push({ date: day.date, recipeId: side.id });
          }
          return toOption(day.date, label, r, dishes, extra);
        };
        const optA = build("A", a);
        consume(a, day.date);
        picked.push({ date: day.date, recipeId: a.id });
        const options = [optA];
        if (b) {
          options.push(build("B", b));
          picked.push({ date: day.date, recipeId: b.id });
        }
        if (soup) picked.push({ date: day.date, recipeId: soup.id });
        meals.push({ slot: "dinner", options });
        lastDinnerProtein = a.protein;
        if (noodleDinner) {
          noodleCount[wk] = (noodleCount[wk] ?? 0) + 1;
          noodleDays.push(day.date);
        }
      }
    }

    if (day.fixedRice || riceAt) riceDays++;
    out.push({ date: day.date, meals });
  }

  // ── ひとこと ──
  const fmt = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  const homeDays = input.days.filter((d) => d.slots.some((s) => s !== "bento") || d.fixedRice).length;
  const notes = [`お米は${homeDays}日中${riceDays}日。`];
  if (noodleDays.length) notes.push(`${noodleDays.map(fmt).join("・")}は夕食A案が麺・パンなので、朝をお米にしています。`);
  if (usedSoon.size) notes.push(`期限が近い${Array.from(usedSoon).slice(0, 4).join("・")}を先に使う献立にしました。`);
  return { days: out, note: notes.join("") };
}
