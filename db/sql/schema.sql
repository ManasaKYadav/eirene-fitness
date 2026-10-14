-- Eirene — schema (DDL)
-- Run order: schema.sql -> seed.sql -> triggers.sql -> procedures.sql -> views.sql -> security.sql
--
-- Person A owns: users, injuries, user_injuries, exercises, exercise_injuries,
--                workout_logs, progress_logs
-- Person B owns: goals, allergens, user_allergies, ingredients, ingredient_parts,
--                foods, food_ingredients, meal_logs
--
-- Drops go first (reverse dependency order) so this file can be re-run.

-- ============================================================
-- DROP (Person A)
-- ============================================================

-- ============================================================
-- DROP (Person B)
-- ============================================================

-- ============================================================
-- TABLES (Person A)
-- ============================================================

-- ============================================================
-- TABLES (Person B)
-- ============================================================

-- ============================================================
-- ALTER / INDEXES  (runs after both sections, so neither person's
-- tables have to be created before the other's)
-- ============================================================

-- users.goal_id -> goals.goal_id is added here rather than inline, because
-- users is Person A's table and goals is Person B's.
-- ALTER TABLE users
--   ADD CONSTRAINT fk_users_goal
--   FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE SET NULL;
