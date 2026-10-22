// Removes the rows verify-report.sh creates, so it can be re-run against the
// same seed data without the counts drifting.
//
// Run with: node --env-file=.env.local scripts/verify-cleanup.mjs

import { Client } from "pg";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const users = await client.query("DELETE FROM users WHERE email LIKE $1", [
    "report.%@eirene.test",
  ]);

  // The tests log one safe workout. Scoped by time rather than id because the
  // id is not known here; ten minutes is longer than a run takes and shorter
  // than the gap to any real activity.
  const logs = await client.query(
    "DELETE FROM workout_logs WHERE created_at > now() - interval '10 minutes'"
  );

  const left = await client.query(
    `SELECT (SELECT count(*)::int FROM workout_logs)  AS workout_logs,
            (SELECT count(*)::int FROM users)         AS users,
            (SELECT count(*)::int FROM progress_logs) AS progress_logs`
  );

  const { workout_logs, users: userCount, progress_logs } = left.rows[0];
  console.log(`   removed ${users.rowCount} test account(s) and ${logs.rowCount} test log(s)`);
  console.log(`   seed data: ${workout_logs} workout_logs, ${userCount} users, ${progress_logs} progress_logs`);
} finally {
  await client.end();
}
