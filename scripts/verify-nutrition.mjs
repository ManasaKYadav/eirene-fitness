// Checks the nutrition safety rules against a running dev server.
//
// Start the app first, then from the project root:
//   node --env-file=.env.local scripts/verify-nutrition.mjs
//
// To check that the app fails closed, restart the dev server with a wrong
// NEO4J_PASSWORD and run:
//   node --env-file=.env.local scripts/verify-nutrition.mjs --expect-503
//
// Read-only: it signs in as the seeded user Meera (peanut allergy, lower back
// strain), reads her lists, and tries to log a peanut dish, which must be
// refused. PostgreSQL is only read, to cross-check what the graph returned.

import pg from "pg";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EXPECT_503 = process.argv.includes("--expect-503");

let failures = 0;
function check(ok, label) {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

async function signIn(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  if (!res.ok) throw new Error(`Could not sign in as ${email} (HTTP ${res.status})`);
  return res.headers.get("set-cookie").split(";")[0];
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const cookie = await signIn("meera@eirene.test");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

try {
  if (EXPECT_503) {
    console.log("\nNeo4j unavailable: nothing unchecked is shown");
    const foods = await get("/api/foods/safe", cookie);
    check(foods.status === 503 && !foods.body.foods, `GET /api/foods/safe -> ${foods.status}, no list`);
    const recs = await get("/api/recommendations", cookie);
    check(recs.status === 503 && !recs.body.foods, `GET /api/recommendations -> ${recs.status}, no list`);
  } else {
    const unsafeIds = new Set(
      (
        await db.query(
          `SELECT DISTINCT fa.food_id
             FROM v_food_allergens fa
             JOIN user_allergies ua ON ua.allergen_id = fa.allergen_id
            WHERE ua.user_id = 3`
        )
      ).rows.map((r) => r.food_id)
    );

    console.log("\nTest 1  A peanut-allergic user never sees peanut dishes");
    const foods = await get("/api/foods/safe", cookie);
    check(foods.status === 200, `GET /api/foods/safe -> ${foods.status}`);
    const listed = foods.body.foods ?? [];
    console.log(`   ${listed.length} foods listed, ${foods.body.hidden?.length ?? 0} hidden`);
    check(listed.length > 0, "the list is not empty");
    check(!listed.some((f) => unsafeIds.has(f.foodId)), "no listed food contains peanut at any depth");
    check(!listed.some((f) => /peanut|satay/i.test(f.name)), "no peanut or satay dish by name");

    console.log("\nTest 2  The hidden allergen in satay sauce is caught");
    const satay = (foods.body.hidden ?? []).find((f) => f.name === "Chicken Satay Skewers");
    check(Boolean(satay), "Chicken Satay Skewers is in the hidden list");
    check(satay?.allergens.includes("Peanut"), `hidden because of: ${satay?.allergens.join(", ")}`);
    const path = await db.query(
      `SELECT allergen_name, depth, via FROM v_food_allergens WHERE food_id = 1 AND allergen_id = 1`
    );
    check(path.rows[0]?.depth === 3, `PostgreSQL agrees: peanut found ${path.rows[0]?.depth} levels down`);

    const refused = await fetch(`${BASE}/api/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ foodId: 1, servings: 1, mealType: "lunch" }),
    });
    check(refused.status === 403, `logging the satay directly is refused (HTTP ${refused.status})`);

    console.log("\nTest 3  Recommendations skip unsafe items");
    const recs = await get("/api/recommendations", cookie);
    check(recs.status === 200, `GET /api/recommendations -> ${recs.status}`);
    console.log(`   goal: ${recs.body.goal}`);
    for (const e of recs.body.exercises ?? []) console.log(`   exercise  ${e.name} (chosen by ${e.users})`);
    for (const f of recs.body.foods ?? []) console.log(`   food      ${f.name} (chosen by ${f.users})`);

    const strainIds = new Set(
      (
        await db.query(
          `SELECT ei.exercise_id
             FROM exercise_injuries ei
             JOIN user_injuries ui ON ui.injury_id = ei.injury_id
            WHERE ui.user_id = 3`
        )
      ).rows.map((r) => r.exercise_id)
    );
    check((recs.body.exercises ?? []).length > 0, "some exercises are recommended");
    check(
      !(recs.body.exercises ?? []).some((e) => strainIds.has(e.exerciseId)),
      "no recommended exercise strains her lower back"
    );
    check(
      !(recs.body.foods ?? []).some((f) => unsafeIds.has(f.foodId)),
      "no recommended food contains peanut"
    );
  }
} finally {
  await db.end();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
