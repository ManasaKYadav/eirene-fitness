-- Eirene — database roles and row-level security
--
-- Two layers guard the data, and this file is the second one. The first is
-- proxy.ts, which decides who may open which page. This decides what the
-- database will return once a query is actually run.
--
-- How the two roles are used: the application connects as the Neon owner,
-- then every user request runs inside a transaction that does
--
--     SET LOCAL ROLE eirene_user;              -- or eirene_admin
--     SELECT set_config('app.user_id', '42', true);
--
-- (that is withUser() in lib/db.ts). SET LOCAL lasts until COMMIT, so the
-- connection returns to the owner when the transaction ends, and the pooled
-- connection carries nothing into the next request.

-- ============================================================
-- Roles
-- ============================================================

-- NOLOGIN: these are switched into with SET ROLE, never connected as, so
-- they need no password and cannot be used to log in directly.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eirene_user') THEN
        CREATE ROLE eirene_user NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eirene_admin') THEN
        CREATE ROLE eirene_admin NOLOGIN;
    END IF;
END
$$;

-- SET ROLE only works if the connecting role is a member of the target role.
-- Granting both to whoever runs this file lets the application, which
-- connects as the owner, switch into them per request.
DO $$
BEGIN
    EXECUTE format('GRANT eirene_user, eirene_admin TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO eirene_user, eirene_admin;

-- Start from nothing and grant back deliberately, so a table added later is
-- unreachable until someone decides what it should allow.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM eirene_user, eirene_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM eirene_user, eirene_admin;

-- ============================================================
-- Catalog: everyone reads, only admins change
-- ============================================================

GRANT SELECT ON
    injuries, exercises, exercise_injuries,
    goals, allergens, ingredients, ingredient_parts,
    foods, food_ingredients
TO eirene_user, eirene_admin;

GRANT INSERT, UPDATE, DELETE ON
    injuries, exercises, exercise_injuries,
    goals, allergens, ingredients, ingredient_parts,
    foods, food_ingredients
TO eirene_admin;

-- ============================================================
-- User-owned data: both roles may write, RLS decides whose rows
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
    workout_logs, progress_logs, user_injuries,
    meal_logs, user_allergies
TO eirene_user, eirene_admin;

GRANT SELECT, UPDATE ON users TO eirene_user, eirene_admin;

-- SERIAL columns draw from a sequence, so inserting needs USAGE on it.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eirene_user, eirene_admin;

-- Views need their own grant. They are defined WITH (security_invoker = true)
-- so they execute as the caller: a view owned by the Neon role would
-- otherwise run with the owner's privileges, and the owner is exempt from
-- the policies below, which would hand every user everyone else's rows.
DO $$
DECLARE v text;
BEGIN
    FOR v IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
    LOOP
        EXECUTE format('GRANT SELECT ON %I TO eirene_user, eirene_admin', v);
    END LOOP;
END
$$;

-- ============================================================
-- Row-level security
-- ============================================================
--
-- NULLIF(current_setting('app.user_id', true), '')::int
--
-- Two things have to be handled, and both end as NULL so the comparison is
-- not true and the statement sees no rows:
--
--   * the setting was never set on this connection — the second argument to
--     current_setting returns NULL rather than raising;
--   * the setting was set earlier on this pooled connection and has since
--     been reset at COMMIT. PostgreSQL remembers the name and resets the
--     value to an empty string, not to NULL, and ''::int raises 22P02. NULLIF
--     turns that empty string back into NULL.
--
-- The second case only appears on a reused connection, so it is easy to miss
-- when testing against a fresh one.

ALTER TABLE workout_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_injuries ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_workout_logs_own   ON workout_logs;
DROP POLICY IF EXISTS p_progress_logs_own  ON progress_logs;
DROP POLICY IF EXISTS p_user_injuries_own  ON user_injuries;
DROP POLICY IF EXISTS p_meal_logs_own      ON meal_logs;
DROP POLICY IF EXISTS p_user_allergies_own ON user_allergies;
DROP POLICY IF EXISTS p_users_own          ON users;

-- USING filters the rows a statement can see or change; WITH CHECK filters
-- the rows it may write. Both are needed: without WITH CHECK a user could
-- insert a row carrying someone else's user_id, and then no longer see it.
CREATE POLICY p_workout_logs_own ON workout_logs
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

CREATE POLICY p_progress_logs_own ON progress_logs
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

CREATE POLICY p_user_injuries_own ON user_injuries
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

CREATE POLICY p_meal_logs_own ON meal_logs
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

CREATE POLICY p_user_allergies_own ON user_allergies
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

-- A signed-in user sees and edits only their own account row.
CREATE POLICY p_users_own ON users
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

-- ============================================================
-- Administrators may read everyone's rows
-- ============================================================
--
-- The policies above are keyed on app.user_id and apply to eirene_admin too,
-- so without these an admin reporting on all users would see only their own
-- data. Policies are permissive and OR'd together, so a second policy
-- granted only TO eirene_admin widens what that role can read while leaving
-- eirene_user exactly as restricted as before.
--
-- Deliberately SELECT only. Admins report on user data; they do not edit
-- someone else's workout log or weigh-in. Catalog editing is granted
-- separately above.

DROP POLICY IF EXISTS p_workout_logs_admin_read   ON workout_logs;
DROP POLICY IF EXISTS p_progress_logs_admin_read  ON progress_logs;
DROP POLICY IF EXISTS p_user_injuries_admin_read  ON user_injuries;
DROP POLICY IF EXISTS p_meal_logs_admin_read      ON meal_logs;
DROP POLICY IF EXISTS p_user_allergies_admin_read ON user_allergies;
DROP POLICY IF EXISTS p_users_admin_read          ON users;

CREATE POLICY p_workout_logs_admin_read   ON workout_logs   FOR SELECT TO eirene_admin USING (true);
CREATE POLICY p_progress_logs_admin_read  ON progress_logs  FOR SELECT TO eirene_admin USING (true);
CREATE POLICY p_user_injuries_admin_read  ON user_injuries  FOR SELECT TO eirene_admin USING (true);
CREATE POLICY p_meal_logs_admin_read      ON meal_logs      FOR SELECT TO eirene_admin USING (true);
CREATE POLICY p_user_allergies_admin_read ON user_allergies FOR SELECT TO eirene_admin USING (true);
CREATE POLICY p_users_admin_read          ON users          FOR SELECT TO eirene_admin USING (true);

-- ============================================================
-- Why the policies are not FORCEd
-- ============================================================
--
-- PostgreSQL exempts a table's owner from its policies unless the table is
-- also given FORCE ROW LEVEL SECURITY. The owner here is the Neon role that
-- the application connects as, which is deliberate:
--
--   * registration and login must read and write users before any user id is
--     known, so they cannot run under a policy keyed on app.user_id;
--   * schema.sql and seed.sql insert rows for every user at once.
--
-- Everything that acts on behalf of a signed-in user goes through withUser(),
-- which switches to eirene_user or eirene_admin first. Those roles are not
-- the owner, so the policies apply to them in full.
--
-- The consequence worth stating plainly: a query that skips withUser() runs
-- as the owner and is not filtered. The routes are written so the only
-- queries outside it are the ones listed above.
