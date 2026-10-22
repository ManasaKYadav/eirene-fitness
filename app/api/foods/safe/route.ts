import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { GraphUnavailableError } from "@/lib/graph-training";
import { checkedSafeFoods } from "@/lib/safe-foods";

/** Foods with none of the signed-in user's allergens, including allergens
 *  hidden inside nested ingredients. Answered by Neo4j, checked against
 *  v_safe_foods.
 *
 *  Fails closed: if the graph cannot be reached the response is 503 and no
 *  list is sent, rather than an unchecked one. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to see safe foods." }, { status: 401 });
  }

  try {
    const { safe, unsafe } = await checkedSafeFoods(session);
    return NextResponse.json({ foods: safe, hidden: unsafe, source: "neo4j" });
  } catch (err) {
    if (err instanceof GraphUnavailableError) {
      console.error("safe foods unavailable", err.cause);
      return NextResponse.json(
        {
          error:
            "Safe foods are unavailable right now. Nothing is shown rather than an unchecked list.",
        },
        { status: 503 }
      );
    }

    console.error("safe foods failed", err);
    return NextResponse.json({ error: "Could not load foods." }, { status: 500 });
  }
}
