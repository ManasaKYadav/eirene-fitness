import neo4j from "neo4j-driver";
import { run } from "@/lib/neo4j";

// Graph writes for the nutrition side. Each runs after PostgreSQL has
// committed, since PostgreSQL is the source of truth; the caller decides what
// a failure here means for the request.
//
// The user node is MERGEd rather than MATCHed. Accounts created through
// /register after the sync script last ran have no node yet, and a MATCH
// would silently write nothing, which for an allergy means the graph would
// treat the user as able to eat anything.

/** Record that a user ate a food, as a weighted edge the recommendations
 *  count. */
export async function recordMeal(userId: number, foodId: number): Promise<void> {
  await run(
    `MERGE (u:User {id: $userId})
     WITH u
     MATCH (f:Food {id: $foodId})
     MERGE (u)-[r:ATE]->(f)
     ON CREATE SET r.count = 1
     ON MATCH  SET r.count = coalesce(r.count, 0) + 1`,
    { userId, foodId }
  );
}

/** Mirror an allergy the user has just added, or its new severity. */
export async function addAllergy(
  userId: number,
  allergenId: number,
  severity: string
): Promise<void> {
  const records = await run(
    `MERGE (u:User {id: $userId})
     WITH u
     MATCH (a:Allergen {id: $allergenId})
     MERGE (u)-[r:ALLERGIC_TO]->(a)
     SET r.severity = $severity
     RETURN count(r) AS written`,
    { userId, allergenId, severity }
  );

  // No Allergen node means the graph is behind the catalog. Failing here
  // makes the route report it rather than leave the allergy unenforced.
  const written = records[0]?.get("written");
  if (!written || (neo4j.isInt(written) ? written.toNumber() : Number(written)) === 0) {
    throw new Error(`Allergen ${allergenId} is not in the graph`);
  }
}

/** Remove an allergy edge, which makes the foods it blocked safe again. */
export async function removeAllergy(userId: number, allergenId: number): Promise<void> {
  await run(
    `MATCH (:User {id: $userId})-[r:ALLERGIC_TO]->(:Allergen {id: $allergenId})
     DELETE r`,
    { userId, allergenId }
  );
}

/** Replace the user's goal. A user has at most one, so the old edge goes
 *  first; null just clears it. */
export async function setGoal(userId: number, goalId: number | null): Promise<void> {
  await run(
    `MERGE (u:User {id: $userId})
     WITH u
     OPTIONAL MATCH (u)-[r:HAS_GOAL]->(:Goal)
     DELETE r`,
    { userId }
  );

  if (goalId === null) return;

  await run(
    `MATCH (u:User {id: $userId}), (g:Goal {id: $goalId})
     MERGE (u)-[:HAS_GOAL]->(g)`,
    { userId, goalId }
  );
}

/** Keep the graph in step when the food catalog changes. */
export async function upsertFoodNode(
  foodId: number,
  name: string,
  calories: number
): Promise<void> {
  await run(
    `MERGE (f:Food {id: $foodId})
     SET f.name = $name, f.calories = $calories`,
    { foodId, name, calories }
  );
}

export async function deleteFoodNode(foodId: number): Promise<void> {
  await run(`MATCH (f:Food {id: $foodId}) DETACH DELETE f`, { foodId });
}

/** Replace the ingredients a food CONTAINS. The nested ingredient edges
 *  below them are catalog data and are left alone. */
export async function setFoodIngredients(
  foodId: number,
  ingredients: { ingredientId: number; quantityG: number | null }[]
): Promise<void> {
  await run(
    `MATCH (f:Food {id: $foodId})
     OPTIONAL MATCH (f)-[r:CONTAINS]->(:Ingredient)
     DELETE r`,
    { foodId }
  );

  if (ingredients.length === 0) return;

  await run(
    `MATCH (f:Food {id: $foodId})
     UNWIND $ingredients AS item
     MATCH (i:Ingredient {id: item.ingredientId})
     MERGE (f)-[r:CONTAINS]->(i)
     SET r.quantityG = item.quantityG`,
    { foodId, ingredients }
  );
}
