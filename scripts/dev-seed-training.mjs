// Temporary training data so the safety trigger and the dashboard can be
// exercised before seed.sql lands. Inserts only into the training tables and
// is safe to re-run.
//
// Delete this file once seed.sql covers injuries, exercises and
// exercise_injuries.
//
// Run with: node --env-file=.env.local scripts/dev-seed-training.mjs

import { Client } from "pg";

const injuries = [
  ["Knee pain", "Knee", "Patellofemoral pain aggravated by deep knee flexion"],
  ["Lower back strain", "Lower back", "Lumbar strain aggravated by spinal loading"],
  ["Shoulder impingement", "Shoulder", "Pain on overhead movement"],
  ["Wrist sprain", "Wrist", "Pain under load-bearing wrist extension"],
  ["Ankle sprain", "Ankle", "Lateral ligament pain on impact"],
];

// [name, muscle group, equipment, difficulty, injuries it strains]
const exercises = [
  ["Back squat", "Legs", "Barbell", "intermediate", ["Knee pain", "Lower back strain"]],
  ["Front squat", "Legs", "Barbell", "advanced", ["Knee pain", "Wrist sprain"]],
  ["Leg press", "Legs", "Machine", "beginner", ["Knee pain"]],
  ["Deadlift", "Back", "Barbell", "advanced", ["Lower back strain"]],
  ["Romanian deadlift", "Hamstrings", "Barbell", "intermediate", ["Lower back strain"]],
  ["Overhead press", "Shoulders", "Barbell", "intermediate", ["Shoulder impingement", "Lower back strain"]],
  ["Lateral raise", "Shoulders", "Dumbbell", "beginner", ["Shoulder impingement"]],
  ["Bench press", "Chest", "Barbell", "intermediate", ["Shoulder impingement"]],
  ["Push-up", "Chest", "Bodyweight", "beginner", ["Wrist sprain"]],
  ["Box jump", "Legs", "Box", "advanced", ["Knee pain", "Ankle sprain"]],
  ["Running", "Cardio", "None", "beginner", ["Knee pain", "Ankle sprain"]],
  ["Seated row", "Back", "Machine", "beginner", []],
  ["Lat pulldown", "Back", "Machine", "beginner", []],
  ["Chest press machine", "Chest", "Machine", "beginner", []],
  ["Bicep curl", "Arms", "Dumbbell", "beginner", []],
  ["Tricep pushdown", "Arms", "Cable", "beginner", []],
  ["Plank", "Core", "Bodyweight", "beginner", []],
  ["Stationary cycling", "Cardio", "Bike", "beginner", []],
  ["Swimming", "Cardio", "None", "beginner", []],
  ["Glute bridge", "Glutes", "Bodyweight", "beginner", []],
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  for (const [name, bodyPart, description] of injuries) {
    await client.query(
      `INSERT INTO injuries (name, body_part, description) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [name, bodyPart, description]
    );
  }

  for (const [name, muscle, equipment, difficulty] of exercises) {
    await client.query(
      `INSERT INTO exercises (name, muscle_group, equipment, difficulty) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [name, muscle, equipment, difficulty]
    );
  }

  for (const [name, , , , strains] of exercises) {
    for (const injury of strains) {
      await client.query(
        `INSERT INTO exercise_injuries (exercise_id, injury_id)
         SELECT e.exercise_id, i.injury_id
           FROM exercises e, injuries i
          WHERE e.name = $1 AND i.name = $2
         ON CONFLICT DO NOTHING`,
        [name, injury]
      );
    }
  }

  await client.query("COMMIT");

  const counts = await client.query(`
    SELECT (SELECT count(*) FROM injuries)          AS injuries,
           (SELECT count(*) FROM exercises)         AS exercises,
           (SELECT count(*) FROM exercise_injuries) AS links`);

  const { injuries: i, exercises: e, links: l } = counts.rows[0];
  console.log(`injuries ${i}, exercises ${e}, exercise-injury links ${l}`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
