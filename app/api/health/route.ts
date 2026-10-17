import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type DbStatus = { ok: boolean; error?: string };

async function checkPostgres(): Promise<DbStatus> {
  try {
    await query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// TODO: add checkNeo4j() here (RETURN 1 via lib/neo4j.ts) and include it
// in the response below, so this one route reports both databases.

export async function GET() {
  const postgres = await checkPostgres();

  const body = {
    status: postgres.ok ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    databases: { postgres },
  };

  return NextResponse.json(body, { status: postgres.ok ? 200 : 503 });
}
