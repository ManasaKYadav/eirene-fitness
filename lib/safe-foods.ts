import type { Session } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getSafeFoods, getUnsafeFoods, type SafeFood, type UnsafeFood } from "@/lib/recommendations";

/**
 * The foods a user may log, as used by the meals page and GET /api/foods/safe.
 *
 * Neo4j answers the question. The answer is then checked against v_safe_foods
 * in PostgreSQL, the source of truth, and anything PostgreSQL does not also
 * consider safe is dropped. The two only disagree when the graph has fallen
 * behind (an allergy added while Neo4j was down, say), and in that case the
 * stricter answer wins.
 *
 * Throws GraphUnavailableError if Neo4j cannot answer. There is no fallback
 * to the PostgreSQL list on purpose: the graph is the filter the page shows.
 */
export async function checkedSafeFoods(
  session: Session
): Promise<{ safe: SafeFood[]; unsafe: UnsafeFood[] }> {
  const safe = await getSafeFoods(session.userId);
  const unsafe = await getUnsafeFoods(session.userId);

  const confirmed = await withUser(session, async (q) => {
    const result = await q<{ food_id: number }>(
      `SELECT food_id FROM v_safe_foods WHERE user_id = $1`,
      [session.userId]
    );
    return new Set(result.rows.map((r) => r.food_id));
  });

  const agreed = safe.filter((f) => confirmed.has(f.foodId));
  if (agreed.length !== safe.length) {
    console.warn(
      `graph and PostgreSQL disagree on safe foods for user ${session.userId}; re-run the sync script`
    );
  }

  return { safe: agreed, unsafe };
}
