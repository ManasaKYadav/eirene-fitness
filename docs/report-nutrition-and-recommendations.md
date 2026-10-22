# Eirene — report sections: Nutrition & Recommendations

Draft sections covering the database choice, the Neo4j model, the
recommendation logic, the architecture, the data dictionary, the nutrition
SQL, and the test results. Written to be pasted into the project report;
headings can be renumbered to fit the final document.

---

## 1. Database choice and justification

Eirene uses two databases, and each holds the data it suits.

| Database | Holds | Why |
| --- | --- | --- |
| PostgreSQL (Neon) | Every account, log and catalog row: users, goals, injuries, allergens, exercises, ingredients, foods, and the workout, meal and progress logs | The data has a fixed shape and must be correct: foreign keys, CHECK constraints, transactions and row-level security keep it that way. Reports (calories per goal, weekly volume) are JOINs and aggregates, which SQL does well. PostgreSQL was chosen over MySQL for recursive CTEs, `security_invoker` views and row-level security. |
| Neo4j (AuraDB) | The same entities as nodes, and the relationships between them as edges | The two questions the app exists to answer are path questions: "does this food reach one of my allergens through any chain of ingredients?" and "what did people like me do?". In Cypher each is one pattern; in SQL each needs a recursive CTE or several self-joins. |

**PostgreSQL is the source of truth.** Every change is written to PostgreSQL
first and committed; only then is the graph updated. If the two ever disagree,
`scripts/sync-neo4j.mjs` rebuilds the graph from PostgreSQL.

**Safety rule: fail closed.** If Neo4j cannot answer, the app shows no list
rather than an unfiltered one. An unchecked food list is exactly how a peanut
allergy meets a satay sauce.

---

## 2. The Neo4j model

### 2.1 Nodes

Every node carries an `id` equal to the primary key of its PostgreSQL row, so
an id means the same thing in both databases.

| Label | From table | Properties |
| --- | --- | --- |
| `User` | users | id, name, role |
| `Goal` | goals | id, name |
| `Injury` | injuries | id, name, bodyPart |
| `Allergen` | allergens | id, name |
| `Exercise` | exercises | id, name, muscleGroup |
| `Ingredient` | ingredients | id, name |
| `Food` | foods | id, name, calories |

### 2.2 Relationships

| Edge | From table | Meaning |
| --- | --- | --- |
| `(User)-[:HAS_GOAL]->(Goal)` | users.goal_id | the user's goal, at most one |
| `(User)-[:HAS_INJURY {severity}]->(Injury)` | user_injuries | |
| `(User)-[:ALLERGIC_TO {severity}]->(Allergen)` | user_allergies | |
| `(Exercise)-[:STRAINS]->(Injury)` | exercise_injuries | doing this aggravates that injury |
| `(Food)-[:CONTAINS {quantityG}]->(Ingredient)` | food_ingredients | direct ingredients |
| `(Ingredient)-[:CONTAINS]->(Ingredient)` | ingredient_parts | nested ingredients: Satay Sauce → Peanut Butter → Peanut |
| `(Ingredient)-[:HAS_ALLERGEN]->(Allergen)` | ingredients.allergen_id | only on ingredients that are an allergen themselves |
| `(User)-[:DID {count}]->(Exercise)` | workout_logs | how many times the user logged it |
| `(User)-[:ATE {count}]->(Food)` | meal_logs | how many times the user logged it |

Using the same `CONTAINS` type for food→ingredient and ingredient→ingredient
is deliberate: it lets one variable-length pattern, `CONTAINS*1..`, follow a
food all the way down without caring where the food ends and the nesting
begins.

### 2.3 Constraints and indexes

`db/neo4j/constraints.cypher` creates a uniqueness constraint on `id` for each
of the seven labels (which also gives each an index for lookups by id) and an
index on `name` for `Food` and `Exercise`. Every statement uses
`IF NOT EXISTS`, so the sync script applies them on every run.

### 2.4 Keeping the graph in step

Each route writes PostgreSQL first, then the graph:

| Change | PostgreSQL | Graph | If the graph write fails |
| --- | --- | --- | --- |
| Log a meal | INSERT meal_logs | MERGE `ATE`, count + 1 | logged, the meal is kept (it only feeds recommendations) |
| Add / remove an allergy | INSERT / DELETE user_allergies | MERGE / DELETE `ALLERGIC_TO` | 503: "saved, but the food filter could not be updated" |
| Change goal | UPDATE users.goal_id | replace `HAS_GOAL` | 503: "saved, but recommendations could not be updated" |
| Admin adds / edits / deletes a food | foods, food_ingredients | MERGE `Food`, replace `CONTAINS`, or DETACH DELETE | warning shown to the admin, re-run the sync script |

The user node is `MERGE`d, not `MATCH`ed, in these writes. An account created
through `/register` after the sync script last ran has no node yet; a `MATCH`
would write nothing, and the graph would treat that user as able to eat
anything.

An allergy or goal failure is reported as 503 rather than logged quietly
because, unlike a meal, it changes what the user is shown. The user is told
the change was saved and can retry.

### 2.5 The safe-food query

```cypher
MATCH (f:Food)
WHERE NOT EXISTS {
  MATCH (f)-[:CONTAINS*1..]->(:Ingredient)-[:HAS_ALLERGEN]->(a:Allergen)
        <-[:ALLERGIC_TO]-(:User {id: $userId})
}
RETURN f.id, f.name, f.calories
ORDER BY f.name
```

A food is unsafe if there is any path, of any length, from the food through
its ingredients to an allergen the user is allergic to. `CONTAINS*1..` finds
the peanut in Chicken Satay Skewers three levels down without knowing in
advance how deep it sits. The matching query without `NOT` lists the hidden
foods together with the allergens behind each, which the meals page shows.

**Defence in depth.** The meals page and `GET /api/foods/safe` take this list
from Neo4j and then keep only the foods that `v_safe_foods` in PostgreSQL also
allows. The two only disagree if the graph has fallen behind, and then the
stricter answer wins. `POST /api/meals` re-checks the food against
`v_safe_foods` inside the same transaction as the insert, so even a
hand-crafted request cannot log an unsafe food.

---

## 3. Recommendation logic

The plan's rule is "recommend what worked for users with similar goals". There
is no separate plans table: what people actually logged, the `DID` and `ATE`
edges, is the evidence.

```cypher
MATCH (me:User {id: $userId})-[:HAS_GOAL]->(:Goal)<-[:HAS_GOAL]-(other:User)
WHERE other <> me
MATCH (other)-[:ATE]->(f:Food)
WHERE NOT EXISTS {
  MATCH (f)-[:CONTAINS*1..]->(:Ingredient)-[:HAS_ALLERGEN]->(:Allergen)<-[:ALLERGIC_TO]-(me)
}
WITH me, f, count(DISTINCT other) AS users
RETURN f.id, f.name, f.calories, users,
       EXISTS { MATCH (me)-[:ATE]->(f) } AS eatenByMe
ORDER BY users DESC, f.name
LIMIT 5
```

Step by step:

1. **Similar users** are the others who share my `HAS_GOAL` edge.
2. **Candidates** are the foods they `ATE` (and, in the twin query, the
   exercises they `DID`).
3. **Safety filter.** Foods with a `CONTAINS*1..` path to one of my allergens
   are removed, as are exercises that `STRAIN` one of my injuries. The filter
   runs inside the same query, so an unsafe item cannot reach the page however
   popular it is.
4. **Ranking.** `count(DISTINCT other)` counts people, not log entries, so one
   enthusiastic user cannot outvote three others. Ties are broken by name so
   the order is stable.
5. **Reason.** The count is shown on each item: "Chosen by 2 users with your
   goal (Fat Loss)". Items the user has already done or eaten are marked.

A user with no goal is asked to set one. If Neo4j is down, `GET
/api/recommendations` returns 503 and the page says recommendations are
unavailable; there is no fallback, because the safety filter lives in the same
query.

---

## 4. System architecture

```
 Browser (Next.js pages: meals, recommendations, profile, admin foods)
    │  fetch / server components
    ▼
 proxy.ts ── signed in? admin for /admin/*?
    │
    ▼
 Next.js route handlers (app/api/*)          session from the httpOnly JWT cookie
    │                                   │
    │ 1. withUser(): BEGIN,              │ 2. after COMMIT
    │    SET LOCAL ROLE eirene_user,     │
    │    app.user_id, queries, COMMIT    │
    ▼                                   ▼
 PostgreSQL (Neon)                     Neo4j (AuraDB)
 source of truth                        relationships for the safety
 tables, trigger, procedure,            filter and recommendations
 function, views, RLS                   (lib/recommendations.ts,
    │                                     lib/graph-sync.ts)
    └──── scripts/sync-neo4j.mjs rebuilds the graph from PostgreSQL ────┘
```

Credentials live only in `.env.local` (`DATABASE_URL`, `NEO4J_URI`,
`NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `JWT_SECRET`), which git
ignores; `.env.example` lists the names with empty values.

---

## 5. Data dictionary

Types are PostgreSQL types. PK = primary key, FK = foreign key.

### Training & Users

**users** — accounts

| Column | Type | Constraints |
| --- | --- | --- |
| user_id | SERIAL | PK |
| email | VARCHAR(255) | NOT NULL, UNIQUE, must contain `@` |
| password_hash | VARCHAR(255) | NOT NULL (bcrypt) |
| full_name | VARCHAR(120) | NOT NULL, not blank |
| role | VARCHAR(10) | NOT NULL, default `user`, `admin` or `user` |
| goal_id | INT | FK → goals, ON DELETE SET NULL |
| last_workout_on | DATE | set by `log_workout` |
| height_cm | INT | added by ALTER, NULL or 50–260 |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

**injuries** — catalog: injury_id SERIAL PK; name VARCHAR(80) NOT NULL UNIQUE;
body_part VARCHAR(60) NOT NULL; description TEXT.

**user_injuries** — user_id FK → users CASCADE; injury_id FK → injuries
CASCADE; severity mild/moderate/severe; noted_on DATE not in the future;
PK (user_id, injury_id).

**exercises** — catalog: exercise_id SERIAL PK; name VARCHAR(120) NOT NULL
UNIQUE; muscle_group NOT NULL; equipment; difficulty
beginner/intermediate/advanced.

**exercise_injuries** — exercise_id FK CASCADE; injury_id FK CASCADE;
PK (exercise_id, injury_id). Read by the safety trigger.

**workout_logs** — log_id SERIAL PK; user_id FK CASCADE; exercise_id FK (no
cascade); sets 1–50; reps 1–500; weight_kg 0–500; logged_on not in the future.

**progress_logs** — progress_id SERIAL PK; user_id FK CASCADE; weight_kg
20–400; body_fat_pct 1–70; UNIQUE (user_id, logged_on).

### Nutrition & Recommendations

**goals** — catalog of goals

| Column | Type | Constraints |
| --- | --- | --- |
| goal_id | SERIAL | PK |
| name | VARCHAR(60) | NOT NULL, UNIQUE |
| description | TEXT | |

**allergens** — catalog of allergens

| Column | Type | Constraints |
| --- | --- | --- |
| allergen_id | SERIAL | PK |
| name | VARCHAR(60) | NOT NULL, UNIQUE |

**user_allergies** — which allergens a user has

| Column | Type | Constraints |
| --- | --- | --- |
| user_id | INT | PK part, FK → users ON DELETE CASCADE |
| allergen_id | INT | PK part, FK → allergens ON DELETE CASCADE |
| severity | VARCHAR(10) | NOT NULL, default `moderate`, mild/moderate/severe |
| noted_on | DATE | NOT NULL, default today, not in the future |

**ingredients** — catalog of ingredients

| Column | Type | Constraints |
| --- | --- | --- |
| ingredient_id | SERIAL | PK |
| name | VARCHAR(120) | NOT NULL, UNIQUE |
| allergen_id | INT | FK → allergens ON DELETE SET NULL; set only when the ingredient is itself an allergen |

**ingredient_parts** — an ingredient made of other ingredients

| Column | Type | Constraints |
| --- | --- | --- |
| parent_id | INT | PK part, FK → ingredients ON DELETE CASCADE |
| child_id | INT | PK part, FK → ingredients ON DELETE CASCADE |
| note | VARCHAR(120) | |
| | | CHECK parent_id <> child_id |

**foods** — catalog of foods, nutrition per serving

| Column | Type | Constraints |
| --- | --- | --- |
| food_id | SERIAL | PK |
| name | VARCHAR(120) | NOT NULL, UNIQUE |
| calories | NUMERIC(7,2) | NOT NULL, ≥ 0 |
| protein_g, carbs_g, fat_g | NUMERIC(6,2) | each ≥ 0 when given |

**food_ingredients** — what a food is made of

| Column | Type | Constraints |
| --- | --- | --- |
| food_id | INT | PK part, FK → foods ON DELETE CASCADE |
| ingredient_id | INT | PK part, FK → ingredients ON DELETE CASCADE |
| quantity_g | NUMERIC(7,2) | > 0 when given |

**meal_logs** — one row per food eaten

| Column | Type | Constraints |
| --- | --- | --- |
| meal_log_id | SERIAL | PK |
| user_id | INT | NOT NULL, FK → users ON DELETE CASCADE |
| food_id | INT | NOT NULL, FK → foods, **no** cascade (history is kept) |
| servings | NUMERIC(5,2) | NOT NULL, default 1, > 0 and ≤ 20 |
| meal_type | VARCHAR(12) | breakfast/lunch/dinner/snack |
| logged_on | DATE | NOT NULL, default today, not in the future |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

Indexes on the nutrition side: `meal_logs (user_id, logged_on)` for the meals
page and `daily_calories`; `ingredients (allergen_id)` for the allergy filter;
`food_ingredients (ingredient_id)` for walking from an ingredient to its
foods.

### Views and functions

| Object | Kind | Returns |
| --- | --- | --- |
| `daily_calories(p_user, p_day)` | SQL function | total calories × servings for one user on one day |
| `v_food_allergens` | view (recursive CTE) | food_id, food_name, allergen_id, allergen_name, depth, via |
| `v_safe_foods` | view | user_id, food_id, food_name, calories for every food with none of the user's allergens |
| `v_weekly_progress` | view | weekly training volume per user |

All views are `WITH (security_invoker = true)`, so row-level security applies
to whoever queries them.

---

## 6. Nutrition SQL

### 6.1 Function: `daily_calories`

```sql
CREATE OR REPLACE FUNCTION daily_calories(p_user INT, p_day DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(f.calories * m.servings), 0)
    FROM meal_logs m
    JOIN foods f ON f.food_id = m.food_id
    WHERE m.user_id = p_user AND m.logged_on = p_day;
$$;
```

`STABLE` tells the planner it only reads. It runs as the caller, so row-level
security still decides which meal rows it can see: one user cannot read
another's total by passing their id. `COALESCE` turns "no meals today" into 0
rather than NULL. The meals page shows its result as "Calories today".

### 6.2 Recursive CTE: every allergen in a food

```sql
WITH RECURSIVE parts (ingredient_id, depth, path) AS (
    SELECT fi.ingredient_id, 1, i.name::text
      FROM food_ingredients fi
      JOIN ingredients i ON i.ingredient_id = fi.ingredient_id
     WHERE fi.food_id = 1
    UNION ALL
    SELECT ip.child_id, p.depth + 1, p.path || ' -> ' || c.name
      FROM parts p
      JOIN ingredient_parts ip ON ip.parent_id = p.ingredient_id
      JOIN ingredients c       ON c.ingredient_id = ip.child_id
     WHERE p.depth < 10
)
SELECT a.name AS allergen, p.depth, p.path
  FROM parts p
  JOIN ingredients i ON i.ingredient_id = p.ingredient_id
  JOIN allergens a   ON a.allergen_id   = i.allergen_id
 ORDER BY a.name, p.depth;
```

The anchor takes the food's direct ingredients; the recursive step adds
whatever each of those is made of, until nothing new is found. For Chicken
Satay Skewers:

| allergen | depth | path |
| --- | --- | --- |
| Gluten | 3 | Satay Sauce -> Soy Sauce -> Wheat |
| Peanut | 3 | Satay Sauce -> Peanut Butter -> Peanut |
| Soy | 3 | Satay Sauce -> Soy Sauce -> Soybean |

None of the three allergens is a direct ingredient of the dish. The `depth <
10` guard stops a cycle in bad data (A contains B contains A) from recursing
for ever; the CHECK on `ingredient_parts` only blocks the one-step case.

`v_food_allergens` is the same walk for every food at once, and `v_safe_foods`
pairs each user with the foods that have none of their allergens.

### 6.3 Nested subquery: foods nobody has logged

```sql
SELECT f.food_id, f.name, f.calories
  FROM foods f
 WHERE f.food_id NOT IN (SELECT m.food_id FROM meal_logs m)
 ORDER BY f.name;
```

The inner query runs once, independent of the outer row. `NOT IN` is safe
because `meal_logs.food_id` is NOT NULL; a single NULL in the inner result
would otherwise make the whole condition unknown and return nothing. With the
seed data it returns 8 foods, including all three peanut dishes the seeded
peanut-allergic user could never log.

### 6.4 JOIN with aggregates: average daily calories per goal

```sql
SELECT g.goal_id, g.name AS goal,
       COUNT(DISTINCT d.user_id)     AS users_logging,
       COUNT(d.day)                  AS user_days,
       ROUND(AVG(d.day_calories), 0) AS avg_daily_calories,
       ROUND(MIN(d.day_calories), 0) AS lowest_day,
       ROUND(MAX(d.day_calories), 0) AS highest_day
FROM goals g
LEFT JOIN users u ON u.goal_id = g.goal_id
LEFT JOIN (
    SELECT m.user_id, m.logged_on AS day, SUM(f.calories * m.servings) AS day_calories
      FROM meal_logs m
      JOIN foods f ON f.food_id = m.food_id
     GROUP BY m.user_id, m.logged_on
) d ON d.user_id = u.user_id
GROUP BY g.goal_id, g.name
ORDER BY avg_daily_calories DESC NULLS LAST;
```

Two levels of aggregation: the derived table totals each user's calories per
day, and the outer query averages those days per goal. Averaging the raw meal
rows instead would weight a goal by how many snacks its users log, not by what
they eat in a day. The `LEFT JOIN`s keep a goal nobody has chosen in the
result, with zero users.

---

## 7. Test results

`scripts/verify-nutrition.mjs` runs the checks below against a running dev
server and prints the evidence for each. It only reads, apart from one meal it
expects to be refused, so it can be re-run against the shared database.

> Fill in the PASS/FAIL column and paste the script's output after running it
> against Neon and AuraDB. The PostgreSQL-only checks and the 503 checks were
> also run against a local copy of the schema and seed data while building.

| # | Test | How | Expected |
| --- | --- | --- | --- |
| 1 | A peanut-allergic user never sees peanut dishes | Meera's `GET /api/foods/safe` compared with `v_food_allergens` | 21 foods listed, none with peanut at any depth |
| 2 | A hidden allergen is caught | Chicken Satay Skewers in Meera's hidden list; `POST /api/meals` with it | listed as hidden because of Peanut; logging it returns 403 and no row is written |
| 3 | Recommendations skip unsafe items | Meera's `GET /api/recommendations` compared with her injuries and allergies | no exercise strains her lower back, no food contains peanut |
| 4 | Neo4j unavailable returns 503 | restart with a wrong `NEO4J_PASSWORD`, run with `--expect-503` | both endpoints 503 with no list; meals and recommendations pages show "unavailable" |
| 5 | Write-through when Neo4j is down | add an allergy, change goal, log a meal with Neo4j unreachable | allergy and goal saved in PostgreSQL, 503 "saved, but…"; meal saved (201) |
| 6 | Admin-only food catalog | `GET /api/admin/foods` as a normal user; `/admin/foods` as a normal user | 403; redirect to `/dashboard?denied=admin` |
| 7 | Catalog integrity | add a duplicate name; negative calories; delete a food someone logged | 409; 400; 409 "people have logged it" |
