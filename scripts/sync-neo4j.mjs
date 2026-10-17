// Copies the PostgreSQL data into Neo4j. PostgreSQL stays the source of truth.
//
// Run from the project root:
//   node --env-file=.env.local scripts/sync-neo4j.mjs
//
// It applies db/neo4j/constraints.cypher, empties the graph, then rebuilds every
// node and relationship from PostgreSQL, so it is safe to run again after
// reseeding the database.
//
// Graph model
//   Nodes:  User, Goal, Injury, Allergen, Exercise, Ingredient, Food
//   Edges:  (User)-[:HAS_GOAL]->(Goal)
//           (User)-[:HAS_INJURY]->(Injury)
//           (User)-[:ALLERGIC_TO]->(Allergen)
//           (Exercise)-[:STRAINS]->(Injury)
//           (Food)-[:CONTAINS]->(Ingredient)
//           (Ingredient)-[:CONTAINS]->(Ingredient)   nested ingredients
//           (Ingredient)-[:HAS_ALLERGEN]->(Allergen)
//           (User)-[:DID {count}]->(Exercise)
//           (User)-[:ATE {count}]->(Food)

import { readFileSync } from "node:fs";
import pg from "pg";
import neo4j from "neo4j-driver";

const {
  DATABASE_URL,
  NEO4J_URI,
  NEO4J_USERNAME,
  NEO4J_PASSWORD,
  NEO4J_DATABASE,
} = process.env;

if (!DATABASE_URL || !NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  console.error(
    "Missing DATABASE_URL or NEO4J_* values. Run with: node --env-file=.env.local scripts/sync-neo4j.mjs"
  );
  process.exit(1);
}

const pgClient = new pg.Client({ connectionString: DATABASE_URL });
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));
const session = driver.session({ database: NEO4J_DATABASE || undefined });

async function select(sql) {
  const result = await pgClient.query(sql);
  return result.rows;
}

// One round trip per batch: UNWIND turns the list of rows into one MERGE each.
async function load(label, cypher, rows) {
  if (rows.length > 0) await session.run(cypher, { rows });
  console.log(`  ${label}: ${rows.length}`);
}

async function applyConstraints() {
  const text = readFileSync("db/neo4j/constraints.cypher", "utf8");
  const statements = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await session.run(statement);
  console.log(`Applied ${statements.length} constraints and indexes`);
}

async function syncNodes() {
  console.log("Nodes");

  await load(
    "User",
    `UNWIND $rows AS row
     MERGE (n:User {id: row.id})
     SET n.name = row.name, n.role = row.role`,
    (await select("SELECT user_id AS id, full_name AS name, role FROM users")).map((r) => r)
  );

  await load(
    "Goal",
    `UNWIND $rows AS row
     MERGE (n:Goal {id: row.id})
     SET n.name = row.name`,
    await select("SELECT goal_id AS id, name FROM goals")
  );

  await load(
    "Injury",
    `UNWIND $rows AS row
     MERGE (n:Injury {id: row.id})
     SET n.name = row.name, n.bodyPart = row.body_part`,
    await select("SELECT injury_id AS id, name, body_part FROM injuries")
  );

  await load(
    "Allergen",
    `UNWIND $rows AS row
     MERGE (n:Allergen {id: row.id})
     SET n.name = row.name`,
    await select("SELECT allergen_id AS id, name FROM allergens")
  );

  await load(
    "Exercise",
    `UNWIND $rows AS row
     MERGE (n:Exercise {id: row.id})
     SET n.name = row.name, n.muscleGroup = row.muscle_group`,
    await select("SELECT exercise_id AS id, name, muscle_group FROM exercises")
  );

  await load(
    "Ingredient",
    `UNWIND $rows AS row
     MERGE (n:Ingredient {id: row.id})
     SET n.name = row.name`,
    await select("SELECT ingredient_id AS id, name FROM ingredients")
  );

  const foods = await select("SELECT food_id AS id, name, calories FROM foods");
  await load(
    "Food",
    `UNWIND $rows AS row
     MERGE (n:Food {id: row.id})
     SET n.name = row.name, n.calories = row.calories`,
    foods.map((f) => ({ ...f, calories: Number(f.calories) }))
  );
}

async function syncEdges() {
  console.log("Relationships");

  await load(
    "HAS_GOAL",
    `UNWIND $rows AS row
     MATCH (a:User {id: row.user_id})
     MATCH (b:Goal {id: row.goal_id})
     MERGE (a)-[:HAS_GOAL]->(b)`,
    await select("SELECT user_id, goal_id FROM users WHERE goal_id IS NOT NULL")
  );

  await load(
    "HAS_INJURY",
    `UNWIND $rows AS row
     MATCH (a:User {id: row.user_id})
     MATCH (b:Injury {id: row.injury_id})
     MERGE (a)-[r:HAS_INJURY]->(b)
     SET r.severity = row.severity`,
    await select("SELECT user_id, injury_id, severity FROM user_injuries")
  );

  await load(
    "ALLERGIC_TO",
    `UNWIND $rows AS row
     MATCH (a:User {id: row.user_id})
     MATCH (b:Allergen {id: row.allergen_id})
     MERGE (a)-[r:ALLERGIC_TO]->(b)
     SET r.severity = row.severity`,
    await select("SELECT user_id, allergen_id, severity FROM user_allergies")
  );

  await load(
    "STRAINS",
    `UNWIND $rows AS row
     MATCH (a:Exercise {id: row.exercise_id})
     MATCH (b:Injury {id: row.injury_id})
     MERGE (a)-[:STRAINS]->(b)`,
    await select("SELECT exercise_id, injury_id FROM exercise_injuries")
  );

  const foodParts = await select(
    "SELECT food_id, ingredient_id, quantity_g FROM food_ingredients"
  );
  await load(
    "CONTAINS (food -> ingredient)",
    `UNWIND $rows AS row
     MATCH (a:Food {id: row.food_id})
     MATCH (b:Ingredient {id: row.ingredient_id})
     MERGE (a)-[r:CONTAINS]->(b)
     SET r.quantityG = row.quantity_g`,
    foodParts.map((p) => ({ ...p, quantity_g: p.quantity_g === null ? null : Number(p.quantity_g) }))
  );

  await load(
    "CONTAINS (ingredient -> ingredient)",
    `UNWIND $rows AS row
     MATCH (a:Ingredient {id: row.parent_id})
     MATCH (b:Ingredient {id: row.child_id})
     MERGE (a)-[:CONTAINS]->(b)`,
    await select("SELECT parent_id, child_id FROM ingredient_parts")
  );

  await load(
    "HAS_ALLERGEN",
    `UNWIND $rows AS row
     MATCH (a:Ingredient {id: row.ingredient_id})
     MATCH (b:Allergen {id: row.allergen_id})
     MERGE (a)-[:HAS_ALLERGEN]->(b)`,
    await select(
      "SELECT ingredient_id, allergen_id FROM ingredients WHERE allergen_id IS NOT NULL"
    )
  );

  await load(
    "DID",
    `UNWIND $rows AS row
     MATCH (a:User {id: row.user_id})
     MATCH (b:Exercise {id: row.exercise_id})
     MERGE (a)-[r:DID]->(b)
     SET r.count = row.count`,
    await select(
      `SELECT user_id, exercise_id, count(*)::int AS count
       FROM workout_logs GROUP BY user_id, exercise_id`
    )
  );

  await load(
    "ATE",
    `UNWIND $rows AS row
     MATCH (a:User {id: row.user_id})
     MATCH (b:Food {id: row.food_id})
     MERGE (a)-[r:ATE]->(b)
     SET r.count = row.count`,
    await select(
      `SELECT user_id, food_id, count(*)::int AS count
       FROM meal_logs GROUP BY user_id, food_id`
    )
  );
}

async function summary() {
  const nodes = await session.run(
    "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY label"
  );
  const edges = await session.run(
    "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY type"
  );
  console.log("\nNodes in Neo4j");
  console.table(nodes.records.map((r) => ({ label: r.get("label"), count: r.get("count").toNumber() })));
  console.log("Relationships in Neo4j");
  console.table(edges.records.map((r) => ({ type: r.get("type"), count: r.get("count").toNumber() })));
}

try {
  await pgClient.connect();
  await applyConstraints();
  await session.run("MATCH (n) DETACH DELETE n");
  console.log("Cleared existing graph");
  await syncNodes();
  await syncEdges();
  await summary();
  console.log("Sync complete.");
} catch (err) {
  console.error("Sync failed:", err.message);
  process.exitCode = 1;
} finally {
  await session.close();
  await driver.close();
  await pgClient.end();
}
