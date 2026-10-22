-- Eirene — stored procedures and functions

-- ============================================================
-- log_workout — record one exercise and update the user's streak
-- ============================================================
--
-- Called by POST /api/workouts inside BEGIN/COMMIT. The INSERT fires
-- trg_block_unsafe_workout, so an exercise that strains the user's injury
-- raises an exception and the whole call rolls back: no log row, and
-- last_workout_on unchanged.

DROP PROCEDURE IF EXISTS log_workout(INT, INT, INT, INT, NUMERIC, DATE);

CREATE PROCEDURE log_workout(
    p_user_id     INT,
    p_exercise_id INT,
    p_sets        INT,
    p_reps        INT,
    p_weight_kg   NUMERIC DEFAULT 0,
    p_logged_on   DATE    DEFAULT CURRENT_DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO workout_logs (user_id, exercise_id, sets, reps, weight_kg, logged_on)
    VALUES (p_user_id, p_exercise_id, p_sets, p_reps, p_weight_kg, p_logged_on);

    -- Only move the streak forward. Logging a workout you forgot to record
    -- last week should not rewrite a more recent date.
    UPDATE users
       SET last_workout_on = p_logged_on
     WHERE user_id = p_user_id
       AND (last_workout_on IS NULL OR last_workout_on < p_logged_on);
END;
$$;
-- ============================================================
-- daily_calories — total calories a user ate on a given day
-- ============================================================
--
-- Sums calories x servings from meal_logs. It runs as the caller, so
-- row-level security still decides which meal_logs rows it can see.

CREATE OR REPLACE FUNCTION daily_calories(p_user INT, p_day DATE)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(f.calories * m.servings), 0)
    FROM meal_logs m
    JOIN foods f ON f.food_id = m.food_id
    WHERE m.user_id = p_user
      AND m.logged_on = p_day;
$$;