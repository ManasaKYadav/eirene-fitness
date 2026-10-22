import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { GraphUnavailableError } from "@/lib/graph-training";
import { getRecommendations } from "@/lib/recommendations";

// GET /api/recommendations — exercises and foods that users with the same
// goal chose, with anything unsafe for this user already removed.
//
// Fails closed. If the graph cannot be reached the response is 503: the
// safety filter lives in the same query, so there is nothing safe to fall
// back to.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const recommendations = await getRecommendations(session.userId);
    return NextResponse.json({ ...recommendations, source: "neo4j" });
  } catch (err) {
    if (err instanceof GraphUnavailableError) {
      console.error("recommendations unavailable", err.cause);
      return NextResponse.json(
        {
          error:
            "Recommendations are unavailable right now. Nothing is shown rather than an unchecked list.",
        },
        { status: 503 }
      );
    }

    console.error("recommendations failed", err);
    return NextResponse.json({ error: "Could not load recommendations" }, { status: 500 });
  }
}
