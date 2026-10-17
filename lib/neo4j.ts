import neo4j, { Driver } from "neo4j-driver";

// One driver per process, created on first use. In dev, Next.js hot-reloads
// modules, so it is cached on globalThis rather than reconnecting on every
// edit. Creating it lazily also keeps `next build` working on a machine that
// has no Neo4j credentials, which an eager driver breaks at import time.
const globalForNeo4j = globalThis as unknown as { neo4jDriver?: Driver };

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    throw new Error(
      "NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD must be set. Copy .env.example to .env.local and fill them in."
    );
  }

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

export function getDriver(): Driver {
  if (!globalForNeo4j.neo4jDriver) {
    globalForNeo4j.neo4jDriver = createDriver();
  }
  return globalForNeo4j.neo4jDriver;
}

export async function run(cypher: string, params: Record<string, unknown> = {}) {
  const session = getDriver().session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}
