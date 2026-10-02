import { ingredientInfo } from "./ingredients";
import type { Protein, Recipe } from "./recipes";
import type { CustomRecipe } from "./types";

// 家族が追加した料理を、レシピ集と同じ形にそろえる
export function toRecipe(c: CustomRecipe): Recipe {
  const ing = c.ingredients.map((i) => ingredientInfo(i)?.name ?? i);
  const cats = ing.map((i) => ingredientInfo(i)?.category);
  const protein: Protein = cats.includes("肉")
    ? "meat"
    : cats.includes("魚")
    ? "fish"
    : cats.includes("卵・乳")
    ? "egg"
    : cats.includes("豆腐・大豆")
    ? "soy"
    : "veg";
  return {
    id: `c-${c.id}`,
    slot: c.slot,
    name: c.name,
    sides: [],
    rice: c.rice,
    riceDish: false,
    noodle: !c.rice,
    protein,
    ing,
    min: c.minutes,
    toddler: c.toddler_note ?? "",
    custom: true,
  };
}
