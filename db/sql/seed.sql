-- Eirene — seed data
-- Run after schema.sql. Safe to re-run: it empties every table first.
--
-- Logins: every seeded account uses the password  password123
--   admin@eirene.test            (role admin)
--   aarav@eirene.test, meera@eirene.test, rohan@eirene.test, ananya@eirene.test,
--   kabir@eirene.test, isha@eirene.test, vikram@eirene.test, sana@eirene.test
--
-- Every workout log below avoids exercises that strain that user's injuries, and
-- every meal log avoids foods containing that user's allergens (directly or
-- through nested ingredients), so the data is valid under the safety trigger.

BEGIN;

TRUNCATE TABLE
    meal_logs, food_ingredients, ingredient_parts, user_allergies, foods,
    ingredients, allergens, progress_logs, workout_logs, exercise_injuries,
    user_injuries, exercises, injuries, users, goals
RESTART IDENTITY CASCADE;

-- ============================================================
-- Goals
-- ============================================================

INSERT INTO goals (goal_id, name, description) VALUES
    (1, 'Fat Loss',        'Lose body fat while keeping muscle'),
    (2, 'Muscle Gain',     'Build strength and muscle mass'),
    (3, 'Endurance',       'Improve stamina and cardio fitness'),
    (4, 'General Fitness', 'Stay active and healthy overall');

-- ============================================================
-- Users: 1 admin + 8 users (password for all: password123)
-- ============================================================

WITH pw AS (
    SELECT '$2b$10$NBC0Uw1r9PT8bzDpcwbH5exFrFCY6GaM0T41SPG2E6qsG9nG15.xe' AS h
)
INSERT INTO users (user_id, email, password_hash, full_name, role, goal_id, height_cm)
SELECT v.id, v.email, pw.h, v.full_name, v.role, v.goal_id, v.height_cm
FROM pw, (VALUES
    (1, 'admin@eirene.test',  'Eirene Admin',  'admin', NULL, NULL),
    (2, 'aarav@eirene.test',  'Aarav Sharma',  'user',  1,    178),
    (3, 'meera@eirene.test',  'Meera Iyer',    'user',  1,    163),
    (4, 'rohan@eirene.test',  'Rohan Mehta',   'user',  1,    182),
    (5, 'ananya@eirene.test', 'Ananya Rao',    'user',  2,    160),
    (6, 'kabir@eirene.test',  'Kabir Singh',   'user',  2,    175),
    (7, 'isha@eirene.test',   'Isha Nair',     'user',  2,    168),
    (8, 'vikram@eirene.test', 'Vikram Das',    'user',  3,    172),
    (9, 'sana@eirene.test',   'Sana Khan',     'user',  3,    165)
) AS v(id, email, full_name, role, goal_id, height_cm);

-- ============================================================
-- Injuries, exercises, and which exercise strains which injury
-- ============================================================

INSERT INTO injuries (injury_id, name, body_part, description) VALUES
    (1, 'Knee Pain',           'Knee',       'Pain or instability in the knee joint'),
    (2, 'Lower Back Strain',   'Lower back', 'Strained muscles in the lower back'),
    (3, 'Shoulder Impingement','Shoulder',   'Pinched tendons in the shoulder joint'),
    (4, 'Wrist Sprain',        'Wrist',      'Stretched or torn wrist ligaments'),
    (5, 'Ankle Sprain',        'Ankle',      'Stretched or torn ankle ligaments');

INSERT INTO exercises (exercise_id, name, muscle_group, equipment, difficulty) VALUES
    (1,  'Barbell Squat',          'Legs',       'Barbell',    'intermediate'),
    (2,  'Leg Press',              'Legs',       'Machine',    'beginner'),
    (3,  'Lunges',                 'Legs',       'Bodyweight', 'beginner'),
    (4,  'Deadlift',               'Back',       'Barbell',    'advanced'),
    (5,  'Bench Press',            'Chest',      'Barbell',    'intermediate'),
    (6,  'Overhead Press',         'Shoulders',  'Barbell',    'intermediate'),
    (7,  'Push-ups',               'Chest',      'Bodyweight', 'beginner'),
    (8,  'Pull-ups',               'Back',       'Bodyweight', 'intermediate'),
    (9,  'Bent-over Row',          'Back',       'Barbell',    'intermediate'),
    (10, 'Bicep Curl',             'Arms',       'Dumbbell',   'beginner'),
    (11, 'Tricep Dips',            'Arms',       'Bodyweight', 'intermediate'),
    (12, 'Plank',                  'Core',       'Bodyweight', 'beginner'),
    (13, 'Crunches',               'Core',       'Bodyweight', 'beginner'),
    (14, 'Running',                'Cardio',     NULL,         'beginner'),
    (15, 'Jump Rope',              'Cardio',     'Rope',       'beginner'),
    (16, 'Cycling',                'Cardio',     'Bike',       'beginner'),
    (17, 'Swimming',               'Cardio',     NULL,         'intermediate'),
    (18, 'Rowing Machine',         'Cardio',     'Machine',    'beginner'),
    (19, 'Glute Bridge',           'Glutes',     'Bodyweight', 'beginner'),
    (20, 'Calf Raises',            'Legs',       'Bodyweight', 'beginner'),
    (21, 'Lat Pulldown',           'Back',       'Machine',    'beginner'),
    (22, 'Seated Cable Row',       'Back',       'Machine',    'beginner'),
    (23, 'Dumbbell Lateral Raise', 'Shoulders',  'Dumbbell',   'beginner'),
    (24, 'Burpees',                'Full body',  'Bodyweight', 'advanced'),
    (25, 'Walking',                'Cardio',     NULL,         'beginner');

INSERT INTO exercise_injuries (exercise_id, injury_id) VALUES
    (1, 1), (1, 2),     -- Barbell Squat: knee, lower back
    (2, 1),             -- Leg Press: knee
    (3, 1),             -- Lunges: knee
    (4, 2),             -- Deadlift: lower back
    (5, 3),             -- Bench Press: shoulder
    (6, 3),             -- Overhead Press: shoulder
    (7, 3), (7, 4),     -- Push-ups: shoulder, wrist
    (8, 3),             -- Pull-ups: shoulder
    (9, 2),             -- Bent-over Row: lower back
    (10, 4),            -- Bicep Curl: wrist
    (11, 3), (11, 4),   -- Tricep Dips: shoulder, wrist
    (14, 1), (14, 5),   -- Running: knee, ankle
    (15, 1), (15, 5),   -- Jump Rope: knee, ankle
    (18, 2),            -- Rowing Machine: lower back
    (20, 5),            -- Calf Raises: ankle
    (23, 3),            -- Lateral Raise: shoulder
    (24, 1), (24, 4);   -- Burpees: knee, wrist

INSERT INTO user_injuries (user_id, injury_id, severity, noted_on)
SELECT v.user_id, v.injury_id, v.severity, CURRENT_DATE - v.days_ago
FROM (VALUES
    (2, 1, 'moderate', 30),   -- Aarav: knee pain
    (3, 2, 'mild',     45),   -- Meera: lower back strain
    (5, 3, 'severe',   60),   -- Ananya: shoulder impingement
    (6, 4, 'moderate', 20),   -- Kabir: wrist sprain
    (8, 5, 'mild',     15)    -- Vikram: ankle sprain
) AS v(user_id, injury_id, severity, days_ago);

-- ============================================================
-- Allergens, ingredients (some nested), foods
-- ============================================================

INSERT INTO allergens (allergen_id, name) VALUES
    (1, 'Peanut'),
    (2, 'Dairy'),
    (3, 'Gluten'),
    (4, 'Egg'),
    (5, 'Soy'),
    (6, 'Shellfish');

-- allergen_id is set only on ingredients that are themselves an allergen.
-- Allergens inside made-up ingredients come from ingredient_parts below.
INSERT INTO ingredients (ingredient_id, name, allergen_id) VALUES
    (1,  'Peanut',            1),
    (2,  'Peanut Butter',     NULL),
    (3,  'Satay Sauce',       NULL),
    (4,  'Soy Sauce',         NULL),
    (5,  'Soybean',           5),
    (6,  'Wheat',             3),
    (7,  'Wheat Flour',       NULL),
    (8,  'Milk',              2),
    (9,  'Butter',            NULL),
    (10, 'Cheese',            NULL),
    (11, 'Egg',               4),
    (12, 'Mayonnaise',        NULL),
    (13, 'Shrimp',            6),
    (14, 'Chicken Breast',    NULL),
    (15, 'Rice',              NULL),
    (16, 'Oats',              NULL),
    (17, 'Banana',            NULL),
    (18, 'Spinach',           NULL),
    (19, 'Olive Oil',         NULL),
    (20, 'Tomato',            NULL),
    (21, 'Broccoli',          NULL),
    (22, 'Lentils',           NULL),
    (23, 'Greek Yogurt',      NULL),
    (24, 'Tofu',              NULL),
    (25, 'Salmon',            NULL),
    (26, 'Coconut Milk',      NULL),
    (27, 'Whole Wheat Bread', NULL),
    (28, 'Pasta',             NULL),
    (29, 'Vegetable Oil',     NULL),
    (30, 'Quinoa',            NULL);

-- parent is made of child. Satay Sauce -> Peanut Butter -> Peanut is three
-- levels deep, so the peanut is hidden two steps below the sauce.
INSERT INTO ingredient_parts (parent_id, child_id, note) VALUES
    (2,  1,  'ground peanuts'),
    (3,  2,  'peanut base'),
    (3,  4,  'seasoning'),
    (3,  26, 'creamy base'),
    (4,  5,  'fermented soybeans'),
    (4,  6,  'brewed with wheat'),
    (7,  6,  'milled wheat'),
    (9,  8,  'churned milk'),
    (10, 8,  'curdled milk'),
    (12, 11, 'egg yolk emulsion'),
    (12, 29, 'oil base'),
    (23, 8,  'cultured milk'),
    (24, 5,  'pressed soybeans'),
    (27, 7,  'baked flour'),
    (28, 7,  'dough');

INSERT INTO foods (food_id, name, calories, protein_g, carbs_g, fat_g) VALUES
    (1,  'Chicken Satay Skewers',          320, 28,  8, 20),
    (2,  'Peanut Butter Toast',            280, 10, 28, 15),
    (3,  'Grilled Chicken and Rice',       450, 40, 48,  8),
    (4,  'Oatmeal with Banana',            300,  8, 56,  5),
    (5,  'Greek Yogurt Bowl',              180, 17, 12,  5),
    (6,  'Scrambled Eggs on Toast',        340, 20, 26, 17),
    (7,  'Veggie Omelette',                240, 18,  6, 16),
    (8,  'Grilled Salmon and Quinoa',      520, 42, 36, 22),
    (9,  'Lentil Soup',                    230, 16, 38,  2),
    (10, 'Tofu Stir Fry',                  310, 22, 24, 14),
    (11, 'Pasta Marinara',                 410, 14, 78,  6),
    (12, 'Cheese Sandwich',                380, 16, 34, 20),
    (13, 'Shrimp Fried Rice',              430, 24, 56, 12),
    (14, 'Chicken Mayo Wrap',              390, 30, 32, 16),
    (15, 'Spinach Salad',                  120,  4, 10,  8),
    (16, 'Banana Smoothie',                210,  6, 40,  3),
    (17, 'Quinoa Veggie Bowl',             350, 12, 52, 10),
    (18, 'Peanut Noodles',                 480, 16, 62, 20),
    (19, 'Baked Salmon and Broccoli',      380, 36,  8, 22),
    (20, 'Rice and Lentils',               360, 14, 66,  3),
    (21, 'Egg Fried Rice',                 400, 14, 58, 12),
    (22, 'Cheese Omelette',                290, 20,  3, 22),
    (23, 'Tomato Pasta with Spinach',      395, 14, 74,  6),
    (24, 'Coconut Chicken Curry',          460, 34, 18, 28),
    (25, 'Overnight Oats with Peanut Butter', 390, 14, 46, 17);

INSERT INTO food_ingredients (food_id, ingredient_id, quantity_g) VALUES
    (1, 14, 150), (1, 3, 40),
    (2, 27, 60),  (2, 2, 30),
    (3, 14, 150), (3, 15, 150), (3, 21, 80),
    (4, 16, 60),  (4, 17, 100),
    (5, 23, 170), (5, 17, 60),
    (6, 11, 100), (6, 9, 10),   (6, 27, 60),
    (7, 11, 120), (7, 18, 40),  (7, 20, 60),  (7, 19, 10),
    (8, 25, 150), (8, 30, 120), (8, 21, 80),  (8, 19, 10),
    (9, 22, 100), (9, 20, 80),  (9, 19, 10),
    (10, 24, 150), (10, 21, 100), (10, 4, 20), (10, 15, 120),
    (11, 28, 120), (11, 20, 100), (11, 19, 10),
    (12, 27, 80), (12, 10, 40), (12, 9, 10),
    (13, 13, 100), (13, 15, 150), (13, 11, 50), (13, 4, 15), (13, 29, 10),
    (14, 14, 120), (14, 27, 60), (14, 12, 25), (14, 18, 30),
    (15, 18, 80), (15, 20, 80), (15, 19, 10),
    (16, 17, 120), (16, 8, 200),
    (17, 30, 120), (17, 21, 80), (17, 18, 40), (17, 19, 10),
    (18, 28, 120), (18, 3, 50),
    (19, 25, 170), (19, 21, 120), (19, 19, 10),
    (20, 15, 150), (20, 22, 100),
    (21, 11, 100), (21, 15, 150), (21, 29, 10), (21, 4, 15),
    (22, 11, 120), (22, 10, 40), (22, 9, 10),
    (23, 28, 120), (23, 20, 100), (23, 18, 40), (23, 19, 10),
    (24, 14, 150), (24, 26, 100), (24, 20, 80), (24, 15, 120),
    (25, 16, 60), (25, 8, 150), (25, 2, 20),  (25, 17, 60);

INSERT INTO user_allergies (user_id, allergen_id, severity, noted_on)
SELECT v.user_id, v.allergen_id, v.severity, CURRENT_DATE - v.days_ago
FROM (VALUES
    (3, 1, 'severe',   90),   -- Meera: peanut
    (4, 2, 'moderate', 60),   -- Rohan: dairy
    (5, 5, 'mild',     40),   -- Ananya: soy
    (6, 3, 'moderate', 75),   -- Kabir: gluten
    (7, 6, 'severe',   120),  -- Isha: shellfish
    (9, 4, 'mild',     30)    -- Sana: egg
) AS v(user_id, allergen_id, severity, days_ago);

-- ============================================================
-- One week of workout logs (days_ago 0 = today)
-- ============================================================

INSERT INTO workout_logs (user_id, exercise_id, sets, reps, weight_kg, logged_on)
SELECT v.user_id, v.exercise_id, v.sets, v.reps, v.weight_kg, CURRENT_DATE - v.days_ago
FROM (VALUES
    -- Aarav (knee pain): no knee-straining exercises
    (2, 16, 1, 30,  0, 0), (2, 7,  3, 12,  0, 1), (2, 12, 3, 45,  0, 1),
    (2, 25, 1, 40,  0, 2), (2, 19, 3, 15,  0, 3), (2, 21, 3, 12, 35, 4),
    (2, 16, 1, 35,  0, 5),
    -- Meera (lower back strain)
    (3, 16, 1, 25,  0, 0), (3, 25, 1, 45,  0, 1), (3, 3,  3, 10,  0, 2),
    (3, 12, 3, 40,  0, 3), (3, 21, 3, 12, 30, 4), (3, 7,  3, 10,  0, 5),
    -- Rohan (no injuries)
    (4, 14, 1, 30,  0, 0), (4, 24, 3, 12,  0, 1), (4, 1,  4, 10, 50, 2),
    (4, 16, 1, 40,  0, 3), (4, 12, 3, 50,  0, 4), (4, 15, 3, 100, 0, 5),
    -- Ananya (shoulder impingement)
    (5, 1,  4, 8,  60, 0), (5, 4,  3, 6,  80, 1), (5, 2,  3, 12, 90, 2),
    (5, 10, 3, 12, 12, 3), (5, 21, 4, 10, 45, 4), (5, 22, 3, 12, 40, 5),
    (5, 9,  3, 10, 40, 6),
    -- Kabir (wrist sprain)
    (6, 1,  4, 8,  70, 0), (6, 4,  3, 5, 100, 1), (6, 5,  4, 8,  60, 2),
    (6, 9,  3, 10, 50, 3), (6, 8,  3, 6,   0, 4), (6, 21, 3, 10, 50, 5),
    (6, 3,  3, 10, 20, 6),
    -- Isha (no injuries)
    (7, 1,  4, 8,  80, 0), (7, 4,  3, 5, 110, 1), (7, 5,  4, 8,  70, 2),
    (7, 6,  3, 8,  40, 3), (7, 8,  3, 8,   0, 4), (7, 10, 3, 12, 14, 5),
    -- Vikram (ankle sprain)
    (8, 16, 1, 60,  0, 0), (8, 17, 1, 30,  0, 1), (8, 18, 1, 20,  0, 2),
    (8, 25, 1, 50,  0, 3), (8, 12, 3, 60,  0, 4), (8, 19, 3, 15,  0, 5),
    -- Sana (no injuries)
    (9, 14, 1, 40,  0, 0), (9, 16, 1, 50,  0, 1), (9, 17, 1, 30,  0, 2),
    (9, 25, 1, 45,  0, 3), (9, 18, 1, 15,  0, 5)
) AS v(user_id, exercise_id, sets, reps, weight_kg, days_ago);

UPDATE users u
SET last_workout_on = (
    SELECT max(w.logged_on) FROM workout_logs w WHERE w.user_id = u.user_id
);

-- ============================================================
-- Weigh-ins: day 6, day 3 and today for each user
-- ============================================================

INSERT INTO progress_logs (user_id, logged_on, weight_kg, body_fat_pct)
SELECT v.user_id, CURRENT_DATE - v.days_ago, v.weight_kg, v.body_fat_pct
FROM (VALUES
    (2, 6, 86.5, 24.0), (2, 3, 85.9, 23.8), (2, 0, 85.4, 23.5),
    (3, 6, 72.0, 28.0), (3, 3, 71.6, 27.8), (3, 0, 71.1, 27.5),
    (4, 6, 90.2, 25.0), (4, 3, 89.5, 24.7), (4, 0, 88.9, 24.4),
    (5, 6, 58.0, 26.0), (5, 3, 58.4, 25.9), (5, 0, 58.9, 25.8),
    (6, 6, 74.0, 18.0), (6, 3, 74.6, 17.9), (6, 0, 75.1, 17.8),
    (7, 6, 68.5, 22.0), (7, 3, 69.0, 21.9), (7, 0, 69.6, 21.8),
    (8, 6, 66.0, 16.0), (8, 3, 65.8, 15.9), (8, 0, 65.5, 15.8),
    (9, 6, 61.2, 23.0), (9, 3, 61.2, 23.0), (9, 0, 61.1, 22.9)
) AS v(user_id, days_ago, weight_kg, body_fat_pct);

-- ============================================================
-- One week of meal logs (days_ago 0 = today)
-- ============================================================

INSERT INTO meal_logs (user_id, food_id, servings, meal_type, logged_on)
SELECT v.user_id, v.food_id, v.servings, v.meal_type, CURRENT_DATE - v.days_ago
FROM (VALUES
    -- Aarav (no allergies)
    (2, 4,  1,   'breakfast', 0), (2, 3,  1,   'lunch',  0), (2, 15, 1,   'snack',  1),
    (2, 19, 1,   'dinner',    1), (2, 9,  1,   'lunch',  2), (2, 1,  1,   'dinner', 3),
    -- Meera (peanut allergy)
    (3, 4,  1,   'breakfast', 0), (3, 3,  1,   'lunch',  0), (3, 9,  1,   'lunch',  1),
    (3, 19, 1,   'dinner',    1), (3, 15, 1,   'snack',  2), (3, 20, 1.5, 'dinner', 2),
    -- Rohan (dairy allergy)
    (4, 4,  1,   'breakfast', 0), (4, 3,  1.5, 'lunch',  0), (4, 19, 1,   'dinner', 1),
    (4, 9,  1,   'lunch',     2), (4, 11, 1,   'dinner', 2), (4, 15, 1,   'snack',  3),
    -- Ananya (soy allergy)
    (5, 3,  1,   'lunch',     0), (5, 6,  1,   'breakfast', 0), (5, 8, 1, 'dinner', 0),
    (5, 5,  1,   'snack',     1), (5, 24, 1,   'dinner', 1), (5, 20, 1,   'lunch',  2),
    -- Kabir (gluten allergy)
    (6, 3,  1.5, 'lunch',     0), (6, 8,  1,   'dinner', 0), (6, 7,  1,   'breakfast', 1),
    (6, 5,  1,   'snack',     1), (6, 24, 1,   'dinner', 2), (6, 20, 1,   'lunch',  2),
    -- Isha (shellfish allergy)
    (7, 3,  1.5, 'lunch',     0), (7, 8,  1,   'dinner', 0), (7, 6,  1,   'breakfast', 1),
    (7, 14, 1,   'lunch',     1), (7, 24, 1,   'dinner', 2), (7, 5,  1,   'snack',  2),
    -- Vikram (no allergies)
    (8, 4,  1,   'breakfast', 0), (8, 11, 1,   'dinner', 0), (8, 16, 1,   'snack',  1),
    (8, 20, 1,   'lunch',     1), (8, 17, 1,   'lunch',  2), (8, 3,  1,   'lunch',  2),
    -- Sana (egg allergy)
    (9, 4,  1,   'breakfast', 0), (9, 11, 1,   'dinner', 0), (9, 16, 1,   'snack',  1),
    (9, 20, 1,   'lunch',     1), (9, 17, 1,   'lunch',  2), (9, 23, 1,   'dinner', 3)
) AS v(user_id, food_id, servings, meal_type, days_ago);

-- ============================================================
-- Move each serial counter past the ids inserted above, so new rows
-- created by the app get fresh ids instead of colliding with seeded ones.
-- ============================================================

SELECT setval(pg_get_serial_sequence('users',       'user_id'),       (SELECT max(user_id)       FROM users));
SELECT setval(pg_get_serial_sequence('goals',       'goal_id'),       (SELECT max(goal_id)       FROM goals));
SELECT setval(pg_get_serial_sequence('injuries',    'injury_id'),     (SELECT max(injury_id)     FROM injuries));
SELECT setval(pg_get_serial_sequence('exercises',   'exercise_id'),   (SELECT max(exercise_id)   FROM exercises));
SELECT setval(pg_get_serial_sequence('allergens',   'allergen_id'),   (SELECT max(allergen_id)   FROM allergens));
SELECT setval(pg_get_serial_sequence('ingredients', 'ingredient_id'), (SELECT max(ingredient_id) FROM ingredients));
SELECT setval(pg_get_serial_sequence('foods',       'food_id'),       (SELECT max(food_id)       FROM foods));

COMMIT;