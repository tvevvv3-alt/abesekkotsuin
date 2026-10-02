// アプリ全体で使うデータの型。Supabase のテーブル（supabase/schema.sql）と1対1で対応。

export type Role = "father" | "mother" | "child";
export type MealSlot = "breakfast" | "bento" | "dinner";
export type AwayMeal = "breakfast" | "lunch" | "dinner";
export type Rating = "ate" | "some" | "none";

export type Member = {
  id: string;
  name: string;
  role: Role;
  birth_date: string | null; // 子どもの月齢・年齢から献立の調整を出すために使う
  color: string;
  sort: number;
};

export type FamilyEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  member_ids: string[]; // 空なら「家族」
  start_time: string | null; // 外出時刻 HH:MM
  end_time: string | null; // 帰宅時刻 HH:MM
  tentative: boolean; // 仮の予定（ストライプ表示）
  away_meals: AwayMeal[]; // 家で食べない食事
  memo: string | null;
};

export type MealOption = {
  label: string; // "A" | "B"
  title: string; // 主菜など料理名
  dishes: string[]; // 副菜・汁物など
  rice: boolean; // お米を食べる献立か（1週間のバランス計算に使う）
  toddler_note: string | null; // 三男向けの味付け・硬さ・大きさの調整
};

export type MealPlan = {
  id: string;
  date: string;
  slot: MealSlot;
  options: MealOption[];
  chosen: string | null; // 選んだ option の label
  ratings: Record<string, Rating>; // member_id → 食べた/少し/食べない
};

export type PantryItem = {
  id: string;
  name: string;
  quantity: string | null;
  category: string | null;
  expires_on: string | null;
};

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string | null;
  checked: boolean;
};

export type TableName = "members" | "events" | "meal_plans" | "pantry_items" | "shopping_items";

export const TABLES: TableName[] = ["members", "events", "meal_plans", "pantry_items", "shopping_items"];
