import { run } from "@/lib/neo4j";

// Graph queries and writes for the training side.
//
// Node ids mirror the PostgreSQL primary keys, so a user id or exercise id
// means the same thing in both databases.

export type SafeExercise = {
  exerciseId: number;
  name: string;
  muscleGroup: string;
};

/** Raised when Neo4j cannot answer. Callers turn this into a 503: the app
 *  shows no list rather than an unfiltered one. */
export class GraphUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The recommendation database is unavailable");
    this.name = "GraphUnavailableError";
    this.cause = cause;
  }
}

/**
 * Exercises that strain none of the user's injuries.
 *
 *   (User)-[:HAS_INJURY]->(Injury)<-[:STRAINS]-(Exercise)
 *
 * The query asks for the absence of that path. NOT EXISTS over a pattern is
 * the point of using a graph here: in SQL the same question needs a NOT
 * EXISTS over a two-table join, and it gets worse as the chain lengthens.
 */
export async function safeExercisesFor(userId: number): Promise<SafeExercise[]> {
  try {
    const records = await run(
      `MATCH (e:Exercise)
       WHERE NOT EXISTS {
         MATCH (u:User {id: $userId})-[:HAS_INJURY]->(i:Injury)<-[:STRAINS]-(e)
       }
       RETURN e.id AS id, e.name AS name, e.muscleGroup AS muscleGroup
       ORDER BY e.muscleGroup, e.name`,
      { userId }
    );

    return records.map((r) => ({
      // The driver returns integers as its own Integer type, which loses
      // nothing here but is not a JavaScript number until converted.
      exerciseId: Number(r.get("id")),
      name: r.get("name") as string,
      muscleGroup: r.get("muscleGroup") as string,
    }));
  } catch (err) {
    throw new GraphUnavailableError(err);
  }
}

/** Exercises that would be refused, with the injuries behind each. */
export async function unsafeExercisesFor(
  userId: number
): Promise<{ exerciseId: number; name: string; injuries: string[] }[]> {
  try {
    const records = await run(
      `MATCH (u:User {id: $userId})-[:HAS_INJURY]->(i:Injury)<-[:STRAINS]-(e:Exercise)
       RETURN e.id AS id, e.name AS name, collect(DISTINCT i.name) AS injuries
       ORDER BY e.name`,
      { userId }
    );

    return records.map((r) => ({
      exerciseId: Number(r.get("id")),
      name: r.get("name") as string,
      injuries: r.get("injuries") as string[],
    }));
  } catch (err) {
    throw new GraphUnavailableError(err);
  }
}

/**
 * Record that a user performed an exercise, as a weighted edge.
 *
 * Called after the workout has committed in PostgreSQL, which stays the
 * source of truth. The count is what the recommendation query reads to find
 * the exercises that people with the same goal actually do.
 */
export async function recordDidExercise(userId: number, exerciseId: number): Promise<void> {
  await run(
    `MATCH (u:User {id: $userId}), (e:Exercise {id: $exerciseId})
     MERGE (u)-[r:DID]->(e)
     ON CREATE SET r.count = 1
     ON MATCH  SET r.count = coalesce(r.count, 0) + 1`,
    { userId, exerciseId }
  );
}

/** Mirror an injury the user has just recorded. */
export async function addInjuryEdge(
  userId: number,
  injuryId: number,
  severity: string
): Promise<void> {
  await run(
    `MATCH (u:User {id: $userId}), (i:Injury {id: $injuryId})
     MERGE (u)-[r:HAS_INJURY]->(i)
     SET r.severity = $severity`,
    { userId, injuryId, severity }
  );
}

/** Remove an injury edge, which makes the exercises it blocked safe again. */
export async function removeInjuryEdge(userId: number, injuryId: number): Promise<void> {
  await run(
    `MATCH (:User {id: $userId})-[r:HAS_INJURY]->(:Injury {id: $injuryId})
     DELETE r`,
    { userId, injuryId }
  );
}

/** Keep the graph in step when the catalog changes. */
export async function upsertExerciseNode(
  exerciseId: number,
  name: string,
  muscleGroup: string
): Promise<void> {
  await run(
    `MERGE (e:Exercise {id: $exerciseId})
     SET e.name = $name, e.muscleGroup = $muscleGroup`,
    { exerciseId, name, muscleGroup }
  );
}

export async function deleteExerciseNode(exerciseId: number): Promise<void> {
  await run(`MATCH (e:Exercise {id: $exerciseId}) DETACH DELETE e`, { exerciseId });
}

/** Replace the set of injuries an exercise strains. */
export async function setExerciseStrains(
  exerciseId: number,
  injuryIds: number[]
): Promise<void> {
  await run(
    `MATCH (e:Exercise {id: $exerciseId})
     OPTIONAL MATCH (e)-[r:STRAINS]->(:Injury)
     DELETE r`,
    { exerciseId }
  );

  if (injuryIds.length === 0) return;

  await run(
    `MATCH (e:Exercise {id: $exerciseId})
     UNWIND $injuryIds AS injuryId
     MATCH (i:Injury {id: injuryId})
     MERGE (e)-[:STRAINS]->(i)`,
    { exerciseId, injuryIds }
  );
}
