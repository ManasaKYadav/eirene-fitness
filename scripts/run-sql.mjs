import { readFileSync } from "node:fs";
import pg from "pg";

const [flag, arg] = process.argv.slice(2);
if (!flag) {
  console.error('Usage: node --env-file=.env.local scripts/run-sql.mjs <file.sql>  |  -c "<sql>"');
  process.exit(1);
}

const sql = flag === "-c" ? arg : readFileSync(flag, "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const res = await client.query(sql);
  const last = Array.isArray(res) ? res[res.length - 1] : res;
  if (last.rows && last.rows.length) console.table(last.rows);
  console.log("Done.");
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}