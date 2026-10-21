-- Eirene — the queries shown in the report and viva
--
-- Each one is a different kind of query, and each answers a question the app
-- actually asks rather than being written to demonstrate a keyword.

-- ============================================================
-- 1. Correlated subquery
--    Who is losing weight?
-- ============================================================
--
-- Compares each user's most recent weigh-in against their first. The two
-- subqueries are correlated: both reference p.user_id from the outer query,
-- so they are evaluated per user rather than once for the whole table.
--
-- ORDER BY logged_on with LIMIT 1 rather than MIN/MAX of the weight: the
-- question is which weight was recorded first and last in time, not which was
-- the smallest and largest.

SELECT
    u.user_id,
    u.full_name,
    (SELECT p.weight_kg FROM progress_logs p
      WHERE p.user_id = u.user_id
      ORDER BY p.logged_on ASC  LIMIT 1) AS first_weight_kg,
    (SELECT p.weight_kg FROM progress_logs p
      WHERE p.user_id = u.user_id
      ORDER BY p.logged_on DESC LIMIT 1) AS latest_weight_kg,
    (SELECT p.weight_kg FROM progress_logs p
      WHERE p.user_id = u.user_id
      ORDER BY p.logged_on DESC LIMIT 1)
  - (SELECT p.weight_kg FROM progress_logs p
      WHERE p.user_id = u.user_id
      ORDER BY p.logged_on ASC  LIMIT 1) AS change_kg
FROM users u
WHERE (SELECT p.weight_kg FROM progress_logs p
        WHERE p.user_id = u.user_id
        ORDER BY p.logged_on DESC LIMIT 1)
    < (SELECT p.weight_kg FROM progress_logs p
        WHERE p.user_id = u.user_id
        ORDER BY p.logged_on ASC  LIMIT 1)
ORDER BY change_kg ASC;

-- ============================================================
-- 2. GROUP BY with HAVING and ORDER BY
--    Who has trained at least three times this week?
-- ============================================================
--
-- WHERE filters rows before grouping (this week's logs only); HAVING filters
-- the groups afterwards (users with three or more). The distinction is the
-- point of the query: a count cannot be tested in WHERE, because the groups
-- do not exist yet at that stage.
--
-- date_trunc('week', CURRENT_DATE) is the Monday of the current week, which
-- matches how v_weekly_progress buckets its weeks.

SELECT
    u.user_id,
    u.full_name,
    COUNT(*)                                   AS workouts_this_week,
    COUNT(DISTINCT w.exercise_id)              AS different_exercises,
    SUM(w.sets * w.reps)                       AS total_reps,
    SUM(w.sets * w.reps * w.weight_kg)         AS total_volume_kg,
    MAX(w.logged_on)                           AS last_workout
FROM workout_logs w
JOIN users u ON u.user_id = w.user_id
WHERE w.logged_on >= date_trunc('week', CURRENT_DATE)::date
GROUP BY u.user_id, u.full_name
HAVING COUNT(*) >= 3
ORDER BY workouts_this_week DESC, total_volume_kg DESC;

-- ============================================================
-- 3. Recursive CTE
--    Every allergen reachable from a food through nested ingredients
-- ============================================================
--
-- Written for the nutrition half of the schema. Walks ingredient_parts from a
-- food's direct ingredients down through every level, so an allergen hidden
-- two or three layers deep (satay sauce -> peanut butter -> peanut) is still
-- found.

-- ============================================================
-- 4. Nested subquery
--    Foods nobody has logged
-- ============================================================

-- ============================================================
-- 5. JOIN with aggregates
--    Average daily calories per goal
-- ============================================================
