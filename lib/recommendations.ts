import neo4j from "neo4j-driver";
import { run } from "@/lib/neo4j";
import { GraphUnavailableError } from "@/lib/graph-training";

// Graph reads for the nutrition side: the allergy filter and the
// similar-user recommendations.
//
// Every function here throws GraphUnavailableError when Neo4j cannot answer.
// Callers turn that into a 503 and show nothing, never an unfiltered list.

export type SafeFood = {
  foodId: number;
  name: string;
  calories: number;
};

export type UnsafeFood = {
  foodId: number;
  name: string;
  allergens: string[];
};

export type RecommendedExercise = {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  users: number;
  doneByMe: boolean;
};

export type RecommendedFood = {
  foodId: number;
  name: string;
  calories: number;
  users: number;
  eatenByMe: boolean;
};

export type Recommendations = {
  goal: string | null;
  exercises: RecommendedExercise[];
  foods: RecommendedFood[];
};

/** The driver returns whole numbers as its own Integer type, and values that
 *  were written from JavaScript come back as plain floats. Both become a
 *  JavaScript number here. */
function toNumber(value: unknown): number {
  return neo4j.isInt(value) ? value.toNumber() : Number(value);
}

/**
 * Foods with no path to any allergen the user is allergic to.
 *
 *   (Food)-[:CONTAINS*1..]->(Ingredient)-[:HAS_ALLERGEN]->(Allergen)<-[:ALLERGIC_TO]-(User)
 *
 * CONTAINS*1.. follows the chain to any depth, so the peanut inside the
 * peanut butter inside the satay sauce is found without knowing in advance
 * how deep it sits. In SQL the same question needs the recursive CTE.
 */
export async function getSafeFoods(userId: number): Promise<SafeFood[]> {
  try {
    const records = await run(
      `MATCH (f:Food)
       WHERE NOT EXISTS {
         MATCH (f)-[:CONTAINS*1..]->(:Ingredient)-[:HAS_ALLERGEN]->(a:Allergen)
               <-[:ALLERGIC_TO]-(:User {id: $userId})
       }
       RETURN f.id AS id, f.name AS name, f.calories AS calories
       ORDER BY f.name`,
      { userId }
    );

    return records.map((r) => ({
      foodId: toNumber(r.get("id")),
      name: r.get("name") as string,
      calories: toNumber(r.get("calories")),
    }));
  } catch (err) {
    throw new GraphUnavailableError(err);
  }
}

/** Foods the allergy filter removes, with the allergens behind each. */
export async function getUnsafeFoods(userId: number): Promise<UnsafeFood[]> {
  try {
    const records = await run(
      `MATCH (:User {id: $userId})-[:ALLERGIC_TO]->(a:Allergen)
             <-[:HAS_ALLERGEN]-(:Ingredient)<-[:CONTAINS*1..]-(f:Food)
       RETURN f.id AS id, f.name AS name, collect(DISTINCT a.name) AS allergens
       ORDER BY f.name`,
      { userId }
    );

    return records.map((r) => ({
      foodId: toNumber(r.get("id")),
      name: r.get("name") as string,
      allergens: r.get("allergens") as string[],
    }));
  } catch (err) {
    throw new GraphUnavailableError(err);
  }
}

/**
 * What people with the same goal actually do and eat, minus anything unsafe
 * for this user.
 *
 * Similar users are the others who share my HAS_GOAL edge. Their DID and ATE
 * edges are what "worked for them". Each item is ranked by how many distinct
 * similar users chose it, which is also the reason shown on the page.
 *
 * Exercises that STRAIN one of my injuries and foods with a CONTAINS path to
 * one of my allergens are removed inside the query, so an unsafe item can
 * never reach the page even if it is the most popular.
 */
export async function getRecommendations(userId: number): Promise<Recommendations> {
  try {
    const goalRecords = await run(
      `MATCH (:User {id: $userId})-[:HAS_GOAL]->(g:Goal)
       RETURN g.name AS goal`,
      { userId }
    );

    // No goal, no similar users to learn from.
    if (goalRecords.length === 0) {
      return { goal: null, exercises: [], foods: [] };
    }

    const goal = goalRecords[0].get("goal") as string;

    const exerciseRecords = await run(
      `MATCH (me:User {id: $userId})-[:HAS_GOAL]->(:Goal)<-[:HAS_GOAL]-(other:User)
       WHERE other <> me
       MATCH (other)-[:DID]->(e:Exercise)
       WHERE NOT EXISTS {
         MATCH (me)-[:HAS_INJURY]->(:Injury)<-[:STRAINS]-(e)
       }
       WITH me, e, count(DISTINCT other) AS users
       RETURN e.id AS id, e.name AS name, e.muscleGroup AS muscleGroup, users,
              EXISTS { MATCH (me)-[:DID]->(e) } AS doneByMe
       ORDER BY users DESC, name
       LIMIT 5`,
      { userId }
    );

    const foodRecords = await run(
      `MATCH (me:User {id: $userId})-[:HAS_GOAL]->(:Goal)<-[:HAS_GOAL]-(other:User)
       WHERE other <> me
       MATCH (other)-[:ATE]->(f:Food)
       WHERE NOT EXISTS {
         MATCH (f)-[:CONTAINS*1..]->(:Ingredient)-[:HAS_ALLERGEN]->(:Allergen)<-[:ALLERGIC_TO]-(me)
       }
       WITH me, f, count(DISTINCT other) AS users
       RETURN f.id AS id, f.name AS name, f.calories AS calories, users,
              EXISTS { MATCH (me)-[:ATE]->(f) } AS eatenByMe
       ORDER BY users DESC, name
       LIMIT 5`,
      { userId }
    );

    return {
      goal,
      exercises: exerciseRecords.map((r) => ({
        exerciseId: toNumber(r.get("id")),
        name: r.get("name") as string,
        muscleGroup: r.get("muscleGroup") as string,
        users: toNumber(r.get("users")),
        doneByMe: r.get("doneByMe") as boolean,
      })),
      foods: foodRecords.map((r) => ({
        foodId: toNumber(r.get("id")),
        name: r.get("name") as string,
        calories: toNumber(r.get("calories")),
        users: toNumber(r.get("users")),
        eatenByMe: r.get("eatenByMe") as boolean,
      })),
    };
  } catch (err) {
    throw new GraphUnavailableError(err);
  }
}
