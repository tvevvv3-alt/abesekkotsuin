import { STAPLES, ingredientInfo, sameIngredient } from "./ingredients";
import type { Recipe } from "./recipes";
import type { MealOption, PantryItem } from "./types";

// レシピ集の料理を、献立カードの1案にする（「レシピから選ぶ」用）
// date の時点で期限が切れている在庫は「足りない」側に入れる
export function optionFromRecipe(r: Recipe, pantry: PantryItem[], date: string, label = "A"): MealOption {
  const uses: string[] = [];
  const missing: string[] = [];
  for (const i of r.ing) {
    const hit = pantry.find((p) => sameIngredient(p.name, i) && (!p.expires_on || p.expires_on >= date));
    if (hit) uses.push(hit.name);
    else if (!STAPLES.includes(i)) missing.push(ingredientInfo(i)?.name ?? i);
  }
  return {
    label,
    title: r.name,
    dishes: r.slot === "dinner" && r.rice && !r.riceDish ? ["ご飯", ...r.sides] : r.sides,
    rice: r.rice,
    toddler_note: r.toddler || null,
    uses,
    missing,
    recipe_id: r.id,
  };
}
