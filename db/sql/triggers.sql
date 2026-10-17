-- Eirene — triggers
--
-- The safety rule lives here rather than only in the API, so an unsafe
-- workout cannot be stored even if someone inserts directly with psql.

-- ============================================================
-- Reject a workout that strains an injury the user has
-- ============================================================

DROP TRIGGER IF EXISTS trg_block_unsafe_workout ON workout_logs;
DROP FUNCTION IF EXISTS block_unsafe_workout();

CREATE FUNCTION block_unsafe_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_exercise TEXT;
    v_injuries TEXT;
BEGIN
    -- Every injury this user has that the exercise is recorded as straining.
    -- Collected into one string so the error names them all rather than
    -- whichever row happened to be found first.
    SELECT string_agg(i.name, ', ' ORDER BY i.name)
      INTO v_injuries
      FROM user_injuries ui
      JOIN exercise_injuries ei ON ei.injury_id = ui.injury_id
      JOIN injuries i           ON i.injury_id  = ui.injury_id
     WHERE ui.user_id     = NEW.user_id
       AND ei.exercise_id = NEW.exercise_id;

    IF v_injuries IS NOT NULL THEN
        SELECT name INTO v_exercise FROM exercises WHERE exercise_id = NEW.exercise_id;

        RAISE EXCEPTION
            'Unsafe workout: % strains your recorded injury (%)', v_exercise, v_injuries
            USING ERRCODE = 'check_violation',
                  HINT    = 'Remove the injury from your profile or choose a different exercise.';
    END IF;

    RETURN NEW;
END;
$$;

-- BEFORE INSERT so the row is never written. An AFTER trigger would insert
-- first and rely on the rollback, which leaves gaps in the serial sequence.
CREATE TRIGGER trg_block_unsafe_workout
    BEFORE INSERT ON workout_logs
    FOR EACH ROW
    EXECUTE FUNCTION block_unsafe_workout();
