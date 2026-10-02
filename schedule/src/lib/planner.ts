import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { addDays, isBentoDay, weekday, WEEKDAYS } from "./date";
import { deleteRow, getSetting, insertRow, listRows, updateRow } from "./db";
import { holidayName } from "./holidays";
import { AWAY_MEAL_LABEL, MEAL_SLOT_LABEL } from "./labels";
import { DEFAULT_PREFERENCES } from "./preferences";
import { dayHasRice, weekRange } from "./rice";
import { ageInMonths } from "./safety";
import type { AwayMeal, FamilyEvent, MealOption, MealPlan, MealSlot, Member, PantryItem } from "./types";

// 予定・在庫・年齢・好み・食べた記録をもとに、Claude に A/B 献立を作ってもらう。
// 組み替えのときは「まだ選んでいない献立」だけを作り直し、選んだ献立は残す。

const OptionSchema = z.object({
  label: z.enum(["A", "B"]),
  title: z.string(),
  dishes: z.array(z.string()),
  rice: z.boolean(),
  toddler_note: z.string(),
  uses: z.array(z.string()),
  missing: z.array(z.string()),
});

const PlanSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      meals: z.array(
        z.object({
          slot: z.enum(["breakfast", "bento", "dinner"]),
          options: z.array(OptionSchema),
        })
      ),
    })
  ),
  note: z.string(),
});

const SYSTEM = `あなたは阿部家（父・母・長男6歳・次男4歳・三男1歳）の献立係です。
家族の予定、家にある食材、子どもの年齢、家族の好み、これまでの「食べた／食べなかった」記録をもとに、
無理なく作れる家庭料理の献立を日本語で提案します。

守ること:
- 指定された日・食事（slot）だけを、それぞれ A と B の2案で出す。A と B は主菜の種類を変える（例：肉と魚、和と洋）
- 期限が近い食材から優先して使う。使う家の食材は uses に、足りない食材は missing に入れる（米・基本の調味料・油は missing に入れない）
- お米は「1日1食」を目安に、1週間全体でバランスを取る。外で昼を食べる日は麺やパンになりやすいので、その日の朝か夜にお米を入れる。
  お米を入れると決めた食事は、A・B どちらを選んでもお米になるようにする。すでに決まっている食事（fixed）も数に入れる
- rice は、ご飯・丼・おにぎり・炊き込みご飯・お粥など、お米を食べる献立なら true
- dishes には主菜以外（ご飯・汁物・副菜）を短く入れる
- toddler_note には、三男向けに同じ料理から取り分けて、味付け・硬さ・大きさをどう調整するかを具体的に1〜2文で書く（例：味付け前に取り分ける、1cm角、指でつぶせる柔らかさ）。お弁当は空文字でよい
- 1歳児に危険な食材（はちみつ、餅、ナッツ類、丸のままのミニトマトやぶどう、生もの、いか・たこ）は三男の分では避けるか、安全な形にする方法を書く
- お弁当は朝に短時間で詰められるもの。前日の夕食の取り分けや作り置きも活用する
- 平日の朝食は15分以内で作れるもの
- 最近出した料理（recent）と同じものを続けない。子どもが食べなかった料理は控えめに、よく食べた料理は活かす
- note には、この期間の献立の考え方（お米のバランスや食材の使い方）を2〜3文で書く`;

type Range = { from: string; to: string };

type Target = { date: string; slot: MealSlot; eaters: string[] };

export class PlannerError extends Error {}

function eatersFor(members: Member[], events: FamilyEvent[], meal: AwayMeal): Member[] {
  const away = new Set(
    events
      .filter((e) => e.away_meals.includes(meal))
      .flatMap((e) => (e.member_ids.length ? e.member_ids : members.map((m) => m.id)))
  );
  return members.filter((m) => !away.has(m.id));
}

function dates(range: Range): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export async function planMeals(range: Range, today: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new PlannerError("献立の提案には ANTHROPIC_API_KEY の設定が必要です（DEPLOY_GUIDE.md を参照）");
  }

  const weeks = { from: weekRange(range.from).from, to: weekRange(range.to).to };
  const [members, events, plans, pantry, history, prefs] = await Promise.all([
    listRows("members") as unknown as Promise<Member[]>,
    listRows("events", range) as unknown as Promise<FamilyEvent[]>,
    listRows("meal_plans", weeks) as unknown as Promise<MealPlan[]>,
    listRows("pantry_items") as unknown as Promise<PantryItem[]>,
    listRows("meal_plans", { from: addDays(range.from, -28), to: addDays(range.from, -1) }) as unknown as Promise<MealPlan[]>,
    getSetting("preferences"),
  ]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const kids = members.filter((m) => m.role === "child").sort((a, b) => (a.birth_date ?? "").localeCompare(b.birth_date ?? ""));
  const toddler = kids[kids.length - 1];
  const bentoKids = kids.slice(0, Math.max(kids.length - 1, 0));

  // 作る対象（日付×食事）と、すでに選んで決まっている食事
  const targets: Target[] = [];
  const days = dates(range).map((date) => {
    const dayEvents = events.filter((e) => e.date === date);
    const dayPlans = plans.filter((p) => p.date === date);
    const holiday = holidayName(date);
    const fixed = dayPlans
      .filter((p) => p.chosen)
      .map((p) => {
        const o = p.options.find((x) => x.label === p.chosen)!;
        return { slot: p.slot, title: o?.title, rice: !!o?.rice };
      });
    const slots: Target[] = [];
    for (const slot of ["breakfast", "bento", "dinner"] as MealSlot[]) {
      if (fixed.some((f) => f.slot === slot)) continue;
      if (slot === "bento") {
        if (isBentoDay(date) && !holiday && bentoKids.length) slots.push({ date, slot, eaters: bentoKids.map((m) => m.name) });
        continue;
      }
      const eaters = eatersFor(members, dayEvents, slot);
      if (eaters.length) slots.push({ date, slot, eaters: eaters.map((m) => m.name) });
    }
    targets.push(...slots);
    const lunchHome = eatersFor(members, dayEvents, "lunch");
    return {
      date,
      weekday: WEEKDAYS[weekday(date)],
      holiday,
      events: dayEvents.map((e) => ({
        title: e.title,
        who: e.member_ids.length ? e.member_ids.map(nameOf).join("・") : "家族みんな",
        out: e.start_time,
        back: e.end_time,
        eats_out: e.away_meals.map((m) => AWAY_MEAL_LABEL[m]),
      })),
      lunch_out: members.filter((m) => !lunchHome.includes(m)).map((m) => m.name),
      fixed,
      make: slots.map((s) => ({ slot: s.slot, meal: MEAL_SLOT_LABEL[s.slot], eaters: s.eaters })),
    };
  });

  if (targets.length === 0) return { saved: 0, note: "この期間は、作る献立がありません（すべて決定済みか外食です）。" };

  // 範囲外の同じ週で、すでにお米を食べた（食べる予定の）日
  const outside = plans.filter((p) => p.date < range.from || p.date > range.to);
  const outsideDates = Array.from(new Set(outside.map((p) => p.date)));
  const riceOutside = outsideDates.filter((d) => dayHasRice(outside.filter((p) => p.date === d)));

  const context = {
    today,
    family: members.map((m) => {
      const months = ageInMonths(m.birth_date, today);
      return {
        name: m.name,
        role: m.role,
        age: months == null ? null : months < 24 ? `${months}か月` : `${Math.floor(months / 12)}歳`,
      };
    }),
    toddler: toddler?.name ?? null,
    preferences: prefs ?? DEFAULT_PREFERENCES,
    days,
    same_week_rice_days_outside_range: riceOutside,
    pantry: pantry.map((p) => ({ name: p.name, quantity: p.quantity, expires_on: p.expires_on })),
    recent: history
      .filter((p) => p.chosen)
      .map((p) => {
        const o = p.options.find((x) => x.label === p.chosen);
        return {
          date: p.date,
          meal: MEAL_SLOT_LABEL[p.slot],
          title: o?.title,
          ate: Object.fromEntries(Object.entries(p.ratings ?? {}).map(([id, r]) => [nameOf(id), r])),
        };
      }),
  };

  const client = new Anthropic();
  let parsed: z.infer<typeof PlanSchema> | null;
  try {
    const stream = client.beta.messages.stream({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(PlanSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `次の内容で献立を作ってください。days[].make に書かれた食事だけを出してください。\n\n${JSON.stringify(context, null, 1)}`,
        },
      ],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new PlannerError("AI が提案を返しませんでした。もう一度お試しください。");
    if (message.stop_reason === "max_tokens") throw new PlannerError("期間が長すぎました。短い期間で作り直してください。");
    parsed = message.parsed_output;
  } catch (e) {
    if (e instanceof PlannerError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new PlannerError("ANTHROPIC_API_KEY が正しくありません。");
    if (e instanceof Anthropic.RateLimitError) throw new PlannerError("AI が混み合っています。少し待ってからお試しください。");
    if (e instanceof Anthropic.APIError) throw new PlannerError(`AI の呼び出しに失敗しました（${e.status ?? "通信エラー"}）。`);
    throw e;
  }
  if (!parsed) throw new PlannerError("AI の返答を読み取れませんでした。もう一度お試しください。");

  // 保存：対象の食事だけ。まだ選んでいない既存の献立は上書きする
  const key = (d: string, s: string) => `${d}|${s}`;
  const wanted = new Set(targets.map((t) => key(t.date, t.slot)));
  let saved = 0;
  for (const day of parsed.days) {
    for (const meal of day.meals) {
      if (!wanted.has(key(day.date, meal.slot))) continue;
      wanted.delete(key(day.date, meal.slot));
      const options: MealOption[] = meal.options.slice(0, 2).map((o) => ({
        ...o,
        toddler_note: o.toddler_note.trim() || null,
      }));
      const existing = plans.find((p) => p.date === day.date && p.slot === meal.slot);
      if (existing) await updateRow("meal_plans", existing.id, { options, chosen: null, ratings: {} });
      else await insertRow("meal_plans", { date: day.date, slot: meal.slot, options, chosen: null, ratings: {} });
      saved++;
    }
  }

  // 予定が変わって不要になった（全員外食など）未選択の献立は消す
  const needed = new Set(targets.map((t) => key(t.date, t.slot)));
  for (const p of plans) {
    if (p.date < range.from || p.date > range.to || p.chosen) continue;
    if (!needed.has(key(p.date, p.slot))) await deleteRow("meal_plans", p.id);
  }

  return { saved, note: parsed.note };
}
