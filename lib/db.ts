import { Pool, types, type QueryResult, type QueryResultRow } from "pg";

// Return DATE columns as the plain 'YYYY-MM-DD' string the database holds.
// By default the driver builds a JavaScript Date at local midnight, which in
// any timezone ahead of UTC serialises back as the previous day — so a
// workout logged today would appear on the dashboard as yesterday.
types.setTypeParser(types.builtins.DATE, (value) => value);

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

  // TLS comes from the connection string (Neon appends sslmode=require), and
  // its certificate validates against Node's trust store, so the certificate
  // is verified rather than blindly accepted.
  return new Pool({
    connectionString,
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
