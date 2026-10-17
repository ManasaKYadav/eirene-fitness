// Eirene — Neo4j constraints and indexes
//
// Run by scripts/sync-neo4j.mjs before it loads data. Every statement uses
// IF NOT EXISTS, so running it again changes nothing.
//
// Each node's id is the primary key of the matching PostgreSQL row, so a
// uniqueness constraint on id keeps the graph and PostgreSQL in step. A
// uniqueness constraint also creates an index, so lookups by id are fast.

CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (n:User) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT goal_id_unique IF NOT EXISTS FOR (n:Goal) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT injury_id_unique IF NOT EXISTS FOR (n:Injury) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT allergen_id_unique IF NOT EXISTS FOR (n:Allergen) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT exercise_id_unique IF NOT EXISTS FOR (n:Exercise) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT ingredient_id_unique IF NOT EXISTS FOR (n:Ingredient) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT food_id_unique IF NOT EXISTS FOR (n:Food) REQUIRE n.id IS UNIQUE;

// The admin pages and search look foods and exercises up by name.
CREATE INDEX food_name IF NOT EXISTS FOR (n:Food) ON (n.name);
CREATE INDEX exercise_name IF NOT EXISTS FOR (n:Exercise) ON (n.name);
