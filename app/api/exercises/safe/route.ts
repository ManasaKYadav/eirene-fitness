import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { safeExercisesFor, unsafeExercisesFor, GraphUnavailableError } from "@/lib/graph-training";

// GET /api/exercises/safe — the safe list, answered by Neo4j.
//
// Fails closed. If the graph cannot be reached the response is 503 and the
// page says recommendations are unavailable, because showing an unfiltered
// list is how someone ends up squatting on an injured knee.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const [safe, unsafe] = await Promise.all([
      safeExercisesFor(session.userId),
      unsafeExercisesFor(session.userId),
    ]);

    return NextResponse.json({ safe, unsafe, source: "neo4j" });
  } catch (err) {
    if (err instanceof GraphUnavailableError) {
      console.error("safe exercises unavailable", err.cause);
      return NextResponse.json(
        {
          error:
            "Safe exercises are unavailable right now. Nothing is shown rather than an unchecked list.",
        },
        { status: 503 }
      );
    }

    console.error("safe exercises failed", err);
    return NextResponse.json({ error: "Could not load exercises" }, { status: 500 });
  }
}
