import neo4j, { Driver } from "neo4j-driver";

const globalForNeo4j = globalThis as unknown as { neo4jDriver?: Driver };

const driver =
  globalForNeo4j.neo4jDriver ??
  neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
  );

if (process.env.NODE_ENV !== "production") globalForNeo4j.neo4jDriver = driver;

export async function run(cypher: string, params: Record<string, unknown> = {}) {
  const session = driver.session({ database: process.env.NEO4J_DATABASE });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}