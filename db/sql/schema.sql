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

DROP TABLE IF EXISTS progress_logs CASCADE;
DROP TABLE IF EXISTS workout_logs CASCADE;
DROP TABLE IF EXISTS exercise_injuries CASCADE;
DROP TABLE IF EXISTS user_injuries CASCADE;
DROP TABLE IF EXISTS exercises CASCADE;
DROP TABLE IF EXISTS injuries CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- DROP (Person B)
-- ============================================================

-- ============================================================
-- TABLES (Person A)
-- ============================================================

-- Accounts. role drives both the middleware check in the app and the
-- SET LOCAL ROLE switch in security.sql.
CREATE TABLE users (
    user_id         SERIAL       PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(120) NOT NULL,
    role            VARCHAR(10)  NOT NULL DEFAULT 'user',
    goal_id         INT,
    last_workout_on DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_users_role  CHECK (role IN ('admin', 'user')),
    CONSTRAINT chk_users_email CHECK (POSITION('@' IN email) > 1),
    CONSTRAINT chk_users_name  CHECK (length(trim(full_name)) > 0)
);

-- Catalog of injuries an exercise might aggravate. Admin-maintained.
CREATE TABLE injuries (
    injury_id   SERIAL      PRIMARY KEY,
    name        VARCHAR(80) NOT NULL UNIQUE,
    body_part   VARCHAR(60) NOT NULL,
    description TEXT
);

-- Which injuries a user currently has. Composite PK stops the same injury
-- being recorded twice for one user.
CREATE TABLE user_injuries (
    user_id   INT         NOT NULL REFERENCES users(user_id)      ON DELETE CASCADE,
    injury_id INT         NOT NULL REFERENCES injuries(injury_id) ON DELETE CASCADE,
    severity  VARCHAR(10) NOT NULL DEFAULT 'moderate',
    noted_on  DATE        NOT NULL DEFAULT CURRENT_DATE,

    PRIMARY KEY (user_id, injury_id),
    CONSTRAINT chk_user_injuries_severity
        CHECK (severity IN ('mild', 'moderate', 'severe')),
    CONSTRAINT chk_user_injuries_noted_on CHECK (noted_on <= CURRENT_DATE)
);

-- Catalog of exercises. Admin-maintained.
CREATE TABLE exercises (
    exercise_id  SERIAL       PRIMARY KEY,
    name         VARCHAR(120) NOT NULL UNIQUE,
    muscle_group VARCHAR(60)  NOT NULL,
    equipment    VARCHAR(60),
    difficulty   VARCHAR(12)  NOT NULL DEFAULT 'beginner',

    CONSTRAINT chk_exercises_difficulty
        CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))
);

-- Which exercise strains which injury. This is the table the safety trigger
-- reads, and the source of the STRAINS edge in Neo4j.
CREATE TABLE exercise_injuries (
    exercise_id INT NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
    injury_id   INT NOT NULL REFERENCES injuries(injury_id)    ON DELETE CASCADE,

    PRIMARY KEY (exercise_id, injury_id)
);

-- One row per exercise performed. Written through the log_workout procedure,
-- which the safety trigger guards.
CREATE TABLE workout_logs (
    log_id      SERIAL       PRIMARY KEY,
    user_id     INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    exercise_id INT          NOT NULL REFERENCES exercises(exercise_id),
    sets        INT          NOT NULL,
    reps        INT          NOT NULL,
    weight_kg   NUMERIC(6,2) NOT NULL DEFAULT 0,
    logged_on   DATE         NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_workout_logs_sets   CHECK (sets BETWEEN 1 AND 50),
    CONSTRAINT chk_workout_logs_reps   CHECK (reps BETWEEN 1 AND 500),
    CONSTRAINT chk_workout_logs_weight CHECK (weight_kg BETWEEN 0 AND 500),
    CONSTRAINT chk_workout_logs_date   CHECK (logged_on <= CURRENT_DATE)
);

-- Body measurements over time. One weigh-in per user per day, so the
-- dashboard's trend line has a single value per point.
CREATE TABLE progress_logs (
    progress_id  SERIAL       PRIMARY KEY,
    user_id      INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    logged_on    DATE         NOT NULL DEFAULT CURRENT_DATE,
    weight_kg    NUMERIC(5,2) NOT NULL,
    body_fat_pct NUMERIC(4,1),
    notes        TEXT,

    CONSTRAINT uq_progress_logs_per_day UNIQUE (user_id, logged_on),
    CONSTRAINT chk_progress_logs_weight  CHECK (weight_kg BETWEEN 20 AND 400),
    CONSTRAINT chk_progress_logs_bodyfat CHECK (body_fat_pct BETWEEN 1 AND 70),
    CONSTRAINT chk_progress_logs_date    CHECK (logged_on <= CURRENT_DATE)
);

-- ============================================================
-- TABLES (Person B)
-- ============================================================

-- ============================================================
-- ALTER / INDEXES  (runs after both sections, so neither person's
-- tables have to be created before the other's)
-- ============================================================

-- Height is captured after signup rather than at registration, so it is added
-- here as a nullable column with its own CHECK.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS height_cm INT;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS chk_users_height;
ALTER TABLE users
    ADD CONSTRAINT chk_users_height CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 260);

-- users.goal_id -> goals.goal_id is added here rather than inline, because
-- users is Person A's table and goals is Person B's. Person B: uncomment
-- once the goals table exists.
-- ALTER TABLE users
--   ADD CONSTRAINT fk_users_goal
--   FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE SET NULL;

-- The dashboard and the weekly progress view both filter a single user over a
-- date range, so both logging tables are indexed on that pair.
CREATE INDEX idx_workout_logs_user_date  ON workout_logs  (user_id, logged_on);
CREATE INDEX idx_progress_logs_user_date ON progress_logs (user_id, logged_on);

-- The safety trigger looks up a user's injuries on every workout insert.
CREATE INDEX idx_user_injuries_user ON user_injuries (user_id);

-- Login looks a user up by email on every attempt; the UNIQUE constraint
-- above already provides the index for it.
