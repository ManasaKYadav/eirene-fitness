import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { run } from "@/lib/neo4j";

type DbStatus = { ok: boolean; error?: string };

async function checkPostgres(): Promise<DbStatus> {
  try {
    await query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkNeo4j(): Promise<DbStatus> {
  try {
    await run("RETURN 1 AS ok");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const [postgres, neo4j] = await Promise.all([checkPostgres(), checkNeo4j()]);
  const allOk = postgres.ok && neo4j.ok;

  const body = {
    status: allOk ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    databases: { postgres, neo4j },
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}