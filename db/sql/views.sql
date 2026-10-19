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
