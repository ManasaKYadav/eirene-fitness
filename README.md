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
lib/db.ts         pg Pool and query() helper
db/sql/           schema, seed, triggers, procedures, views, queries, security
db/neo4j/         constraints and graph setup
docs/             ER diagram
scripts/          one-off scripts (PostgreSQL -> Neo4j sync)
```

## Development accounts

A temporary admin account exists for testing the role checks until the seed
data lands:

| Email | Password | Role |
| --- | --- | --- |
| `admin@eirene.dev` | `adminpass123` | admin |

Normal accounts are created through `/register` and are always role `user`;
admin is granted in the database. These are throwaway credentials for a
coursework database — nothing real is protected by them.

## Database setup order

Run against Neon in this order, then run the Neo4j sync script:

1. `db/sql/schema.sql`
2. `db/sql/seed.sql`
3. `db/sql/triggers.sql`
4. `db/sql/procedures.sql`
5. `db/sql/views.sql`
6. `db/sql/security.sql`

## Who built what

Two-person project, each owning a feature area end to end (SQL, Neo4j, API, UI).

- **Person A — Training & Users:** auth and roles, injuries and exercises, workout
  and progress logging, the safety trigger and `log_workout` procedure, database
  roles and row-level security, safe-exercise graph query, admin exercises.
- **Person B — Nutrition & Recommendations:** goals, allergens and nested
  ingredients, meal logging, `daily_calories`, the recursive allergen CTE, the
  Neo4j sync and recommendation queries, admin foods.
