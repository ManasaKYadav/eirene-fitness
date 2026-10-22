import type { ScopedQuery } from "@/lib/db";

export type CatalogFood = {
  food_id: number;
  name: string;
  calories: string;
  protein_g: string | null;
  carbs_g: string | null;
  fat_g: string | null;
  ingredient_ids: number[];
  allergens: string[];
};

export type CatalogIngredient = { ingredient_id: number; name: string; allergen: string | null };

/** The catalog with each food's direct ingredients and every allergen it
 *  holds, however deep (from v_food_allergens). Used by the admin foods page
 *  and GET /api/admin/foods. Run it inside withUser as an admin. */
export async function loadFoodCatalog(q: ScopedQuery) {
  const foods = await q<CatalogFood>(
    `SELECT f.food_id, f.name, f.calories, f.protein_g, f.carbs_g, f.fat_g,
            COALESCE(
              array_agg(fi.ingredient_id ORDER BY fi.ingredient_id)
                FILTER (WHERE fi.ingredient_id IS NOT NULL),
              '{}'
            ) AS ingredient_ids,
            (SELECT COALESCE(array_agg(fa.allergen_name ORDER BY fa.allergen_name), '{}')
               FROM v_food_allergens fa
              WHERE fa.food_id = f.food_id) AS allergens
       FROM foods f
       LEFT JOIN food_ingredients fi ON fi.food_id = f.food_id
      GROUP BY f.food_id
      ORDER BY f.name`
  );
  const ingredients = await q<CatalogIngredient>(
    `SELECT i.ingredient_id, i.name, a.name AS allergen
       FROM ingredients i
       LEFT JOIN allergens a ON a.allergen_id = i.allergen_id
      ORDER BY i.name`
  );
  return { foods: foods.rows, ingredients: ingredients.rows };
}
