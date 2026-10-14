import { Pool, type QueryResult, type QueryResultRow } from "pg";

// One Pool per process, created on first use. In dev, Next.js hot-reloads
// modules, so the pool is cached on globalThis to stop every reload from
// opening a new set of connections to Neon. Creating it lazily also keeps
// `next build` working without a DATABASE_URL.
const globalForDb = globalThis as unknown as { eirenePool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  return new Pool({
    connectionString,
    // Neon requires TLS. It serves a cert Node does not trust by default, so
    // verification is relaxed here the same way `sslmode=require` does.
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  if (!globalForDb.eirenePool) {
    globalForDb.eirenePool = createPool();
  }
  return globalForDb.eirenePool;
}

/**
 * Run a parameterised SQL statement.
 *
 * Always pass values through `params` ($1, $2, ...) instead of building the
 * string, so the driver escapes them and SQL injection is not possible.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Convenience wrapper for queries that return at most one row. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}
