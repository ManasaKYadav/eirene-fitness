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

-- ============================================================
-- Record every accepted workout in the audit table
-- ============================================================
--
-- The pair of triggers on this table shows the difference between the two
-- timings directly:
--
--   BEFORE INSERT  runs while the row is still a proposal. It can refuse the
--                  insert, and NEW.log_id is still empty because the serial
--                  has not been drawn yet.
--   AFTER INSERT   runs once the row exists. It cannot refuse anything by
--                  then, but NEW.log_id now holds the generated value, which
--                  is exactly what an audit row needs to point back to.
--
-- Writing the audit row AFTER also means it only ever records workouts that
-- actually passed the safety check: if the BEFORE trigger raises, this one
-- never runs.

DROP TRIGGER IF EXISTS trg_audit_workout ON workout_logs;
DROP FUNCTION IF EXISTS audit_workout();

CREATE FUNCTION audit_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO workout_audit (log_id, user_id, exercise_id, volume_kg, logged_on)
    VALUES (
        NEW.log_id,                               -- only available AFTER
        NEW.user_id,
        NEW.exercise_id,
        NEW.sets * NEW.reps * NEW.weight_kg,
        NEW.logged_on
    );

    -- The return value of an AFTER trigger is ignored; the row is already
    -- written. NULL is the conventional return here.
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_workout
    AFTER INSERT ON workout_logs
    FOR EACH ROW
    EXECUTE FUNCTION audit_workout();
