import { randomUUID } from "crypto";

// ローカル開発用の初期データ。supabase/seed.sql と同じ内容。
// 家族の名前・誕生日・色はアプリの「家族と色の設定」から変更できる。
export const MEMBER_IDS = {
  father: "00000000-0000-4000-8000-000000000001",
  mother: "00000000-0000-4000-8000-000000000002",
  son1: "00000000-0000-4000-8000-000000000003",
  son2: "00000000-0000-4000-8000-000000000004",
  son3: "00000000-0000-4000-8000-000000000005",
};

export function seedData() {
  const M = MEMBER_IDS;
  const ev = (date: string, title: string, member_ids: string[], extra: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    date,
    title,
    member_ids,
    start_time: null,
    end_time: null,
    tentative: false,
    away_meals: [],
    memo: null,
    ...extra,
  });
  return {
    members: [
      { id: M.father, name: "父", role: "father", birth_date: null, color: "#3b82f6", sort: 1 },
      { id: M.mother, name: "母", role: "mother", birth_date: null, color: "#ec4899", sort: 2 },
      { id: M.son1, name: "長男", role: "child", birth_date: "2020-04-01", color: "#22c55e", sort: 3 },
      { id: M.son2, name: "次男", role: "child", birth_date: "2022-04-01", color: "#f59e0b", sort: 4 },
      { id: M.son3, name: "三男", role: "child", birth_date: "2025-04-01", color: "#a855f7", sort: 5 },
    ],
    events: [
      ev("2026-10-04", "発表会", [M.son1, M.son2], { start_time: "09:00", end_time: "13:00", away_meals: ["lunch"] }),
      ev("2026-10-07", "就学前健診", [M.son1, M.mother], { start_time: "13:30", end_time: "15:30" }),
      ev("2026-10-15", "運動会練習", [M.son2], { tentative: true }),
      ev("2026-10-17", "飲み会", [M.father], { start_time: "18:30", end_time: "23:00", away_meals: ["dinner"] }),
      ev("2026-10-19", "運動会", [M.son1, M.son2, M.son3, M.father, M.mother], { start_time: "08:30", end_time: "15:00", away_meals: ["lunch"] }),
      ev("2026-10-21", "歯医者", [M.son3, M.mother], { start_time: "10:00", end_time: "11:00", tentative: true }),
    ],
    meal_plans: [
      {
        id: randomUUID(),
        date: "2026-10-05",
        slot: "dinner",
        chosen: null,
        ratings: {},
        options: [
          {
            label: "A",
            title: "鮭のちゃんちゃん焼き",
            dishes: ["ご飯", "豆腐とわかめの味噌汁", "ほうれん草のおひたし"],
            rice: true,
            toddler_note: "味噌を入れる前に鮭と野菜を取り分け、骨と皮を除いて1cm角にほぐす。野菜は指でつぶせる柔らかさまで蒸す。",
          },
          {
            label: "B",
            title: "鶏そぼろ丼",
            dishes: ["ご飯", "かぼちゃの煮物", "キャベツの味噌汁"],
            rice: true,
            toddler_note: "そぼろは醤油・砂糖を入れる前に取り分け、だしで煮る。ご飯は軟飯にしてそぼろを混ぜる。",
          },
        ],
      },
    ],
    pantry_items: [
      { id: randomUUID(), name: "生鮭", quantity: "3切れ", category: "魚", expires_on: "2026-10-05" },
      { id: randomUUID(), name: "鶏ひき肉", quantity: "300g", category: "肉", expires_on: "2026-10-06" },
      { id: randomUUID(), name: "キャベツ", quantity: "1/2玉", category: "野菜", expires_on: "2026-10-09" },
      { id: randomUUID(), name: "卵", quantity: "8個", category: "卵・乳", expires_on: "2026-10-14" },
    ],
    shopping_items: [
      { id: randomUUID(), name: "牛乳", quantity: "1本", checked: false, created_at: new Date().toISOString() },
    ],
    custom_recipes: [],
  };
}
