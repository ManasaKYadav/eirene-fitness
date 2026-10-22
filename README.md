# Eirene

A safety-aware fitness and diet recommender. Eirene stores users, workouts, meals
and progress, then filters recommendations against each user's injuries and
allergies — including allergens hidden inside nested ingredients.

Built with Next.js (App Router, TypeScript), PostgreSQL (Neon) and Neo4j (AuraDB).

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| App | Next.js 16, App Router, TypeScript | Route handlers and UI in one project |
| SQL | PostgreSQL on Neon | Transactions, FKs, CHECK constraints, recursive CTEs, row-level security |
| NoSQL | Neo4j AuraDB | Safety checks and "similar users" are path queries |
| SQL access | `pg` with plain SQL, no ORM | Every query is visible SQL |
| Auth | `bcryptjs` hashes, `jose` JWT in an httpOnly cookie | Role checks in `middleware.ts` |

## Setup

```bash
git clone https://github.com/rheasushanth/eirene-fitness.git
cd eirene-fitness
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`GET /api/health` reports whether each database is reachable.

## Repository layout

```
app/              routes and pages
  api/health/     database reachability check
lib/db.ts         pg Pool, query() and withUser() (roles and row-level security)
lib/auth.ts       session JWT
lib/neo4j.ts      Neo4j driver and run() helper
lib/graph-*.ts    graph reads and write-through (training, nutrition)
lib/recommendations.ts  safe-food and similar-user graph queries
db/sql/           schema, seed, triggers, procedures, views, queries, security
db/neo4j/         constraints and graph setup
docs/             ER diagram
scripts/          one-off scripts (PostgreSQL -> Neo4j sync)
```

## Seeded accounts

`seed.sql` creates these. Every one uses the password `password123`.

| Email | Role | Useful for |
| --- | --- | --- |
| `admin@eirene.test` | admin | admin exercises, foods and insights |
| `meera@eirene.test` | user | peanut allergy and a lower back strain: the safety demo |
| `aarav@eirene.test`, `rohan@eirene.test` | user | same goal as Meera (Fat Loss), so they drive her recommendations |
| `ananya@eirene.test`, `kabir@eirene.test`, `isha@eirene.test`, `vikram@eirene.test`, `sana@eirene.test` | user | other goals, injuries and allergies |

Accounts created through `/register` are always role `user`; admin is granted
in the database. These are throwaway credentials for a coursework database —
nothing real is protected by them.

## Database setup order

Run against Neon in this order:

1. `db/sql/schema.sql` — drops and recreates every table
2. `db/sql/seed.sql` — empties every table and reloads the demo data
3. `db/sql/triggers.sql`
4. `db/sql/procedures.sql`
5. `db/sql/views.sql`
6. `db/sql/security.sql` — re-run this after any change to tables or views,
   since dropping a view drops its grants

```bash
node --env-file=.env.local scripts/run-sql.mjs db/sql/schema.sql
# ...and so on for each file
```

Then copy the data into Neo4j. The sync script applies
`db/neo4j/constraints.cypher`, clears the graph and rebuilds it from
PostgreSQL, so it is safe to re-run after reseeding:

```bash
node --env-file=.env.local scripts/sync-neo4j.mjs
```

`db/sql/queries.sql` holds the report queries; run it the same way to see
their results.

## Checking the safety rules

With the dev server running:

```bash
node --env-file=.env.local scripts/verify-nutrition.mjs
```

It signs in as Meera and checks that no peanut dish is listed, that the peanut
hidden in the satay sauce is caught, that a peanut meal is refused, and that
recommendations skip anything unsafe. Restart the server with a wrong
`NEO4J_PASSWORD` and add `--expect-503` to check that the app shows nothing
rather than an unchecked list.

## Who built what

Two-person project, each owning a feature area end to end (SQL, Neo4j, API, UI).

- **Rhea — Training & Users:** auth and roles, injuries and exercises, workout
  and progress logging, the safety trigger and `log_workout` procedure, database
  roles and row-level security, safe-exercise graph query, admin exercises.
- **Manasa — Nutrition & Recommendations:** goals, allergens and nested
  ingredients, meal logging, `daily_calories`, the recursive allergen CTE, the
  Neo4j sync and recommendation queries, admin foods.
