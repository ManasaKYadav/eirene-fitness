import neo4j, { Driver } from "neo4j-driver";

const globalForNeo4j = globalThis as unknown as { neo4jDriver?: Driver };

function getDriver(): Driver {
  if (!globalForNeo4j.neo4jDriver) {
    const uri = process.env.NEO4J_URI;
    const username = process.env.NEO4J_USERNAME;
    const password = process.env.NEO4J_PASSWORD;
    if (!uri || !username || !password) {
      throw new Error(
        "NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD must be set. Copy .env.example to .env.local and fill them in."
      );
    }
    globalForNeo4j.neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }
  return globalForNeo4j.neo4jDriver;
}

export async function run(cypher: string, params: Record<string, unknown> = {}) {
  const session = getDriver().session({
    database: process.env.NEO4J_DATABASE || undefined,
  });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}