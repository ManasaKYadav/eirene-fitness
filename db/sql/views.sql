-- Eirene — views

-- ============================================================
-- v_weekly_progress — training volume per user per week
-- ============================================================
--
-- Volume is the standard training measure: sets x reps x weight. A week is
-- keyed by its Monday (date_trunc('week')) so the dashboard can order weeks
-- and join them to progress_logs by date range.

DROP VIEW IF EXISTS v_weekly_progress;

-- security_invoker: run the view as whoever queries it, not as its owner.
-- Without this a view is executed with the owner's privileges, and the owner
-- is exempt from row-level security — so every user would see every user's
-- weeks through the view even though the underlying table is protected.
CREATE VIEW v_weekly_progress WITH (security_invoker = true) AS
SELECT
    w.user_id,
    date_trunc('week', w.logged_on)::date      AS week_start,
    COUNT(*)                                   AS workout_count,
    COUNT(DISTINCT w.exercise_id)              AS exercises_used,
    SUM(w.sets * w.reps)                       AS total_reps,
    SUM(w.sets * w.reps * w.weight_kg)         AS total_volume_kg,
    ROUND(AVG(w.weight_kg), 2)                 AS avg_weight_kg,
    MAX(w.logged_on)                           AS last_logged_on
FROM workout_logs w
GROUP BY w.user_id, date_trunc('week', w.logged_on);

-- ============================================================
-- v_food_allergens — every allergen in every food, however deep
-- ============================================================
--
-- A recursive CTE walks from each food's direct ingredients down through
-- ingredient_parts, so Chicken Satay Skewers -> Satay Sauce -> Peanut Butter
-- -> Peanut still reports Peanut. depth is how many steps below the food the
-- allergen was found (1 = a direct ingredient); via is the ingredient that
-- carries it.
--
-- UNION rather than UNION ALL so an ingredient reached by two routes is only
-- walked once. The depth cap stops a bad cycle (A contains B contains A) from
-- recursing for ever; the CHECK on ingredient_parts only blocks the one-step
-- case.

DROP VIEW IF EXISTS v_safe_foods;
DROP VIEW IF EXISTS v_food_allergens;

CREATE VIEW v_food_allergens WITH (security_invoker = true) AS
WITH RECURSIVE parts (food_id, ingredient_id, depth) AS (
    SELECT fi.food_id, fi.ingredient_id, 1
      FROM food_ingredients fi
    UNION
    SELECT p.food_id, ip.child_id, p.depth + 1
      FROM parts p
      JOIN ingredient_parts ip ON ip.parent_id = p.ingredient_id
     WHERE p.depth < 10
)
SELECT
    f.food_id,
    f.name          AS food_name,
    a.allergen_id,
    a.name          AS allergen_name,
    MIN(p.depth)    AS depth,
    string_agg(DISTINCT i.name, ', ') AS via
FROM parts p
JOIN ingredients i ON i.ingredient_id = p.ingredient_id
JOIN allergens a   ON a.allergen_id   = i.allergen_id
JOIN foods f       ON f.food_id       = p.food_id
GROUP BY f.food_id, f.name, a.allergen_id, a.name;

-- ============================================================
-- v_safe_foods — each user paired with every food they can eat
-- ============================================================
--
-- A food is safe when none of its allergens, at any depth, is one the user
-- has recorded. security_invoker means a normal user only ever sees their own
-- row of users and their own allergies, so this view only ever returns their
-- own safe list.

CREATE VIEW v_safe_foods WITH (security_invoker = true) AS
SELECT
    u.user_id,
    f.food_id,
    f.name      AS food_name,
    f.calories
FROM users u
CROSS JOIN foods f
WHERE NOT EXISTS (
    SELECT 1
      FROM v_food_allergens fa
      JOIN user_allergies ua ON ua.allergen_id = fa.allergen_id
     WHERE fa.food_id  = f.food_id
       AND ua.user_id  = u.user_id
);
